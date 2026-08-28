from datetime import date
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class HabitCreate(StrictModel):
    id: UUID | None = None
    nome: str = Field(min_length=1, max_length=120)
    icone: str | None = Field(default=None, max_length=30)
    frequencia_rrule: str = Field(default="FREQ=DAILY", min_length=4, max_length=300)
    meta_por_semana: int = Field(default=7, ge=1, le=7)
    ativo: bool = True


class HabitPatch(StrictModel):
    nome: str | None = Field(default=None, min_length=1, max_length=120)
    icone: str | None = Field(default=None, max_length=30)
    frequencia_rrule: str | None = Field(default=None, min_length=4, max_length=300)
    meta_por_semana: int | None = Field(default=None, ge=1, le=7)
    ativo: bool | None = None


class HabitCheckinCreate(StrictModel):
    id: UUID | None = None
    habit_id: UUID
    data: date
    concluido: bool = True
    valor: float | None = None


class HabitCheckinPatch(StrictModel):
    concluido: bool | None = None
    valor: float | None = None


class GoalCreate(StrictModel):
    id: UUID | None = None
    titulo: str = Field(min_length=1, max_length=160)
    dominio: str = Field(pattern="^(treino|nutricao|financas|rotina)$")
    tipo: str = Field(pattern="^(numerica|binaria|habito)$")
    alvo: float = Field(gt=0, le=10**12)
    unidade: str | None = Field(default=None, max_length=30)
    prazo: date | None = None
    metrica_ref: str = Field(min_length=1, max_length=100)
    status: str = Field(default="ativa", pattern="^(ativa|concluida|arquivada)$")


class GoalPatch(StrictModel):
    titulo: str | None = Field(default=None, min_length=1, max_length=160)
    alvo: float | None = Field(default=None, gt=0, le=10**12)
    prazo: date | None = None
    status: str | None = Field(default=None, pattern="^(ativa|concluida|arquivada)$")


class HabitTodayOut(BaseModel):
    id: UUID
    nome: str
    icone: str | None
    meta_por_semana: int
    concluido: bool


class GoalOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    titulo: str
    dominio: str
    tipo: str
    alvo: float
    unidade: str | None
    prazo: date | None
    metrica_ref: str
    status: str


class GoalProgressOut(GoalOut):
    atual: float
