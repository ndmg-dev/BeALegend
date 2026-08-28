from fastapi import APIRouter
from sqlalchemy import func, select

from app.deps import CurrentUser, DbSession
from app.models import (
    FinanceTransaction,
    Habit,
    HabitCheckin,
    MealLog,
    MealPlan,
    MealSlot,
    PlanDay,
    TrainingPlan,
    WaterLog,
)
from app.routers.routine import habit_is_due
from app.routers.training import DIAS_PY_PARA_PT, hoje_no_fuso
from app.schemas.dashboard import DashboardTodayOut

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/today", response_model=DashboardTodayOut)
async def today_dashboard(user: CurrentUser, session: DbSession) -> DashboardTodayOut:
    today = hoje_no_fuso(user.timezone)
    day_slug = DIAS_PY_PARA_PT[today.weekday()]
    plan = await session.scalar(
        select(TrainingPlan).where(TrainingPlan.ativo.is_(True), TrainingPlan.deleted_at.is_(None))
    )
    training_day = None
    if plan:
        training_day = await session.scalar(
            select(PlanDay).where(
                PlanDay.plan_id == plan.id,
                PlanDay.dia_semana == day_slug,
                PlanDay.deleted_at.is_(None),
            )
        )
    meal_plan = await session.scalar(
        select(MealPlan).where(MealPlan.ativo.is_(True), MealPlan.deleted_at.is_(None))
    )
    slots = 0
    if meal_plan:
        slots = int(
            await session.scalar(
                select(func.count(MealSlot.id)).where(
                    MealSlot.meal_plan_id == meal_plan.id,
                    MealSlot.deleted_at.is_(None),
                )
            )
            or 0
        )
    meals = int(
        await session.scalar(
            select(func.count(MealLog.id)).where(
                MealLog.data == today, MealLog.deleted_at.is_(None)
            )
        )
        or 0
    )
    water = int(
        await session.scalar(
            select(func.coalesce(func.sum(WaterLog.ml), 0)).where(
                WaterLog.data == today, WaterLog.deleted_at.is_(None)
            )
        )
        or 0
    )
    spent = int(
        await session.scalar(
            select(func.coalesce(func.sum(FinanceTransaction.valor_centavos), 0)).where(
                FinanceTransaction.data == today,
                FinanceTransaction.tipo == "despesa",
                FinanceTransaction.deleted_at.is_(None),
            )
        )
        or 0
    )
    active_habits = list(
        await session.scalars(
            select(Habit).where(Habit.ativo.is_(True), Habit.deleted_at.is_(None))
        )
    )
    due_ids = [habit.id for habit in active_habits if habit_is_due(habit, today)]
    habits = len(due_ids)
    completed = int(
        await session.scalar(
            select(func.count(HabitCheckin.id)).where(
                HabitCheckin.habit_id.in_(due_ids),
                HabitCheckin.data == today,
                HabitCheckin.concluido.is_(True),
                HabitCheckin.deleted_at.is_(None),
            )
        )
        or 0
    )
    return DashboardTodayOut(
        data=today,
        treino_tipo=training_day.tipo if training_day else None,
        treino_foco=training_day.foco if training_day else None,
        refeicoes_feitas=meals,
        refeicoes_planejadas=slots,
        agua_ml=water,
        gasto_centavos=spent,
        habitos_concluidos=completed,
        habitos_total=habits,
    )
