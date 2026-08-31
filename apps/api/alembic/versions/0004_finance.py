"""Financas: contas, categorias, transacoes, orcamentos e recorrencias.

Revision ID: 0004
Revises: 0003
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

APP_ROLE = "bealegend_app"
TABLES = ("account", "category", "recurring", "transaction", "budget")


def _sync_columns() -> list[sa.Column]:
    return [
        sa.Column(
            "row_version",
            sa.BigInteger(),
            nullable=False,
            server_default=sa.text("nextval('sync_version_seq')"),
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "criado_em", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
    ]


def _add_sync_rls(table: str) -> None:
    op.create_index(f"ix_{table}_row_version", table, ["row_version"])
    op.execute(
        f'CREATE TRIGGER {table}_bump_row_version BEFORE UPDATE ON "{table}" '
        "FOR EACH ROW EXECUTE FUNCTION bump_row_version()"
    )
    op.execute(f'ALTER TABLE "{table}" ENABLE ROW LEVEL SECURITY')
    op.execute(
        f'CREATE POLICY {table}_select ON "{table}" FOR SELECT '
        "USING (user_id = app_current_user_id())"
    )
    op.execute(
        f'CREATE POLICY {table}_insert ON "{table}" FOR INSERT '
        "WITH CHECK (user_id = app_current_user_id())"
    )
    op.execute(
        f'CREATE POLICY {table}_update ON "{table}" FOR UPDATE '
        "USING (user_id = app_current_user_id()) WITH CHECK (user_id = app_current_user_id())"
    )
    op.execute(
        f'CREATE POLICY {table}_delete ON "{table}" FOR DELETE '
        "USING (user_id = app_current_user_id())"
    )
    op.execute(f'GRANT SELECT, INSERT, UPDATE, DELETE ON "{table}" TO {APP_ROLE}')


def upgrade() -> None:
    op.create_table(
        "account",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("nome", sa.String(120), nullable=False),
        sa.Column("tipo", sa.String(12), nullable=False),
        sa.Column("saldo_inicial_centavos", sa.BigInteger(), nullable=False, server_default="0"),
        *_sync_columns(),
        sa.ForeignKeyConstraint(
            ["user_id"], ["app_user.id"], name="fk_account_user_id_app_user", ondelete="CASCADE"
        ),
        sa.CheckConstraint("tipo IN ('conta','cartao','carteira')", name="ck_account_tipo"),
    )
    op.create_index("ix_account_user_id_nome", "account", ["user_id", "nome"])

    op.create_table(
        "category",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("nome", sa.String(80), nullable=False),
        sa.Column("tipo", sa.String(10), nullable=False),
        sa.Column("cor", sa.String(30), nullable=True),
        sa.Column("icone", sa.String(30), nullable=True),
        sa.Column("pai_id", postgresql.UUID(as_uuid=True), nullable=True),
        *_sync_columns(),
        sa.ForeignKeyConstraint(
            ["user_id"], ["app_user.id"], name="fk_category_user_id_app_user", ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["pai_id"], ["category.id"], name="fk_category_pai_id_category", ondelete="SET NULL"
        ),
        sa.CheckConstraint("tipo IN ('receita','despesa')", name="ck_category_tipo"),
    )
    op.create_index("ix_category_user_id_nome", "category", ["user_id", "nome"])

    op.create_table(
        "recurring",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("template_json", postgresql.JSONB(), nullable=False),
        sa.Column("regra_rrule", sa.String(300), nullable=False),
        sa.Column("proxima_ocorrencia", sa.Date(), nullable=True),
        *_sync_columns(),
        sa.ForeignKeyConstraint(
            ["user_id"], ["app_user.id"], name="fk_recurring_user_id_app_user", ondelete="CASCADE"
        ),
    )
    op.create_index("ix_recurring_user_id_proxima", "recurring", ["user_id", "proxima_ocorrencia"])

    op.create_table(
        "transaction",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("account_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("category_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("valor_centavos", sa.BigInteger(), nullable=False),
        sa.Column("tipo", sa.String(14), nullable=False),
        sa.Column("data", sa.Date(), nullable=False),
        sa.Column("descricao", sa.String(200), nullable=True),
        sa.Column("recorrente_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("tags", postgresql.JSONB(), nullable=False, server_default="[]"),
        *_sync_columns(),
        sa.ForeignKeyConstraint(
            ["user_id"], ["app_user.id"], name="fk_transaction_user_id_app_user", ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["account_id"],
            ["account.id"],
            name="fk_transaction_account_id_account",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["category_id"],
            ["category.id"],
            name="fk_transaction_category_id_category",
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["recorrente_id"],
            ["recurring.id"],
            name="fk_transaction_recorrente_id_recurring",
            ondelete="SET NULL",
        ),
        sa.CheckConstraint(
            "tipo IN ('receita','despesa','transferencia')", name="ck_transaction_tipo"
        ),
        sa.CheckConstraint("valor_centavos > 0", name="ck_transaction_valor_positivo"),
    )
    op.create_index("ix_transaction_user_id_data", "transaction", ["user_id", "data"])
    op.create_index("ix_transaction_user_id_category", "transaction", ["user_id", "category_id"])

    op.create_table(
        "budget",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("category_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("mes_ano", sa.String(7), nullable=False),
        sa.Column("limite_centavos", sa.BigInteger(), nullable=False),
        *_sync_columns(),
        sa.ForeignKeyConstraint(
            ["user_id"], ["app_user.id"], name="fk_budget_user_id_app_user", ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["category_id"],
            ["category.id"],
            name="fk_budget_category_id_category",
            ondelete="CASCADE",
        ),
        sa.CheckConstraint("limite_centavos > 0", name="ck_budget_limite_positivo"),
        sa.UniqueConstraint(
            "user_id", "category_id", "mes_ano", name="uq_budget_user_category_mes"
        ),
    )

    for table in TABLES:
        _add_sync_rls(table)


def downgrade() -> None:
    for table in reversed(TABLES):
        op.execute(f'DROP TABLE IF EXISTS "{table}" CASCADE')
