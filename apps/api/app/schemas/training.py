from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

# --------------------------------------------------------------------------
# Leitura — plano semanal (somente leitura pelo cliente; o seed escreve)
# --------------------------------------------------------------------------


class CardioProtocolOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    nome: str
    aquecimento: str | None
    parte_principal: str | None
    recuperacao: str | None
    desaquecimento: str | None
    rpe_alvo: str | None
    observacao: str | None
    row_version: int
    deleted_at: datetime | None


class PlanItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    plan_day_id: UUID
    exercise_id: UUID | None
    cardio_protocol_id: UUID | None
    ordem: int
    series_min: int | None
    series_max: int | None
    reps_min: int | None
    reps_max: int | None
    unidade: str
    unilateral: bool
    rir_min: int | None
    rir_max: int | None
    descanso_seg: int | None
    notas: str | None
    row_version: int
    deleted_at: datetime | None


class PlanDayOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    plan_id: UUID
    dia_semana: str
    tipo: str
    foco: str | None
    duracao_min: str | None
    intensidade: str | None
    observacoes: str | None
    row_version: int
    deleted_at: datetime | None


class PlanDayComItens(PlanDayOut):
    itens: list[PlanItemOut] = Field(default_factory=list)


class TrainingPlanOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    nome: str
    objetivo: str | None
    ativo: bool
    row_version: int
    deleted_at: datetime | None


class TrainingPlanComDias(TrainingPlanOut):
    dias: list[PlanDayComItens] = Field(default_factory=list)


# --------------------------------------------------------------------------
# Sessão — escrita via /sync/batch
# --------------------------------------------------------------------------


class SessionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    plan_day_id: UUID | None
    data: date
    status: str
    duracao_real_min: int | None
    rpe_geral: int | None
    notas: str | None
    row_version: int
    deleted_at: datetime | None


class SessionCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: UUID | None = None
    plan_day_id: UUID | None = None
    data: date
    status: str = Field(default="planejada", pattern="^(planejada|em_curso|concluida|pulada)$")


class SessionPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: str | None = Field(default=None, pattern="^(planejada|em_curso|concluida|pulada)$")
    duracao_real_min: int | None = None
    rpe_geral: int | None = Field(default=None, ge=1, le=10)
    notas: str | None = None


# --------------------------------------------------------------------------
# SetLog — append-only, escrita via /sync/batch
# --------------------------------------------------------------------------


class SetLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    session_id: UUID
    exercise_id: UUID
    numero_serie: int
    reps: int
    carga_kg: float
    rir: int | None
    concluido_em: str
    row_version: int
    deleted_at: datetime | None


class SetLogCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: UUID | None = None
    session_id: UUID
    exercise_id: UUID
    numero_serie: int = Field(ge=1, le=20)
    reps: int = Field(ge=0, le=200)
    carga_kg: float = Field(ge=0, le=500)
    rir: int | None = Field(default=None, ge=0, le=10)
    concluido_em: str


# --------------------------------------------------------------------------
# CardioLog
# --------------------------------------------------------------------------


class CardioLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    session_id: UUID
    protocolo_id: UUID | None
    duracao_min: int
    distancia_km: float | None
    rpe: int | None
    tipo: str
    row_version: int
    deleted_at: datetime | None


class CardioLogCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: UUID | None = None
    session_id: UUID
    protocolo_id: UUID | None = None
    duracao_min: int = Field(ge=1, le=600)
    distancia_km: float | None = Field(default=None, ge=0, le=500)
    rpe: int | None = Field(default=None, ge=1, le=10)
    tipo: str = Field(pattern="^(corrida|bike|caminhada)$")


class CardioLogPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    duracao_min: int | None = Field(default=None, ge=1, le=600)
    distancia_km: float | None = Field(default=None, ge=0, le=500)
    rpe: int | None = Field(default=None, ge=1, le=10)


# --------------------------------------------------------------------------
# BodyMetric
# --------------------------------------------------------------------------


class BodyMetricOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    data: date
    tipo: str
    valor: float | None
    unidade: str | None
    row_version: int
    deleted_at: datetime | None


class BodyMetricCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: UUID | None = None
    data: date
    tipo: str = Field(pattern="^(peso|circunferencia|foto)$")
    valor: float | None = Field(default=None, ge=0, le=999)
    unidade: str | None = Field(default=None, max_length=10)
