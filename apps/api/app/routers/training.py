"""Leitura do plano de treino e histórico.

A escrita de sessão/set_log/cardio_log passa por ``/sync/batch`` — é a mesma
porta usada offline, então o executor de treino funciona sem diferença entre
"salvar" e "sincronizar". Estes endpoints existem para leitura pontual: a
tela de plano, o "hoje", o histórico de um exercício.
"""

from datetime import UTC, date, datetime
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import CurrentUser, DbSession
from app.errors import ProblemException
from app.models import PlanDay, PlanItem, SetLog, TrainingPlan
from app.schemas.training import PlanDayComItens, PlanItemOut, SetLogOut, TrainingPlanComDias

router = APIRouter(prefix="/training", tags=["training"])

#: Índice = Python weekday() (segunda=0 .. domingo=6), como o enum do banco.
DIAS_PY_PARA_PT = ("segunda", "terca", "quarta", "quinta", "sexta", "sabado", "domingo")


def hoje_no_fuso(timezone: str) -> date:
    """ "Hoje" é decisão de fuso, nunca de UTC nem do relógio do servidor."""
    try:
        return datetime.now(ZoneInfo(timezone)).date()
    except ZoneInfoNotFoundError:
        return datetime.now(UTC).date()


async def _itens_do_dia(session: AsyncSession, plan_day_id: UUID) -> list[PlanItemOut]:
    itens = await session.scalars(
        select(PlanItem)
        .where(PlanItem.plan_day_id == plan_day_id, PlanItem.deleted_at.is_(None))
        .order_by(PlanItem.ordem)
    )
    return [PlanItemOut.model_validate(item) for item in itens]


async def _plano_ativo_ou_none(session: AsyncSession) -> TrainingPlan | None:
    return await session.scalar(
        select(TrainingPlan).where(TrainingPlan.ativo.is_(True), TrainingPlan.deleted_at.is_(None))
    )


@router.get("/plans/active", response_model=TrainingPlanComDias)
async def plano_ativo(user: CurrentUser, session: DbSession) -> TrainingPlanComDias:
    plan = await _plano_ativo_ou_none(session)
    if plan is None:
        raise ProblemException(
            404,
            "Nenhum plano ativo",
            "Rode o seed da planilha ou crie um plano antes de treinar.",
            "https://bealegend.app/problems/not-found",
        )

    dias = list(
        await session.scalars(
            select(PlanDay).where(PlanDay.plan_id == plan.id, PlanDay.deleted_at.is_(None))
        )
    )
    ordem = {nome: i for i, nome in enumerate(DIAS_PY_PARA_PT)}
    dias.sort(key=lambda d: ordem.get(d.dia_semana, 99))

    resultado = TrainingPlanComDias.model_validate(plan)
    for dia in dias:
        dia_out = PlanDayComItens.model_validate(dia)
        dia_out.itens = await _itens_do_dia(session, dia.id)
        resultado.dias.append(dia_out)
    return resultado


@router.get("/days/today", response_model=PlanDayComItens | None)
async def dia_de_hoje(user: CurrentUser, session: DbSession) -> PlanDayComItens | None:
    plan = await _plano_ativo_ou_none(session)
    if plan is None:
        return None

    dia_semana = DIAS_PY_PARA_PT[hoje_no_fuso(user.timezone).weekday()]
    dia = await session.scalar(
        select(PlanDay).where(
            PlanDay.plan_id == plan.id,
            PlanDay.dia_semana == dia_semana,
            PlanDay.deleted_at.is_(None),
        )
    )
    if dia is None:
        return None

    dia_out = PlanDayComItens.model_validate(dia)
    dia_out.itens = await _itens_do_dia(session, dia.id)
    return dia_out


@router.get("/exercises/{exercise_id}/history", response_model=list[SetLogOut])
async def historico_do_exercicio(
    exercise_id: UUID,
    user: CurrentUser,
    session: DbSession,
    limite: int = Query(default=30, ge=1, le=200),
) -> list[SetLog]:
    """Últimas séries deste exercício — o executor usa isto para pré-preencher
    carga e reps com o valor da última sessão."""
    result = await session.scalars(
        select(SetLog)
        .where(SetLog.exercise_id == exercise_id, SetLog.deleted_at.is_(None))
        .order_by(SetLog.concluido_em.desc())
        .limit(limite)
    )
    return list(result)


__all__ = ["DIAS_PY_PARA_PT", "hoje_no_fuso", "router"]
