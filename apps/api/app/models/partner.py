from datetime import datetime
from uuid import UUID

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class PartnerLink(Base, TimestampMixin):
    """Convite mútuo entre duas contas — a base do "ver o progresso do
    parceiro". Não participa do sync (é interação em tempo real entre duas
    contas, não dado offline de uma).

    Não é a autoridade de visibilidade por si só: uma linha `aceito` aqui é o
    que a função `app_is_partner_of()` lê para liberar SELECT extra nas
    policies de `session`/`meal_log`/`habit`/`habit_checkin` — a RLS continua
    sendo quem decide, nunca o `WHERE` de uma query.
    """

    __tablename__ = "partner_link"

    __table_args__ = (
        CheckConstraint(
            "status IN ('pendente','aceito','recusado')", name="ck_partner_link_status"
        ),
        CheckConstraint("requester_id <> receiver_id", name="ck_partner_link_not_self"),
    )

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True)
    requester_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("app_user.id", ondelete="CASCADE"), nullable=False
    )
    receiver_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("app_user.id", ondelete="CASCADE"), nullable=False
    )
    status: Mapped[str] = mapped_column(String(10), nullable=False, default="pendente")
    respondido_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
