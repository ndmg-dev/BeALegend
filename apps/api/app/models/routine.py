from datetime import date
from uuid import UUID

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, SyncMixin


class Habit(Base, SyncMixin):
    __tablename__ = "habit"
    __table_args__ = (
        CheckConstraint("meta_por_semana BETWEEN 1 AND 7", name="ck_habit_meta_por_semana_valida"),
        Index("ix_habit_user_id_nome", "user_id", "nome"),
    )

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True)
    user_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("app_user.id", ondelete="CASCADE"), nullable=False
    )
    nome: Mapped[str] = mapped_column(String(120), nullable=False)
    icone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    frequencia_rrule: Mapped[str] = mapped_column(String(300), nullable=False)
    meta_por_semana: Mapped[int] = mapped_column(Integer, nullable=False, default=7)
    ativo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class HabitCheckin(Base, SyncMixin):
    __tablename__ = "habit_checkin"
    __table_args__ = (
        UniqueConstraint("habit_id", "data", name="uq_habit_checkin_habit_data"),
        Index("ix_habit_checkin_user_id_data", "user_id", "data"),
    )

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True)
    user_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("app_user.id", ondelete="CASCADE"), nullable=False
    )
    habit_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("habit.id", ondelete="CASCADE"), nullable=False
    )
    data: Mapped[date] = mapped_column(Date, nullable=False)
    concluido: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    valor: Mapped[float | None] = mapped_column(Float, nullable=True)


class Goal(Base, SyncMixin):
    __tablename__ = "goal"
    __table_args__ = (
        CheckConstraint(
            "dominio IN ('treino','nutricao','financas','rotina')", name="ck_goal_dominio"
        ),
        CheckConstraint("tipo IN ('numerica','binaria','habito')", name="ck_goal_tipo"),
        CheckConstraint("status IN ('ativa','concluida','arquivada')", name="ck_goal_status"),
        CheckConstraint("alvo > 0", name="ck_goal_alvo_positivo"),
        Index("ix_goal_user_id_status", "user_id", "status"),
    )

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True)
    user_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("app_user.id", ondelete="CASCADE"), nullable=False
    )
    titulo: Mapped[str] = mapped_column(String(160), nullable=False)
    dominio: Mapped[str] = mapped_column(String(10), nullable=False)
    tipo: Mapped[str] = mapped_column(String(10), nullable=False)
    alvo: Mapped[float] = mapped_column(Float, nullable=False)
    unidade: Mapped[str | None] = mapped_column(String(30), nullable=True)
    prazo: Mapped[date | None] = mapped_column(Date, nullable=True)
    metrica_ref: Mapped[str] = mapped_column(String(100), nullable=False)
    status: Mapped[str] = mapped_column(String(10), nullable=False, default="ativa")
