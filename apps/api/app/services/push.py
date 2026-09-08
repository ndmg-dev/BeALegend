import asyncio
import json
import logging
from datetime import UTC, date, datetime, time
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pywebpush import WebPushException, webpush
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.config import get_settings
from app.ids import uuid7
from app.models import (
    MealLog,
    MealPlan,
    MealSlot,
    NotificationDelivery,
    NotificationPreference,
    PlanDay,
    PushSubscription,
    TrainingPlan,
    User,
)
from app.routers.training import DIAS_PY_PARA_PT
from app.services.weekly_summary import build_weekly_summary

log = logging.getLogger("bealegend.push")
settings = get_settings()


def schedule_matches(local_now: datetime, target: time) -> bool:
    return local_now.hour == target.hour and local_now.minute == target.minute


def _local_now(now: datetime, timezone: str) -> datetime:
    try:
        return now.astimezone(ZoneInfo(timezone))
    except ZoneInfoNotFoundError:
        log.warning("timezone invalido para push", extra={"timezone": timezone})
        return now.astimezone(UTC)


async def _send_once(
    session: AsyncSession,
    subscription: PushSubscription,
    kind: str,
    scheduled_for: datetime,
    payload: dict[str, str],
) -> bool:
    exists = await session.scalar(
        select(NotificationDelivery.id).where(
            NotificationDelivery.subscription_id == subscription.id,
            NotificationDelivery.kind == kind,
            NotificationDelivery.scheduled_for == scheduled_for,
        )
    )
    if exists:
        return False
    delivery = NotificationDelivery(
        id=uuid7(),
        user_id=subscription.user_id,
        subscription_id=subscription.id,
        kind=kind,
        scheduled_for=scheduled_for,
        payload=payload,
        status="pending",
        criado_em=datetime.now(UTC),
    )
    session.add(delivery)
    await session.commit()
    try:
        await asyncio.to_thread(
            webpush,
            subscription_info={
                "endpoint": subscription.endpoint,
                "keys": {"p256dh": subscription.p256dh, "auth": subscription.auth},
            },
            data=json.dumps(payload),
            vapid_private_key=settings.vapid_private_key,
            vapid_claims={"sub": settings.vapid_subject},
            timeout=10,
        )
    except WebPushException as exc:
        status = getattr(exc.response, "status_code", None)
        subscription.failure_count += 1
        if status in (404, 410):
            subscription.active = False
            delivery.status = "expired"
        else:
            delivery.status = "failed"
        delivery.error = str(exc)[:500]
        await session.commit()
        log.warning("falha no Web Push", extra={"status": status, "kind": kind})
        return False
    subscription.failure_count = 0
    subscription.last_success_at = datetime.now(UTC)
    delivery.status = "sent"
    delivery.sent_at = datetime.now(UTC)
    await session.commit()
    return True


async def _training_payload(
    session: AsyncSession, user_id, local_day: date
) -> tuple[str, dict[str, str]] | None:
    day = await session.scalar(
        select(PlanDay)
        .join(TrainingPlan, TrainingPlan.id == PlanDay.plan_id)
        .where(
            TrainingPlan.user_id == user_id,
            TrainingPlan.ativo.is_(True),
            TrainingPlan.deleted_at.is_(None),
            PlanDay.dia_semana == DIAS_PY_PARA_PT[local_day.weekday()],
            PlanDay.deleted_at.is_(None),
        )
    )
    if day is None or day.tipo == "descanso":
        return None
    return (
        f"training:{day.id}",
        {
            "title": "Seu treino de hoje está pronto",
            "body": day.foco or f"Dia de {day.tipo}",
            "url": f"/treino/{day.id}" if day.tipo == "forca" else "/treino",
            "tag": "training-reminder",
        },
    )


