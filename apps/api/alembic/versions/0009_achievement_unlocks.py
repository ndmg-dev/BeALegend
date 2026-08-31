"""Conquistas desbloqueadas.

Marcador append-only, sincronizado como qualquer entidade. A verdade e o
evaluate puro no cliente; esta tabela so fixa a data e a comemoracao.

Revision ID: 0009
Revises: 0008
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0009"
down_revision: str | None = "0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

APP_ROLE = "bealegend_app"
TABLE = "achievement_unlock"


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
        TABLE,
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("achievement_key", sa.String(80), nullable=False),
        sa.Column("desbloqueado_em", sa.DateTime(timezone=True), nullable=False),
        *_sync_columns(),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["app_user.id"],
            name="fk_achievement_unlock_user_id_app_user",
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint(
            "user_id", "achievement_key", name="uq_achievement_unlock_user_key"
        ),
    )
    op.create_index("ix_achievement_unlock_user_id", TABLE, ["user_id"])
    _add_sync_rls(TABLE)


def downgrade() -> None:
    op.execute(f"DROP TABLE IF EXISTS {TABLE} CASCADE")
