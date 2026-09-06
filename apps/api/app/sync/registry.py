"""Registro das entidades que participam do sync.

Uma unica fonte de verdade para: quais tabelas entram no delta, qual schema
valida cada operacao e quais entidades sao append-only. As fases seguintes
registram as suas aqui e nao tocam no motor de sync.
"""

from dataclasses import dataclass

from pydantic import BaseModel

from app.models.achievements import AchievementUnlock
from app.models.base import Base
from app.models.exercise import Exercise
from app.models.finance import Account, Budget, Category, FinanceTransaction, Recurring
from app.models.nutrition import (
    FoodItem,
    MealLog,
    MealPlan,
    MealSlot,
    MealSlotItem,
    NutritionTarget,
    Supplement,
    WaterLog,
)
from app.models.routine import Goal, Habit, HabitCheckin
from app.models.training import (
    BodyMetric,
    CardioLog,
    CardioProtocol,
    PlanDay,
    PlanItem,
    Session,
    SetLog,
    TrainingPlan,
)
from app.schemas.achievements import AchievementUnlockCreate
from app.schemas.exercise import ExerciseCreate, ExercisePatch
from app.schemas.finance import (
    AccountCreate,
    AccountPatch,
    BudgetCreate,
    BudgetPatch,
    CategoryCreate,
    CategoryPatch,
    RecurringCreate,
    RecurringPatch,
    TransactionCreate,
    TransactionPatch,
)
from app.schemas.nutrition import (
    MealLogCreate,
    MealLogPatch,
    MealPlanCreate,
    MealPlanPatch,
    MealSlotCreate,
    MealSlotPatch,
    WaterLogCreate,
)
from app.schemas.routine import (
    GoalCreate,
    GoalPatch,
    HabitCheckinCreate,
    HabitCheckinPatch,
    HabitCreate,
    HabitPatch,
)
from app.schemas.training import (
    BodyMetricCreate,
    CardioLogCreate,
    CardioLogPatch,
    SessionCreate,
    SessionPatch,
    SetLogCreate,
)


class OperacaoInvalida(Exception):
    """A operacao nao e permitida para esta entidade."""


@dataclass(frozen=True)
class SyncEntity:
    nome: str
    model: type[Base]
    schema_create: type[BaseModel]
    schema_patch: type[BaseModel] | None
    #: Log de treino e append-only por natureza: uma serie registrada nao e
    #: editada nem apagada. Sobrescrever um set_log perde dado que nao volta.
    append_only: bool = False
    #: Entidade que o servidor escreve (seed, admin) e o cliente so le pelo
    #: delta. plan_day/plan_item/training_plan/cardio_protocol sao assim: o
    #: plano semanal nao e editavel pelo usuario na v1.
    somente_leitura: bool = False
    #: (nome_do_campo, modelo_pai). Antes de criar, o engine confere que a
    #: linha referenciada existe *dentro da RLS do usuario atual* — a policy
    #: de SELECT ja garante que so aparece se for dele. Sem isto, um set_log
    #: poderia apontar para o session_id de outro usuario adivinhado.
    referencias: tuple[tuple[str, type[Base]], ...] = ()


