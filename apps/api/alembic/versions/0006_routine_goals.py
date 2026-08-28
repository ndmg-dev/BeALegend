"""Rotina e metas: habitos, check-ins e metas calculadas.

Revision ID: 0006
Revises: 0005
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0006"
down_revision: str | None = "0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

APP_ROLE = "bealegend_app"
TABLES = ("habit", "habit_checkin", "goal")


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
    for action in ("select", "insert", "update", "delete"):
        if action == "select":
            clause = "USING (user_id = app_current_user_id())"
        elif action == "insert":
            clause = "WITH CHECK (user_id = app_current_user_id())"
        elif action == "update":
            clause = (
                "USING (user_id = app_current_user_id()) "
                "WITH CHECK (user_id = app_current_user_id())"
            )
        else:
            clause = "USING (user_id = app_current_user_id())"
        op.execute(
            f"CREATE POLICY {table}_{action} ON {table} FOR {action.upper()} {clause}"
        )
    op.execute(f"GRANT SELECT, INSERT, UPDATE, DELETE ON {table} TO {APP_ROLE}")


def upgrade() -> None:
    op.create_table(
        "habit",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("nome", sa.String(120), nullable=False),
        sa.Column("icone", sa.String(30), nullable=True),
        sa.Column("frequencia_rrule", sa.String(300), nullable=False),
        sa.Column("meta_por_semana", sa.Integer(), nullable=False, server_default="7"),
        sa.Column("ativo", sa.Boolean(), nullable=False, server_default=sa.true()),
        *_sync_columns(),
        sa.ForeignKeyConstraint(["user_id"], ["app_user.id"], ondelete="CASCADE"),
        sa.CheckConstraint(
            "meta_por_semana BETWEEN 1 AND 7", name="meta_por_semana_valida"
        ),
    )
    op.create_index("ix_habit_user_id_nome", "habit", ["user_id", "nome"])

    op.create_table(
        "habit_checkin",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("habit_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("data", sa.Date(), nullable=False),
        sa.Column("concluido", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("valor", sa.Float(), nullable=True),
        *_sync_columns(),
        sa.ForeignKeyConstraint(["user_id"], ["app_user.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["habit_id"], ["habit.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("habit_id", "data", name="uq_habit_checkin_habit_data"),
    )
    op.create_index("ix_habit_checkin_user_id_data", "habit_checkin", ["user_id", "data"])

    op.create_table(
        "goal",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("titulo", sa.String(160), nullable=False),
        sa.Column("dominio", sa.String(10), nullable=False),
        sa.Column("tipo", sa.String(10), nullable=False),
        sa.Column("alvo", sa.Float(), nullable=False),
        sa.Column("unidade", sa.String(30), nullable=True),
        sa.Column("prazo", sa.Date(), nullable=True),
        sa.Column("metrica_ref", sa.String(100), nullable=False),
        sa.Column("status", sa.String(10), nullable=False, server_default="ativa"),
        *_sync_columns(),
        sa.ForeignKeyConstraint(["user_id"], ["app_user.id"], ondelete="CASCADE"),
        sa.CheckConstraint(
            "dominio IN ('treino','nutricao','financas','rotina')", name="dominio"
        ),
        sa.CheckConstraint("tipo IN ('numerica','binaria','habito')", name="tipo"),
        sa.CheckConstraint("status IN ('ativa','concluida','arquivada')", name="status"),
        sa.CheckConstraint("alvo > 0", name="alvo_positivo"),
    )
    op.create_index("ix_goal_user_id_status", "goal", ["user_id", "status"])

    for table in TABLES:
        _add_sync_rls(table)


def downgrade() -> None:
    for table in reversed(TABLES):
        op.execute(f"DROP TABLE IF EXISTS {table} CASCADE")
