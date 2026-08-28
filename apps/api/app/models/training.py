"""Treino: plano semanal, execução de sessão e histórico.

Faixas são numéricas, não texto — a planilha diz "2–3 séries", "8–12 reps",
mas guardar como string perde a capacidade de calcular progressão e volume.
`unidade` distingue exercícios de repetição (a maioria) dos isométricos como
prancha e farmer hold, que a planilha mede em segundos.
"""

from datetime import date
from uuid import UUID

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    SmallInteger,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, SyncMixin


class TrainingPlan(Base, SyncMixin):
    __tablename__ = "training_plan"

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True)
    user_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("app_user.id", ondelete="CASCADE"), nullable=False
    )
    nome: Mapped[str] = mapped_column(String(160), nullable=False)
    objetivo: Mapped[str | None] = mapped_column(Text, nullable=True)
    ativo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


DIAS_SEMANA = ("segunda", "terca", "quarta", "quinta", "sexta", "sabado", "domingo")
TIPOS_DIA = ("forca", "cardio", "hiit", "descanso")


class PlanDay(Base, SyncMixin):
    __tablename__ = "plan_day"
    __table_args__ = (
        CheckConstraint(f"dia_semana IN {DIAS_SEMANA}", name="ck_plan_day_dia_semana"),
        CheckConstraint(f"tipo IN {TIPOS_DIA}", name="ck_plan_day_tipo"),
        Index("ix_plan_day_user_id_plan_id", "user_id", "plan_id"),
    )

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True)
    user_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("app_user.id", ondelete="CASCADE"), nullable=False
    )
    plan_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("training_plan.id", ondelete="CASCADE"), nullable=False
    )
    dia_semana: Mapped[str] = mapped_column(String(10), nullable=False)
    tipo: Mapped[str] = mapped_column(String(10), nullable=False)
    foco: Mapped[str | None] = mapped_column(String(160), nullable=True)
    duracao_min: Mapped[str | None] = mapped_column(String(20), nullable=True)
    intensidade: Mapped[str | None] = mapped_column(String(20), nullable=True)
    observacoes: Mapped[str | None] = mapped_column(Text, nullable=True)


class CardioProtocol(Base, SyncMixin):
    """Catálogo de protocolos de cardio — global, como o de exercícios."""

    __tablename__ = "cardio_protocol"
    __table_args__ = (
        CheckConstraint(
            "(is_global AND user_id IS NULL) OR (NOT is_global AND user_id IS NOT NULL)",
            name="ck_cardio_protocol_global_xor_owned",
        ),
    )

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True)
    user_id: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("app_user.id", ondelete="CASCADE"), nullable=True
    )
    is_global: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    nome: Mapped[str] = mapped_column(String(120), nullable=False)
    aquecimento: Mapped[str | None] = mapped_column(String(80), nullable=True)
    parte_principal: Mapped[str | None] = mapped_column(String(120), nullable=True)
    recuperacao: Mapped[str | None] = mapped_column(String(80), nullable=True)
    desaquecimento: Mapped[str | None] = mapped_column(String(80), nullable=True)
    rpe_alvo: Mapped[str | None] = mapped_column(String(40), nullable=True)
    observacao: Mapped[str | None] = mapped_column(Text, nullable=True)


class PlanItem(Base, SyncMixin):
    """O que fazer num plan_day: um exercício OU um bloco de cardio, nunca os dois."""

    __tablename__ = "plan_item"
    __table_args__ = (
        CheckConstraint(
            "(exercise_id IS NOT NULL) != (cardio_protocol_id IS NOT NULL)",
            name="ck_plan_item_exercise_xor_cardio",
        ),
        CheckConstraint("unidade IN ('reps', 'segundos')", name="ck_plan_item_unidade"),
        Index("ix_plan_item_user_id_plan_day_id", "user_id", "plan_day_id"),
    )

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True)
    user_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("app_user.id", ondelete="CASCADE"), nullable=False
    )
    plan_day_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("plan_day.id", ondelete="CASCADE"), nullable=False
    )
    exercise_id: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("exercise.id", ondelete="RESTRICT"), nullable=True
    )
    cardio_protocol_id: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("cardio_protocol.id", ondelete="RESTRICT"), nullable=True
    )
    ordem: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    series_min: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    series_max: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    reps_min: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    reps_max: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    #: 'reps' para a maioria; 'segundos' para isométricos (prancha, farmer hold).
    unidade: Mapped[str] = mapped_column(String(10), nullable=False, default="reps")
    unilateral: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    rir_min: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    rir_max: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    descanso_seg: Mapped[int | None] = mapped_column(Integer, nullable=True)
    notas: Mapped[str | None] = mapped_column(Text, nullable=True)


