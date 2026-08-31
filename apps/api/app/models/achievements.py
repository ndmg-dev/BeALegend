from datetime import datetime
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, Index, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, SyncMixin


class AchievementUnlock(Base, SyncMixin):
    """Marcador de conquista desbloqueada. Append-only — igual ao set_log.

    Não é a fonte da verdade (essa é o `evaluate` puro do cliente): só fixa a
    data do desbloqueio e serve para o cliente comemorar uma vez. O
    ``unique (user_id, achievement_key)`` é defesa; no caminho normal a chave
    de idempotência estável (``unlock:<key>``) já impede a duplicata entre
    aparelhos.
    """

    __tablename__ = "achievement_unlock"
    __table_args__ = (
        UniqueConstraint(
            "user_id", "achievement_key", name="uq_achievement_unlock_user_key"
        ),
        Index("ix_achievement_unlock_user_id", "user_id"),
    )

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True)
    user_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("app_user.id", ondelete="CASCADE"), nullable=False
    )
    achievement_key: Mapped[str] = mapped_column(String(80), nullable=False)
    desbloqueado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
