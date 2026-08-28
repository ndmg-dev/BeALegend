from uuid import UUID

from sqlalchemy import Boolean, CheckConstraint, ForeignKey, Index, String, Text
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class Exercise(Base, TimestampMixin):
    """Catalogo de exercicios.

    ``is_global`` + ``user_id IS NULL`` = catalogo compartilhado, so admin edita.
    Exercicio criado pelo usuario carrega ``user_id`` e fica isolado por RLS.
    """

    __tablename__ = "exercise"
    __table_args__ = (
        CheckConstraint(
            "(is_global AND user_id IS NULL) OR (NOT is_global AND user_id IS NOT NULL)",
            name="global_xor_owned",
        ),
        Index("ix_exercise_user_id_nome", "user_id", "nome"),
    )

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True)
    user_id: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("app_user.id", ondelete="CASCADE"), nullable=True
    )
    is_global: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    nome: Mapped[str] = mapped_column(String(160), nullable=False)
    grupo_muscular: Mapped[list[str]] = mapped_column(
        ARRAY(String(40)), nullable=False, default=list
    )
    equipamento: Mapped[str | None] = mapped_column(String(80), nullable=True)
    how_to: Mapped[str | None] = mapped_column(Text, nullable=True)
    common_mistakes: Mapped[str | None] = mapped_column(Text, nullable=True)
