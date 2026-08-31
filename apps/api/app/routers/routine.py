from datetime import timedelta

from fastapi import APIRouter
from sqlalchemy import func, select

from app.deps import CurrentUser, DbSession
from app.models import Goal, Habit, HabitCheckin, Session, WaterLog
from app.routers.training import hoje_no_fuso
from app.schemas.routine import GoalOut, GoalProgressOut, HabitTodayOut

router = APIRouter(tags=["routine"])

RRULE_WEEKDAY = ("MO", "TU", "WE", "TH", "FR", "SA", "SU")


def habit_is_due(habit: Habit, day) -> bool:
    by_day = next(
        (
            part.removeprefix("BYDAY=")
            for part in habit.frequencia_rrule.split(";")
            if part.startswith("BYDAY=")
        ),
        None,
    )
    if by_day is not None:
        return RRULE_WEEKDAY[day.weekday()] in by_day.split(",")
    return "FREQ=DAILY" in habit.frequencia_rrule


@router.get("/routine/habits/today", response_model=list[HabitTodayOut])
async def habits_today(user: CurrentUser, session: DbSession) -> list[HabitTodayOut]:
    today = hoje_no_fuso(user.timezone)
    habits = list(
        await session.scalars(
            select(Habit)
            .where(Habit.ativo.is_(True), Habit.deleted_at.is_(None))
            .order_by(Habit.nome)
        )
    )
    habits = [habit for habit in habits if habit_is_due(habit, today)]
    completed_ids = set(
        await session.scalars(
            select(HabitCheckin.habit_id).where(
                HabitCheckin.data == today,
                HabitCheckin.concluido.is_(True),
                HabitCheckin.deleted_at.is_(None),
            )
        )
    )
    return [
        HabitTodayOut(
            id=habit.id,
            nome=habit.nome,
            icone=habit.icone,
            meta_por_semana=habit.meta_por_semana,
            concluido=habit.id in completed_ids,
        )
        for habit in habits
    ]


async def _goal_value(goal: Goal, user: CurrentUser, session: DbSession) -> float:
    today = hoje_no_fuso(user.timezone)
    if goal.metrica_ref == "training.sessions.week":
        start = today - timedelta(days=today.weekday())
        value = await session.scalar(
            select(func.count(Session.id)).where(
                Session.data >= start,
                Session.data <= today,
                Session.status == "concluida",
                Session.deleted_at.is_(None),
            )
        )
        return float(value or 0)
    if goal.metrica_ref == "nutrition.water.today":
        value = await session.scalar(
            select(func.coalesce(func.sum(WaterLog.ml), 0)).where(
                WaterLog.data == today, WaterLog.deleted_at.is_(None)
            )
        )
        return float(value or 0)
    if goal.metrica_ref == "routine.habits.today":
        active_habits = list(
            await session.scalars(
                select(Habit).where(Habit.ativo.is_(True), Habit.deleted_at.is_(None))
            )
        )
        due_ids = [habit.id for habit in active_habits if habit_is_due(habit, today)]
        if not due_ids:
            return 0
        value = await session.scalar(
            select(func.count(HabitCheckin.id)).where(
                HabitCheckin.habit_id.in_(due_ids),
                HabitCheckin.data == today,
                HabitCheckin.concluido.is_(True),
                HabitCheckin.deleted_at.is_(None),
            )
        )
        return float(value or 0)
    return 0


@router.get("/goals", response_model=list[GoalProgressOut])
async def goals(user: CurrentUser, session: DbSession) -> list[GoalProgressOut]:
    active = list(
        await session.scalars(
            select(Goal)
            .where(Goal.status == "ativa", Goal.deleted_at.is_(None))
            .order_by(Goal.titulo)
        )
    )
    result = []
    for goal in active:
        output = GoalProgressOut(
            **GoalOut.model_validate(goal).model_dump(),
            atual=await _goal_value(goal, user, session),
        )
        result.append(output)
    return result
