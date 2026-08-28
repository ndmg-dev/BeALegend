from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class IdempotencyRecord(Base):
    """Resultado ja aplicado de uma operacao da outbox.

    A chave e escopada por usuario: uma chave adivinhada nao pode devolver a
    resposta de outra pessoa.
    """

    __tablename__ = "idempotency_record"

    user_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("app_user.id", ondelete="CASCADE"), primary_key=True
    )
    chave: Mapped[str] = mapped_column(String(120), primary_key=True)
    entidade: Mapped[str] = mapped_column(String(60), nullable=False)
    operacao: Mapped[str] = mapped_column(String(20), nullable=False)
    resultado: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    criado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
