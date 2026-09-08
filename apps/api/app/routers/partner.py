"""Vínculo de parceiro: convite mútuo e leitura do progresso compartilhado.

O convite e a resposta são side-effects explícitos (não passam pelo
`/sync/batch` — não é dado offline de um único usuário, é uma interação
entre duas contas). A visibilidade em si não mora aqui: uma vez `aceito`, é
a RLS (`app_is_partner_of()`, migration 0012) que libera a leitura de
session/meal_log/habit/habit_checkin do parceiro. Toda query neste router
roda sob a RLS de quem pergunta — a policy de `partner_link` (requester_id
= eu OU receiver_id = eu) já garante que `session.get`/`select` nunca
devolvem o vínculo de outra dupla de usuários.
"""

import logging
from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import CurrentUser, DbSession
from app.errors import ProblemException
from app.ids import uuid7
from app.models import PartnerLink, User
from app.routers.training import hoje_no_fuso
from app.schemas.partner import PartnerInviteIn, PartnerLinkOut, PartnerSummaryOut
from app.services.push import notify_partner_accepted, notify_partner_invite
from app.services.weekly_summary import build_partner_summary

router = APIRouter(prefix="/partners", tags=["partners"])
log = logging.getLogger("bealegend.partners")


def _not_found(detail: str) -> ProblemException:
    return ProblemException(404, "Não encontrado", detail, "https://bealegend.app/problems/not-found")


async def _link_out(session: AsyncSession, link: PartnerLink, my_id: UUID) -> PartnerLinkOut:
    other_id = link.receiver_id if link.requester_id == my_id else link.requester_id
    other = await session.get(User, other_id)
    return PartnerLinkOut(
        id=link.id,
        status=link.status,
        direcao="enviado" if link.requester_id == my_id else "recebido",
        partner_email=other.email if other else "",
        criado_em=link.criado_em,
        respondido_em=link.respondido_em,
    )


@router.get("", response_model=list[PartnerLinkOut])
async def listar_vinculos(user: CurrentUser, session: DbSession) -> list[PartnerLinkOut]:
    links = list(await session.scalars(select(PartnerLink).order_by(PartnerLink.criado_em.desc())))
    return [await _link_out(session, link, user.id) for link in links]


@router.post("/invite", response_model=PartnerLinkOut, status_code=201)
async def convidar(body: PartnerInviteIn, user: CurrentUser, session: DbSession) -> PartnerLinkOut:
    email = body.email.lower()
    if email == user.email:
        raise ProblemException(
            422, "Convite inválido", "Você não pode convidar a si mesmo.",
            "https://bealegend.app/problems/invalid",
        )
    alvo = await session.scalar(select(User).where(User.email == email))
    if alvo is None:
        raise _not_found("Nenhuma conta com este e-mail.")

    existente = await session.scalar(
        select(PartnerLink).where(
            PartnerLink.status.in_(("pendente", "aceito")),
            or_(
                (PartnerLink.requester_id == user.id) & (PartnerLink.receiver_id == alvo.id),
                (PartnerLink.requester_id == alvo.id) & (PartnerLink.receiver_id == user.id),
            ),
        )
    )
    if existente is not None:
        raise ProblemException(
            409, "Vínculo já existe",
            "Já existe um convite pendente ou aceito entre vocês dois.",
            "https://bealegend.app/problems/conflict",
        )

    link = PartnerLink(id=uuid7(), requester_id=user.id, receiver_id=alvo.id, status="pendente")
    session.add(link)
    await session.commit()
    await session.refresh(link)

    try:
        await notify_partner_invite(alvo.id, user.email, link.id, link.criado_em)
    except Exception:
        # Push e' best-effort: o convite ja' foi criado e comitado, uma
        # falha de rede/VAPID aqui nao pode derrubar a resposta do endpoint.
        log.warning("falha ao notificar convite de parceiro", exc_info=True)

    return await _link_out(session, link, user.id)


async def _meu_convite_recebido(session: AsyncSession, user: User, link_id: UUID) -> PartnerLink:
    link = await session.get(PartnerLink, link_id)
    if link is None or link.receiver_id != user.id:
        raise _not_found("Convite não encontrado.")
    if link.status != "pendente":
        raise ProblemException(
            409, "Convite já respondido", "Este convite não está mais pendente.",
            "https://bealegend.app/problems/conflict",
        )
    return link


@router.post("/{link_id}/accept", response_model=PartnerLinkOut)
async def aceitar(link_id: UUID, user: CurrentUser, session: DbSession) -> PartnerLinkOut:
    link = await _meu_convite_recebido(session, user, link_id)
    link.status = "aceito"
    link.respondido_em = datetime.now(UTC)
    await session.commit()
    await session.refresh(link)

    try:
        await notify_partner_accepted(link.requester_id, user.email, link.id, link.respondido_em)
    except Exception:
        log.warning("falha ao notificar aceite de parceiro", exc_info=True)

    return await _link_out(session, link, user.id)


@router.post("/{link_id}/decline", response_model=PartnerLinkOut)
async def recusar(link_id: UUID, user: CurrentUser, session: DbSession) -> PartnerLinkOut:
    link = await _meu_convite_recebido(session, user, link_id)
    link.status = "recusado"
    link.respondido_em = datetime.now(UTC)
    await session.commit()
    await session.refresh(link)
    return await _link_out(session, link, user.id)


@router.delete("/{link_id}", status_code=204)
async def revogar(link_id: UUID, user: CurrentUser, session: DbSession) -> None:
    """Cancela um convite pendente ou revoga um vínculo aceito — qualquer um
    dos dois lados pode fazer isso a qualquer momento. A policy de DELETE de
    `partner_link` já restringe a linhas em que sou requester ou receiver;
    `session.get` some sozinho se o vínculo for de outra dupla."""
    link = await session.get(PartnerLink, link_id)
    if link is None:
        raise _not_found("Vínculo não encontrado.")
    await session.delete(link)
    await session.commit()


@router.get("/{link_id}/summary", response_model=PartnerSummaryOut)
async def resumo_do_parceiro(
    link_id: UUID, user: CurrentUser, session: DbSession
) -> PartnerSummaryOut:
    link = await session.get(PartnerLink, link_id)
    if link is None or link.status != "aceito":
        raise _not_found("Vínculo não encontrado ou ainda não aceito.")
    partner_id = link.receiver_id if link.requester_id == user.id else link.requester_id
    return await build_partner_summary(session, partner_id, hoje_no_fuso(user.timezone))
