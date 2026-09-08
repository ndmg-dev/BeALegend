from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import FinanceTransaction, Habit, HabitCheckin, MealLog, Session
from app.routers.routine import habit_is_due
from app.schemas.notifications import WeeklySummaryOut
from app.schemas.partner import PartnerSummaryOut


async def build_weekly_summary(
    session: AsyncSession, user_id, today: date, *, explicit_user: bool = False
) -> WeeklySummaryOut:
    start = today - timedelta(days=today.weekday())
    end = start + timedelta(days=6)

    def owned(model):
        return model.user_id == user_id if explicit_user else True

    sessions = list(
        await session.scalars(
            select(Session).where(
                owned(Session),
                Session.data.between(start, end),
                Session.status == "concluida",
                Session.deleted_at.is_(None),
            )
        )
    )
    meals = list(
        await session.scalars(
            select(MealLog).where(
                owned(MealLog), MealLog.data.between(start, end), MealLog.deleted_at.is_(None)
            )
        )
    )
    expenses = list(
        await session.scalars(
            select(FinanceTransaction).where(
                owned(FinanceTransaction),
                FinanceTransaction.data.between(start, end),
                FinanceTransaction.tipo == "despesa",
                FinanceTransaction.deleted_at.is_(None),
            )
        )
    )
    habits = list(
        await session.scalars(
            select(Habit).where(owned(Habit), Habit.ativo.is_(True), Habit.deleted_at.is_(None))
        )
    )
    checkins = list(
        await session.scalars(
            select(HabitCheckin).where(
                owned(HabitCheckin),
                HabitCheckin.data.between(start, end),
                HabitCheckin.concluido.is_(True),
                HabitCheckin.deleted_at.is_(None),
            )
        )
    )

    expected = {
        (habit.id, start + timedelta(days=offset))
        for offset in range(7)
        for habit in habits
        if habit_is_due(habit, start + timedelta(days=offset))
    }
    completed = {
        (checkin.habit_id, checkin.data)
        for checkin in checkins
        if (checkin.habit_id, checkin.data) in expected
    }
    adherence_points = sum(
        100 if meal.aderencia == "dentro" else 50 if meal.aderencia == "parcial" else 0
        for meal in meals
    )
    adherence = round(adherence_points / len(meals)) if meals else 0
    return WeeklySummaryOut(
        inicio=start,
        fim=end,
        treinos_concluidos=len(sessions),
        refeicoes_registradas=len(meals),
        aderencia_percentual=adherence,
        gasto_centavos=sum(item.valor_centavos for item in expenses),
        habitos_concluidos=len(completed),
        habitos_previstos=len(expected),
    )


async def build_partner_summary(
    session: AsyncSession, partner_id, today: date
) -> PartnerSummaryOut:
    """O resumo semanal do parceiro — mesma janela e mesmas contas de
    `build_weekly_summary`, mas sem finanças: a RLS de `finance_transaction`
    não foi estendida para vínculo de parceiro (ver migration 0012), e mesmo
    que fosse, gasto é o dado que a feature deliberadamente não compartilha.

    Roda sob a sessão (e a RLS) de quem pergunta, não do parceiro — o que
    faz esta função devolver silenciosamente zeros se o vínculo não estiver
    `aceito`: as policies de `session`/`meal_log`/`habit`/`habit_checkin`
    simplesmente não deixam nenhuma linha do parceiro passar.
    """
    start = today - timedelta(days=today.weekday())
    end = start + timedelta(days=6)

    sessions = list(
        await session.scalars(
            select(Session).where(
                Session.user_id == partner_id,
                Session.data.between(start, end),
                Session.status == "concluida",
                Session.deleted_at.is_(None),
            )
        )
    )
    meals = list(
        await session.scalars(
            select(MealLog).where(
                MealLog.user_id == partner_id,
                MealLog.data.between(start, end),
                MealLog.deleted_at.is_(None),
            )
        )
    )
    habits = list(
        await session.scalars(
            select(Habit).where(
                Habit.user_id == partner_id, Habit.ativo.is_(True), Habit.deleted_at.is_(None)
            )
        )
    )
    checkins = list(
        await session.scalars(
            select(HabitCheckin).where(
                HabitCheckin.user_id == partner_id,
                HabitCheckin.data.between(start, end),
                HabitCheckin.concluido.is_(True),
                HabitCheckin.deleted_at.is_(None),
            )
        )
    )

    expected = {
        (habit.id, start + timedelta(days=offset))
        for offset in range(7)
        for habit in habits
        if habit_is_due(habit, start + timedelta(days=offset))
    }
    completed = {
        (checkin.habit_id, checkin.data)
        for checkin in checkins
        if (checkin.habit_id, checkin.data) in expected
    }
    adherence_points = sum(
        100 if meal.aderencia == "dentro" else 50 if meal.aderencia == "parcial" else 0
        for meal in meals
    )
    adherence = round(adherence_points / len(meals)) if meals else 0
    return PartnerSummaryOut(
        inicio=start,
        fim=end,
        treinos_concluidos=len(sessions),
        refeicoes_registradas=len(meals),
        aderencia_percentual=adherence,
        habitos_concluidos=len(completed),
        habitos_previstos=len(expected),
    )
