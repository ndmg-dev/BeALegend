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
