from datetime import date

from fastapi import APIRouter
from sqlalchemy import func, select

from app.deps import CurrentUser, DbSession
from app.models import MealLog, MealPlan, MealSlot, WaterLog
from app.schemas.nutrition import MealLogOut, MealSlotOut, NutritionDayOut

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