async def _meal_payloads(
    session: AsyncSession, user_id, local_day: date, local_now: datetime
) -> list[tuple[str, dict[str, str]]]:
    slots = list(
        await session.scalars(
            select(MealSlot)
            .join(MealPlan, MealPlan.id == MealSlot.meal_plan_id)
            .where(
                MealPlan.user_id == user_id,
                MealPlan.ativo.is_(True),
                MealPlan.deleted_at.is_(None),
                MealSlot.deleted_at.is_(None),
            )
        )
    )
    logged_ids = set(
        await session.scalars(
            select(MealLog.slot_id).where(
                MealLog.user_id == user_id,
                MealLog.data == local_day,
                MealLog.deleted_at.is_(None),
            )
        )
    )
    result = []
    for slot in slots:
        if not slot.horario_alvo or slot.id in logged_ids:
            continue
        hour, minute = map(int, slot.horario_alvo.split(":")[:2])
        if schedule_matches(local_now, time(hour, minute)):
            result.append(
                (
                    f"meal:{slot.id}",
                    {
                        "title": f"Hora de {slot.nome.lower()}",
                        "body": slot.descricao or "Registre sua refeição quando terminar.",
                        "url": "/comer",
                        "tag": f"meal-{slot.id}",
                    },
                )
            )
    return result


async def _notify_user(
    session: AsyncSession,
    user_id: UUID,
    *,
    enabled_field: str,
    kind: str,
    scheduled_for: datetime,
    payload: dict[str, str],
) -> int:
    """Núcleo comum a todo push disparado por um evento pontual (não pelo
    `dispatch_due_notifications` agendado): checa VAPID, a preferência do
    usuário (campo `enabled_field` em `NotificationPreference` — ausência de
    linha vale como permitido, mesmo default do resto do app) e as
    assinaturas ativas, depois envia via `_send_once` — que é quem garante a
    deduplicação por `(subscription_id, kind, scheduled_for)`.
    """
    if not settings.vapid_private_key or not settings.vapid_public_key:
        return 0

    preference = await session.get(NotificationPreference, user_id)
    if preference is not None and not getattr(preference, enabled_field):
        return 0

    subscriptions = list(
        await session.scalars(
            select(PushSubscription).where(
                PushSubscription.user_id == user_id, PushSubscription.active.is_(True)
            )
        )
    )
    if not subscriptions:
        return 0

    sent = 0
    for subscription in subscriptions:
        sent += int(await _send_once(session, subscription, kind, scheduled_for, payload))
    return sent


async def notify_achievement_unlock(
    session: AsyncSession, user_id: UUID, achievement_key: str, desbloqueado_em: datetime
) -> int:
    """Push de "conquista desbloqueada" — chamado pelo router de sync logo
    após um `achievement_unlock` ser aplicado.

    Não porta o catálogo (nomes/tiers) para o servidor: o payload é genérico
    de propósito e a tela de conquistas é quem explica qual foi ao abrir. O
    catálogo é dado versionado no cliente (`domain/achievements/catalog.ts`);
    duplicá-lo aqui criaria uma segunda fonte de verdade para manter em sync.

    `scheduled_for=desbloqueado_em` é a chave de deduplicação: estável por
    desbloqueio (o `achievement_key` é único por usuário), então um reenvio
    da mesma operação de sync — outbox reconstruída, retry após timeout —
    nunca dispara um segundo push.
    """
    return await _notify_user(
        session, user_id,
        enabled_field="conquista_enabled",
        kind=f"achievement:{achievement_key}",
        scheduled_for=desbloqueado_em,
        payload={
            "title": "Conquista desbloqueada!",
            "body": "Toque para ver qual foi.",
            "url": "/conquistas",
            "tag": f"achievement-{achievement_key}",
        },
    )


async def _notify_other_user(
    user_id: UUID,
    *,
    enabled_field: str,
    kind: str,
    scheduled_for: datetime,
    payload: dict[str, str],
) -> int:
    """Como `_notify_user`, mas abre a própria sessão como OWNER (bypassa
    RLS) em vez de reusar a do request.

    Convite e aceite de parceiro são disparados por **outra** conta, não
    pela dona da assinatura de push: a sessão do endpoint que processou o
    convite está com `app.user_id` = quem convidou, e a policy de
    `push_subscription`/`notification_preference` só deixa cada um ler a
    própria linha. Não dá pra "pegar emprestada" a sessão do request —
    precisa da mesma saída que `POST /internal/tick` já usa (motor próprio
    com a URL do owner, descartado no fim). Evento raro (convite/aceite),
    não um hot path: abrir e fechar um engine aqui custa bem menos do que
    fazer isso a cada minuto, que é o que o cron já faz.
    """
    engine = create_async_engine(
        get_settings().database_owner_url,
        poolclass=NullPool,
        connect_args={"statement_cache_size": 0},
    )
    OwnerSession = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with OwnerSession() as session:
            return await _notify_user(
                session, user_id,
                enabled_field=enabled_field, kind=kind,
                scheduled_for=scheduled_for, payload=payload,
            )
    finally:
        await engine.dispose()


