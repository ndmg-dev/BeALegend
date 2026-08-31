from datetime import date
from uuid import UUID

from sqlalchemy import BigInteger, CheckConstraint, Date, ForeignKey, Index, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, SyncMixin


class Account(Base, SyncMixin):
    __tablename__ = "account"
    __table_args__ = (
        CheckConstraint("tipo IN ('conta','cartao','carteira')", name="ck_account_tipo"),
        Index("ix_account_user_id_nome", "user_id", "nome"),
    )

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True)
    user_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("app_user.id", ondelete="CASCADE"), nullable=False
    )
    nome: Mapped[str] = mapped_column(String(120), nullable=False)
    tipo: Mapped[str] = mapped_column(String(12), nullable=False)
    saldo_inicial_centavos: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)


class Category(Base, SyncMixin):
    __tablename__ = "category"
    __table_args__ = (
        CheckConstraint("tipo IN ('receita','despesa')", name="ck_category_tipo"),
        Index("ix_category_user_id_nome", "user_id", "nome"),
    )

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True)
    user_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("app_user.id", ondelete="CASCADE"), nullable=False
    )
    nome: Mapped[str] = mapped_column(String(80), nullable=False)
    tipo: Mapped[str] = mapped_column(String(10), nullable=False)
    cor: Mapped[str | None] = mapped_column(String(30), nullable=True)
    icone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    pai_id: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("category.id", ondelete="SET NULL"), nullable=True
    )


class Recurring(Base, SyncMixin):
    __tablename__ = "recurring"
    __table_args__ = (Index("ix_recurring_user_id_proxima", "user_id", "proxima_ocorrencia"),)

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True)
    user_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("app_user.id", ondelete="CASCADE"), nullable=False
    )
    template_json: Mapped[dict] = mapped_column(JSONB, nullable=False)
    regra_rrule: Mapped[str] = mapped_column(String(300), nullable=False)
    proxima_ocorrencia: Mapped[date | None] = mapped_column(Date, nullable=True)


class FinanceTransaction(Base, SyncMixin):
    __tablename__ = "transaction"
    __table_args__ = (
        CheckConstraint(
            "tipo IN ('receita','despesa','transferencia')", name="ck_transaction_tipo"
        ),
        CheckConstraint("valor_centavos > 0", name="ck_transaction_valor_positivo"),
        Index("ix_transaction_user_id_data", "user_id", "data"),
        Index("ix_transaction_user_id_category", "user_id", "category_id"),
    )

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True)
    user_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("app_user.id", ondelete="CASCADE"), nullable=False
    )
    account_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("account.id", ondelete="RESTRICT"), nullable=False
    )
    category_id: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("category.id", ondelete="SET NULL"), nullable=True
    )
    valor_centavos: Mapped[int] = mapped_column(BigInteger, nullable=False)
    tipo: Mapped[str] = mapped_column(String(14), nullable=False)
    data: Mapped[date] = mapped_column(Date, nullable=False)
    descricao: Mapped[str | None] = mapped_column(String(200), nullable=True)
    recorrente_id: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("recurring.id", ondelete="SET NULL"), nullable=True
    )
    tags: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)


class Budget(Base, SyncMixin):
    __tablename__ = "budget"
    __table_args__ = (
        CheckConstraint("limite_centavos > 0", name="ck_budget_limite_positivo"),
        Index("uq_budget_user_category_mes", "user_id", "category_id", "mes_ano", unique=True),
    )

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True)
    user_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("app_user.id", ondelete="CASCADE"), nullable=False
    )
    category_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("category.id", ondelete="CASCADE"), nullable=False
    )
    mes_ano: Mapped[str] = mapped_column(String(7), nullable=False)
    limite_centavos: Mapped[int] = mapped_column(BigInteger, nullable=False)
