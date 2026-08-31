from datetime import datetime, time
from uuid import UUID

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    Time,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class PushSubscription(Base, TimestampMixin):
    __tablename__ = "push_subscription"
    __table_args__ = (Index("ix_push_subscription_user_active", "user_id", "active"),)

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True)
    user_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("app_user.id", ondelete="CASCADE"), nullable=False
    )
    endpoint: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    p256dh: Mapped[str] = mapped_column(Text, nullable=False)
    auth: Mapped[str] = mapped_column(Text, nullable=False)
    user_agent: Mapped[str | None] = mapped_column(String(500), nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    failure_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_success_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class NotificationPreference(Base, TimestampMixin):
    __tablename__ = "notification_preference"

    user_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("app_user.id", ondelete="CASCADE"), primary_key=True
    )
    treino_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    treino_horario: Mapped[time] = mapped_column(Time(), nullable=False, default=time(18, 0))
    refeicao_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    resumo_semanal_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    resumo_dia_semana: Mapped[int] = mapped_column(Integer, nullable=False, default=6)
    resumo_horario: Mapped[time] = mapped_column(Time(), nullable=False, default=time(18, 0))
    # Opt-in explícito: manda um resumo dos registros alimentares para um
    # provider de IA externo. Desligado por padrão — é dado sensível.
    insights_ia_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)


class NotificationDelivery(Base):
    __tablename__ = "notification_delivery"
    __table_args__ = (
        UniqueConstraint(
            "subscription_id", "kind", "scheduled_for", name="uq_notification_delivery_once"
        ),
        Index("ix_notification_delivery_user_scheduled", "user_id", "scheduled_for"),
    )

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True)
    user_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("app_user.id", ondelete="CASCADE"), nullable=False
    )
    subscription_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("push_subscription.id", ondelete="CASCADE"),
        nullable=False,
    )
    kind: Mapped[str] = mapped_column(String(120), nullable=False)
    scheduled_for: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    error: Mapped[str | None] = mapped_column(String(500), nullable=True)
    criado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
