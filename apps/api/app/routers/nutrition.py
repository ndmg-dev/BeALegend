from datetime import date, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy import func, select

from app.deps import CurrentUser, DbSession
from app.errors import ProblemException
from app.models import (
    BodyMetric,
    FoodItem,
    MealLog,
    MealPlan,
    MealSlot,
    MealSlotItem,
    NutritionTarget,
    Supplement,
    WaterLog,
)
from app.routers.training import hoje_no_fuso
from app.schemas.nutrition import (
    FoodItemOut,
    MealLogOut,
    MealPlanOut,
    MealSlotItemOut,
    MealSlotOut,
    NutritionDayOut,
    NutritionInsightOut,
    NutritionTargetOut,
    SupplementOut,
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


@router.get("/plan", response_model=MealPlanOut)
async def meal_plan(user: CurrentUser, session: DbSession) -> MealPlanOut:
    """O plano alimentar ativo, inteiro — o que a planilha de dieta virou.

    Sem filtro por ``user_id`` nas queries: quem filtra é a RLS. O catálogo
    de alimentos e suplementos é global, então a policy deixa passar as linhas
    ``is_global`` além das do próprio usuário.
    """
    plano = await session.scalar(
        select(MealPlan).where(MealPlan.ativo.is_(True), MealPlan.deleted_at.is_(None))
    )
    if plano is None:
        raise ProblemException(
            404,
            "Sem plano alimentar",
            "Nenhum plano alimentar ativo. Rode o seed da planilha de dieta.",
            "https://bealegend.app/problems/not-found",
        )

    slots = list(
        await session.scalars(
            select(MealSlot)
            .where(MealSlot.meal_plan_id == plano.id, MealSlot.deleted_at.is_(None))
            .order_by(MealSlot.ordem)
        )
    )
    itens = list(
        await session.scalars(
            select(MealSlotItem)
            .where(
                MealSlotItem.meal_slot_id.in_([slot.id for slot in slots] or [None]),
                MealSlotItem.deleted_at.is_(None),
            )
            .order_by(MealSlotItem.ordem)
        )
    )
    alimentos = list(
        await session.scalars(
            select(FoodItem).where(FoodItem.deleted_at.is_(None)).order_by(FoodItem.nome)
        )
    )
    suplementos = list(
        await session.scalars(
            select(Supplement).where(Supplement.deleted_at.is_(None)).order_by(Supplement.ordem)
        )
    )
    meta = await session.scalar(
        select(NutritionTarget).where(
            NutritionTarget.meal_plan_id == plano.id, NutritionTarget.deleted_at.is_(None)
        )
    )
    peso = await session.scalar(
        select(BodyMetric.valor)
        .where(
            BodyMetric.tipo == "peso",
            BodyMetric.valor.is_not(None),
            BodyMetric.deleted_at.is_(None),
        )
        .order_by(BodyMetric.data.desc())
        .limit(1)
    )

    return MealPlanOut(
        nome=plano.nome,
        slots=[MealSlotOut.model_validate(slot) for slot in slots],
        itens=[MealSlotItemOut.model_validate(item) for item in itens],
        alimentos=[FoodItemOut.model_validate(a) for a in alimentos],
        suplementos=[SupplementOut.model_validate(s) for s in suplementos],
        meta=NutritionTargetOut.model_validate(meta) if meta else None,
        peso_kg=float(peso) if peso is not None else None,
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
