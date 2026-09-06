from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class MealPlanCreate(StrictModel):
    id: UUID | None = None
    nome: str = Field(min_length=1, max_length=120)
    ativo: bool = True


class MealPlanPatch(StrictModel):
    nome: str | None = Field(default=None, min_length=1, max_length=120)
    ativo: bool | None = None


class MealSlotCreate(StrictModel):
    id: UUID | None = None
    meal_plan_id: UUID
    nome: str = Field(min_length=1, max_length=80)
    horario_alvo: str | None = Field(default=None, pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    descricao: str | None = Field(default=None, max_length=240)
    ordem: int = Field(default=0, ge=0, le=50)


class MealSlotPatch(StrictModel):
    nome: str | None = Field(default=None, min_length=1, max_length=80)
    horario_alvo: str | None = Field(default=None, pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    descricao: str | None = Field(default=None, max_length=240)
    ordem: int | None = Field(default=None, ge=0, le=50)


class MealLogCreate(StrictModel):
    id: UUID | None = None
    data: date
    slot_id: UUID | None = None
    horario: str = Field(pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    descricao: str = Field(min_length=1, max_length=240)
    foto_url: str | None = Field(default=None, max_length=1_500_000)
    aderencia: str = Field(pattern="^(dentro|parcial|fora)$")
    notas: str | None = Field(default=None, max_length=2000)
    tags: list[str] = Field(default_factory=list, max_length=20)


class MealLogPatch(StrictModel):
    horario: str | None = Field(default=None, pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    descricao: str | None = Field(default=None, min_length=1, max_length=240)
    foto_url: str | None = Field(default=None, max_length=1_500_000)
    aderencia: str | None = Field(default=None, pattern="^(dentro|parcial|fora)$")
    notas: str | None = Field(default=None, max_length=2000)
    tags: list[str] | None = Field(default=None, max_length=20)


class WaterLogCreate(StrictModel):
    id: UUID | None = None
    data: date
    ml: int = Field(gt=0, le=5000)
    registrado_em: str = Field(min_length=20, max_length=30)


class MealSlotOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    nome: str
    horario_alvo: str | None
    descricao: str | None
    ordem: int


class MealLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    data: date
    slot_id: UUID | None
    horario: str
    descricao: str
    foto_url: str | None
    aderencia: str
    notas: str | None
    tags: list[str]


class NutritionDayOut(BaseModel):
    data: date
    slots: list[MealSlotOut]
    refeicoes: list[MealLogOut]
    agua_ml: int


class NutritionInsightOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    tipo: str
    periodo_ref: date
    texto: str
    gerado_em: datetime


class FoodItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    nome: str
    kcal: float
    proteina_g: float
    carboidrato_g: float
    gordura_g: float
    fibra_g: float
    referencia_pratica: str | None
    fonte: str | None
    conferir_rotulo: bool


class MealSlotItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    meal_slot_id: UUID
    food_item_id: UUID
    quantidade_g: float | None
    ordem: int
    observacao: str | None


class NutritionTargetOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    proteina_g_kg: float
    gordura_g_kg: float
    fibra_g_por_1000kcal: float
    fator_atividade: float
    ajuste_calorico: float
    manutencao_kcal_manual: int | None
    sexo: str | None
    idade: int | None
    altura_cm: int | None


class SupplementOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    nome: str
    como_usar: str | None
    faixa: str | None
    horario: str | None
    observar: str | None
    fonte: str | None
    status: str | None
    ordem: int


class MealPlanOut(BaseModel):
    """O plano alimentar inteiro, do jeito que a tela precisa dele.

    Vem em uma resposta só porque a tela mostra tudo junto: sem a base de
    alimentos os itens da refeição são só ids, e sem a meta não há régua.
    """

    nome: str
    slots: list[MealSlotOut]
    itens: list[MealSlotItemOut]
    alimentos: list[FoodItemOut]
    suplementos: list[SupplementOut]
    meta: NutritionTargetOut | None
    #: Peso mais recente do body_metric — entra no cálculo de proteína/gordura.
    peso_kg: float | None