STATUS_SESSAO = ("planejada", "em_curso", "concluida", "pulada")


class Session(Base, SyncMixin):
    __tablename__ = "session"
    __table_args__ = (
        CheckConstraint(f"status IN {STATUS_SESSAO}", name="ck_session_status"),
        Index("ix_session_user_id_data", "user_id", "data"),
    )

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True)
    user_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("app_user.id", ondelete="CASCADE"), nullable=False
    )
    plan_day_id: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("plan_day.id", ondelete="SET NULL"), nullable=True
    )
    #: Data civil no fuso do usuário — "hoje" é decisão de fuso, nunca de UTC.
    data: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[str] = mapped_column(String(12), nullable=False, default="planejada")
    duracao_real_min: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    rpe_geral: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    notas: Mapped[str | None] = mapped_column(Text, nullable=True)


class SetLog(Base, SyncMixin):
    """Uma série concluída. Append-only: nunca editado nem apagado.

    Log de treino é append-only por natureza — sobrescrever perde o dado real
    do que aconteceu naquela sessão.
    """

    __tablename__ = "set_log"
    __table_args__ = (Index("ix_set_log_user_id_session_id", "user_id", "session_id"),)

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True)
    user_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("app_user.id", ondelete="CASCADE"), nullable=False
    )
    session_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("session.id", ondelete="CASCADE"), nullable=False
    )
    exercise_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("exercise.id", ondelete="RESTRICT"), nullable=False
    )
    numero_serie: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    reps: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    carga_kg: Mapped[float] = mapped_column(Numeric(6, 2), nullable=False)
    rir: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    concluido_em: Mapped[str] = mapped_column(String(30), nullable=False)


TIPOS_CARDIO = ("corrida", "bike", "caminhada")


class CardioLog(Base, SyncMixin):
    __tablename__ = "cardio_log"
    __table_args__ = (
        CheckConstraint(f"tipo IN {TIPOS_CARDIO}", name="ck_cardio_log_tipo"),
        Index("ix_cardio_log_user_id_session_id", "user_id", "session_id"),
    )

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True)
    user_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("app_user.id", ondelete="CASCADE"), nullable=False
    )
    session_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("session.id", ondelete="CASCADE"), nullable=False
    )
    protocolo_id: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("cardio_protocol.id", ondelete="SET NULL"), nullable=True
    )
    duracao_min: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    distancia_km: Mapped[float | None] = mapped_column(Numeric(5, 2), nullable=True)
    rpe: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    tipo: Mapped[str] = mapped_column(String(12), nullable=False)


TIPOS_BODY_METRIC = ("peso", "circunferencia", "foto")


class BodyMetric(Base, SyncMixin):
    __tablename__ = "body_metric"
    __table_args__ = (
        CheckConstraint(f"tipo IN {TIPOS_BODY_METRIC}", name="ck_body_metric_tipo"),
        Index("ix_body_metric_user_id_data", "user_id", "data"),
    )

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True)
    user_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("app_user.id", ondelete="CASCADE"), nullable=False
    )
    data: Mapped[date] = mapped_column(Date, nullable=False)
    tipo: Mapped[str] = mapped_column(String(20), nullable=False)
    valor: Mapped[float | None] = mapped_column(Numeric(6, 2), nullable=True)
    unidade: Mapped[str | None] = mapped_column(String(10), nullable=True)
