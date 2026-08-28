"""Nutricao: plano de refeicoes, registros e agua.

Revision ID: 0005
Revises: 0004
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

APP_ROLE = "bealegend_app"
TABLES = ("meal_plan", "meal_slot", "meal_log", "water_log")


def _sync_columns() -> list[sa.Column]:
    return [
        sa.Column("row_version", sa.BigInteger(), nullable=False,
                  server_default=sa.text("nextval('sync_version_seq')")),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("criado_em", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.func.now()),
    ]


def _add_sync_rls(table: str) -> None:
    op.create_index(f"ix_{table}_row_version", table, ["row_version"])
    op.execute(
        f"CREATE TRIGGER {table}_bump_row_version BEFORE UPDATE ON {table} "
        "FOR EACH ROW EXECUTE FUNCTION bump_row_version()"
    )
    op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
    op.execute(
        f"CREATE POLICY {table}_select ON {table} FOR SELECT "
        "USING (user_id = app_current_user_id())"
    )
    op.execute(
        f"CREATE POLICY {table}_insert ON {table} FOR INSERT "
        "WITH CHECK (user_id = app_current_user_id())"
    )
    op.execute(
        f"CREATE POLICY {table}_update ON {table} FOR UPDATE "
        "USING (user_id = app_current_user_id()) WITH CHECK (user_id = app_current_user_id())"
    )
    op.execute(
        f"CREATE POLICY {table}_delete ON {table} FOR DELETE "
        "USING (user_id = app_current_user_id())"
    )
    op.execute(f"GRANT SELECT, INSERT, UPDATE, DELETE ON {table} TO {APP_ROLE}")


def upgrade() -> None:
    op.create_table(
        "meal_plan",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("nome", sa.String(120), nullable=False),
        sa.Column("ativo", sa.Boolean(), nullable=False, server_default=sa.true()),
        *_sync_columns(),
        sa.ForeignKeyConstraint(["user_id"], ["app_user.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_meal_plan_user_id_ativo", "meal_plan", ["user_id", "ativo"])

    op.create_table(
        "meal_slot",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("meal_plan_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("nome", sa.String(80), nullable=False),
        sa.Column("horario_alvo", sa.String(5), nullable=True),
        sa.Column("descricao", sa.String(240), nullable=True),
        sa.Column("ordem", sa.Integer(), nullable=False, server_default="0"),
        *_sync_columns(),
        sa.ForeignKeyConstraint(["user_id"], ["app_user.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["meal_plan_id"], ["meal_plan.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_meal_slot_user_id_plan", "meal_slot", ["user_id", "meal_plan_id"])

    op.create_table(
        "meal_log",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("data", sa.Date(), nullable=False),
        sa.Column("slot_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("horario", sa.String(5), nullable=False),
        sa.Column("descricao", sa.String(240), nullable=False),
        sa.Column("foto_url", sa.Text(), nullable=True),
        sa.Column("aderencia", sa.String(8), nullable=False),
        sa.Column("notas", sa.Text(), nullable=True),
        sa.Column("tags", postgresql.JSONB(), nullable=False, server_default="[]"),
        *_sync_columns(),
        sa.ForeignKeyConstraint(["user_id"], ["app_user.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["slot_id"], ["meal_slot.id"], ondelete="SET NULL"),
        sa.CheckConstraint("aderencia IN ('dentro','parcial','fora')", name="aderencia"),
    )
    op.create_index("ix_meal_log_user_id_data", "meal_log", ["user_id", "data"])

    op.create_table(
        "water_log",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("data", sa.Date(), nullable=False),
        sa.Column("ml", sa.Integer(), nullable=False),
        sa.Column("registrado_em", sa.String(30), nullable=False),
        *_sync_columns(),
        sa.ForeignKeyConstraint(["user_id"], ["app_user.id"], ondelete="CASCADE"),
        sa.CheckConstraint("ml > 0 AND ml <= 5000", name="ml_valido"),
    )
    op.create_index("ix_water_log_user_id_data", "water_log", ["user_id", "data"])

    for table in TABLES:
        _add_sync_rls(table)


def downgrade() -> None:
    for table in reversed(TABLES):
        op.execute(f"DROP TABLE IF EXISTS {table} CASCADE")