async def notify_partner_invite(
    receiver_id: UUID, requester_email: str, link_id: UUID, criado_em: datetime
) -> int:
    """Push pra quem recebeu um convite de parceiro. `scheduled_for=criado_em`
    dedupe por vínculo — reenviar o mesmo POST /partners/invite (ex.: o
    cliente retenta após timeout de rede) nunca duplica o push."""
    return await _notify_other_user(
        receiver_id,
        enabled_field="parceiro_enabled",
        kind=f"partner-invite:{link_id}",
        scheduled_for=criado_em,
        payload={
            "title": "Novo convite de parceiro",
            "body": f"{requester_email} quer acompanhar seu progresso.",
            "url": "/parceiro",
            "tag": f"partner-invite-{link_id}",
        },
    )


async def notify_partner_accepted(
    requester_id: UUID, receiver_email: str, link_id: UUID, respondido_em: datetime
) -> int:
    """Push pra quem enviou o convite, quando o outro lado aceita."""
    return await _notify_other_user(
        requester_id,
        enabled_field="parceiro_enabled",
        kind=f"partner-accept:{link_id}",
        scheduled_for=respondido_em,
        payload={
            "title": "Convite aceito!",
            "body": f"{receiver_email} aceitou acompanhar o progresso com você.",
            "url": "/parceiro",
            "tag": f"partner-accept-{link_id}",
        },
    )


async def dispatch_due_notifications(session: AsyncSession, now: datetime | None = None) -> int:
    if not settings.vapid_private_key or not settings.vapid_public_key:
        log.info("Web Push desativado: chaves VAPID ausentes")
        return 0
    now = (now or datetime.now(UTC)).astimezone(UTC)
    users = list(await session.scalars(select(User).where(User.is_active.is_(True))))
    processed = 0
    for user in users:
        subscriptions = list(
            await session.scalars(
                select(PushSubscription).where(
                    PushSubscription.user_id == user.id, PushSubscription.active.is_(True)
                )
            )
        )
        if not subscriptions:
            continue
        preference = await session.get(NotificationPreference, user.id)
        preference = preference or NotificationPreference(
            user_id=user.id,
            treino_enabled=True,
            treino_horario=time(18, 0),
            refeicao_enabled=True,
            resumo_semanal_enabled=True,
            resumo_dia_semana=6,
            resumo_horario=time(18, 0),
        )
        local_now = _local_now(now, user.timezone)
        scheduled_for = local_now.replace(second=0, microsecond=0).astimezone(UTC)
        candidates: list[tuple[str, dict[str, str]]] = []
        if preference.treino_enabled and schedule_matches(local_now, preference.treino_horario):
            training = await _training_payload(session, user.id, local_now.date())
            if training:
                candidates.append(training)
        if preference.refeicao_enabled:
            candidates.extend(await _meal_payloads(session, user.id, local_now.date(), local_now))
        if (
            preference.resumo_semanal_enabled
            and local_now.weekday() == preference.resumo_dia_semana
            and schedule_matches(local_now, preference.resumo_horario)
        ):
            summary = await build_weekly_summary(
                session, user.id, local_now.date(), explicit_user=True
            )
            candidates.append(
                (
                    "weekly-summary",
                    {
                        "title": "Seu resumo da semana",
                        "body": (
                            f"{summary.treinos_concluidos} treinos · "
                            f"{summary.aderencia_percentual}% no plano · "
                            f"{summary.habitos_concluidos}/"
                            f"{summary.habitos_previstos} hábitos"
                        ),
                        "url": "/metas",
                        "tag": "weekly-summary",
                    },
                )
            )
        for kind, payload in candidates:
            for subscription in subscriptions:
                processed += int(
                    await _send_once(session, subscription, kind, scheduled_for, payload)
                )
    return processed
