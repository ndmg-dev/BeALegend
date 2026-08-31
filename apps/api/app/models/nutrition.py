from datetime import date, datetime
from uuid import UUID

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, SyncMixin


class MealPlan(Base, SyncMixin):
    __tablename__ = "meal_plan"
    __table_args__ = (Index("ix_meal_plan_user_id_ativo", "user_id", "ativo"),)

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True)
    user_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("app_user.id", ondelete="CASCADE"), nullable=False
    )
    nome: Mapped[str] = mapped_column(String(120), nullable=False)
    ativo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class MealSlot(Base, SyncMixin):
    __tablename__ = "meal_slot"
    __table_args__ = (Index("ix_meal_slot_user_id_plan", "user_id", "meal_plan_id"),)

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True)
    user_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("app_user.id", ondelete="CASCADE"), nullable=False
    )
    meal_plan_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("meal_plan.id", ondelete="CASCADE"), nullable=False
    )
    nome: Mapped[str] = mapped_column(String(80), nullable=False)
    horario_alvo: Mapped[str | None] = mapped_column(String(5), nullable=True)
    descricao: Mapped[str | None] = mapped_column(String(240), nullable=True)
    ordem: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class MealLog(Base, SyncMixin):
    __tablename__ = "meal_log"
    __table_args__ = (
        CheckConstraint("aderencia IN ('dentro','parcial','fora')", name="ck_meal_log_aderencia"),
        Index("ix_meal_log_user_id_data", "user_id", "data"),
    )

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True)
    user_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("app_user.id", ondelete="CASCADE"), nullable=False
    )
    data: Mapped[date] = mapped_column(Date, nullable=False)
    slot_id: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("meal_slot.id", ondelete="SET NULL"), nullable=True
    )
    horario: Mapped[str] = mapped_column(String(5), nullable=False)
    descricao: Mapped[str] = mapped_column(String(240), nullable=False)
    foto_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    aderencia: Mapped[str] = mapped_column(String(8), nullable=False)
    notas: Mapped[str | None] = mapped_column(Text, nullable=True)
    tags: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)


class WaterLog(Base, SyncMixin):
    __tablename__ = "water_log"
    __table_args__ = (
        CheckConstraint("ml > 0 AND ml <= 5000", name="ck_water_log_ml_valido"),
        Index("ix_water_log_user_id_data", "user_id", "data"),
    )

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True)
    user_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("app_user.id", ondelete="CASCADE"), nullable=False
    )
    data: Mapped[date] = mapped_column(Date, nullable=False)
    ml: Mapped[int] = mapped_column(Integer, nullable=False)
    registrado_em: Mapped[str] = mapped_column(String(30), nullable=False)


class NutritionInsight(Base, SyncMixin):
    """Observação gerada por IA sobre a alimentação do usuário.

    Escrita só pelo servidor (endpoint dedicado ou worker), nunca pelo
    ``/sync/batch``. O ``unique (user_id, tipo, periodo_ref)`` garante um
    insight por período — reprocessar faz ``ON CONFLICT DO UPDATE``.
    """

    __tablename__ = "nutrition_insight"
    __table_args__ = (
        CheckConstraint("tipo IN ('semanal','diario')", name="ck_nutrition_insight_tipo"),
        UniqueConstraint(
            "user_id", "tipo", "periodo_ref", name="uq_nutrition_insight_periodo"
        ),
        Index("ix_nutrition_insight_user_id_tipo", "user_id", "tipo"),
    )

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True)
    user_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("app_user.id", ondelete="CASCADE"), nullable=False
    )
    tipo: Mapped[str] = mapped_column(String(8), nullable=False)
    periodo_ref: Mapped[date] = mapped_column(Date, nullable=False)
    texto: Mapped[str] = mapped_column(Text, nullable=False)
    modelo: Mapped[str] = mapped_column(String(80), nullable=False)
    gerado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