REGISTRY: dict[str, SyncEntity] = {
    "exercise": SyncEntity(
        nome="exercise",
        model=Exercise,
        schema_create=ExerciseCreate,
        schema_patch=ExercisePatch,
    ),
    # Plano semanal: o seed escreve (como owner), o cliente so le pelo delta.
    "training_plan": SyncEntity(
        nome="training_plan",
        model=TrainingPlan,
        schema_create=ExerciseCreate,
        schema_patch=None,
        somente_leitura=True,
    ),
    "plan_day": SyncEntity(
        nome="plan_day",
        model=PlanDay,
        schema_create=ExerciseCreate,
        schema_patch=None,
        somente_leitura=True,
    ),
    "plan_item": SyncEntity(
        nome="plan_item",
        model=PlanItem,
        schema_create=ExerciseCreate,
        schema_patch=None,
        somente_leitura=True,
    ),
    "cardio_protocol": SyncEntity(
        nome="cardio_protocol",
        model=CardioProtocol,
        schema_create=ExerciseCreate,
        schema_patch=None,
        somente_leitura=True,
    ),
    "session": SyncEntity(
        nome="session",
        model=Session,
        schema_create=SessionCreate,
        schema_patch=SessionPatch,
    ),
    "set_log": SyncEntity(
        nome="set_log",
        model=SetLog,
        schema_create=SetLogCreate,
        schema_patch=None,
        append_only=True,
        referencias=(("session_id", Session),),
    ),
    "cardio_log": SyncEntity(
        nome="cardio_log",
        model=CardioLog,
        schema_create=CardioLogCreate,
        schema_patch=CardioLogPatch,
        referencias=(("session_id", Session),),
    ),
    "body_metric": SyncEntity(
        nome="body_metric",
        model=BodyMetric,
        schema_create=BodyMetricCreate,
        schema_patch=None,
    ),
    "account": SyncEntity(
        nome="account",
        model=Account,
        schema_create=AccountCreate,
        schema_patch=AccountPatch,
    ),
    "category": SyncEntity(
        nome="category",
        model=Category,
        schema_create=CategoryCreate,
        schema_patch=CategoryPatch,
        referencias=(("pai_id", Category),),
    ),
    "recurring": SyncEntity(
        nome="recurring",
        model=Recurring,
        schema_create=RecurringCreate,
        schema_patch=RecurringPatch,
    ),
    "transaction": SyncEntity(
        nome="transaction",
        model=FinanceTransaction,
        schema_create=TransactionCreate,
        schema_patch=TransactionPatch,
        referencias=(
            ("account_id", Account),
            ("category_id", Category),
            ("recorrente_id", Recurring),
        ),
    ),
    "budget": SyncEntity(
        nome="budget",
        model=Budget,
        schema_create=BudgetCreate,
        schema_patch=BudgetPatch,
        referencias=(("category_id", Category),),
    ),
    "meal_plan": SyncEntity(
        nome="meal_plan",
        model=MealPlan,
        schema_create=MealPlanCreate,
        schema_patch=MealPlanPatch,
    ),
    "meal_slot": SyncEntity(
        nome="meal_slot",
        model=MealSlot,
        schema_create=MealSlotCreate,
        schema_patch=MealSlotPatch,
        referencias=(("meal_plan_id", MealPlan),),
    ),
    "meal_log": SyncEntity(
        nome="meal_log",
        model=MealLog,
        schema_create=MealLogCreate,
        schema_patch=MealLogPatch,
        referencias=(("slot_id", MealSlot),),
    ),
    "water_log": SyncEntity(
        nome="water_log",
        model=WaterLog,
        schema_create=WaterLogCreate,
        schema_patch=None,
    ),
    # Dieta: o seed escreve (como owner), o cliente so le pelo delta — mesma
    # regra do plano semanal de treino.
    "food_item": SyncEntity(
        nome="food_item",
        model=FoodItem,
        schema_create=ExerciseCreate,
        schema_patch=None,
        somente_leitura=True,
    ),
    "meal_slot_item": SyncEntity(
        nome="meal_slot_item",
        model=MealSlotItem,
        schema_create=ExerciseCreate,
        schema_patch=None,
        somente_leitura=True,
    ),
    "nutrition_target": SyncEntity(
        nome="nutrition_target",
        model=NutritionTarget,
        schema_create=ExerciseCreate,
        schema_patch=None,
        somente_leitura=True,
    ),
    "supplement": SyncEntity(
        nome="supplement",
        model=Supplement,
        schema_create=ExerciseCreate,
        schema_patch=None,
        somente_leitura=True,
    ),
    "habit": SyncEntity(
        nome="habit",
        model=Habit,
        schema_create=HabitCreate,
        schema_patch=HabitPatch,
    ),
    "habit_checkin": SyncEntity(
        nome="habit_checkin",
        model=HabitCheckin,
        schema_create=HabitCheckinCreate,
        schema_patch=HabitCheckinPatch,
        referencias=(("habit_id", Habit),),
    ),
    "goal": SyncEntity(
        nome="goal",
        model=Goal,
        schema_create=GoalCreate,
        schema_patch=GoalPatch,
    ),
    # Conquista desbloqueada: nasce no cliente e nunca muda. append_only.
    "achievement_unlock": SyncEntity(
        nome="achievement_unlock",
        model=AchievementUnlock,
        schema_create=AchievementUnlockCreate,
        schema_patch=None,
        append_only=True,
    ),
}

OPERACOES = ("create", "update", "delete")


def get_entity(nome: str) -> SyncEntity:
    entidade = REGISTRY.get(nome)
    if entidade is None:
        raise OperacaoInvalida(f"Entidade desconhecida: {nome}")
    return entidade


def validar_operacao(nome: str, operacao: str) -> SyncEntity:
    """Funcao pura: decide se a operacao e legitima para a entidade.

    Testada isoladamente — e a regra que impede um bug de cliente de apagar
    um log de treino.
    """
    entidade = get_entity(nome)
    if operacao not in OPERACOES:
        raise OperacaoInvalida(f"Operacao desconhecida: {operacao}")
    if entidade.somente_leitura:
        raise OperacaoInvalida(f"'{nome}' e somente leitura: o cliente nao escreve nesta entidade.")
    if entidade.append_only and operacao != "create":
        raise OperacaoInvalida(
            f"'{nome}' e append-only: aceita apenas 'create', nunca '{operacao}'."
        )
    return entidade
