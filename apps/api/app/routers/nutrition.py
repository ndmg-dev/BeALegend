from datetime import date, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy import func, select

from app.deps import CurrentUser, DbSession
from app.models import MealLog, MealPlan, MealSlot, WaterLog
from app.routers.training import hoje_no_fuso
from app.schemas.nutrition import (
    MealLogOut,
    MealSlotOut,
    NutritionDayOut,
    NutritionInsightOut,
)
from app.services.insights import (
    InsightProvider,
    gerar_insight_diario,
    gerar_insight_semanal,
    get_insight_provider,
)

InsightProviderDep = Annotated[InsightProvider, Depends(get_insight_provider)]

router = APIRouter(prefix="/nutrition", tags=["nutrition"])


@router.get("/day/{day}", response_model=NutritionDayOut)
async def nutrition_day(day: date, user: CurrentUser, session: DbSession) -> NutritionDayOut:
    plan = await session.scalar(
        select(MealPlan).where(MealPlan.ativo.is_(True), MealPlan.deleted_at.is_(None))
    )
    slots: list[MealSlot] = []
    if plan:
        slots = list(
            await session.scalars(
                select(MealSlot)
                .where(MealSlot.meal_plan_id == plan.id, MealSlot.deleted_at.is_(None))
                .order_by(MealSlot.ordem)
            )
        )
    meals = list(
        await session.scalars(
            select(MealLog)
            .where(MealLog.data == day, MealLog.deleted_at.is_(None))
            .order_by(MealLog.horario)
        )
    )
    water = await session.scalar(
        select(func.coalesce(func.sum(WaterLog.ml), 0)).where(
            WaterLog.data == day, WaterLog.deleted_at.is_(None)
        )
    )
    return NutritionDayOut(
        data=day,
        slots=[MealSlotOut.model_validate(slot) for slot in slots],
        refeicoes=[MealLogOut.model_validate(meal) for meal in meals],
        agua_ml=int(water or 0),
    )


def _semana_inicio(dia: date) -> date:
    return dia - timedelta(days=dia.weekday())


#: Quando não há insight: feature desligada, opt-in off, sem dados ou erro do provider.
_SEM_INSIGHT = {204: {"description": "Sem insight disponível"}}


@router.get("/insight/today", response_model=NutritionInsightOut, responses=_SEM_INSIGHT)
async def nutrition_insight_today(
    user: CurrentUser, session: DbSession, provider: InsightProviderDep
) -> NutritionInsightOut | Response:
    dia = hoje_no_fuso(user.timezone)
    insight = await gerar_insight_diario(session, user.id, dia, provider)
    if insight is None:
        return Response(status_code=204)
    return NutritionInsightOut.model_validate(insight)


@router.get("/insight/weekly", response_model=NutritionInsightOut, responses=_SEM_INSIGHT)
async def nutrition_insight_weekly(
    user: CurrentUser,
    session: DbSession,
    provider: InsightProviderDep,
    semana: Annotated[
        date | None, Query(description="Qualquer dia da semana desejada")
    ] = None,
) -> NutritionInsightOut | Response:
    inicio = _semana_inicio(semana or hoje_no_fuso(user.timezone))
    insight = await gerar_insight_semanal(session, user.id, inicio, provider)
    if insight is None:
        return Response(status_code=204)
    return NutritionInsightOut.model_validate(insight)
