"""Auth, catalogo de exercicios e a base de Row-Level Security.

Revision ID: 0001
Revises:
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

APP_ROLE = "bealegend_app"


def upgrade() -> None:
    op.execute('CREATE EXTENSION IF NOT EXISTS "pgcrypto"')

    # ---- helper lido pelas policies -------------------------------------
    # missing_ok=true: sem contexto, devolve NULL, a comparacao vira NULL e a
    # policy nega. Deny by default, sem excecao ruidosa.
    op.execute(
        """
        CREATE OR REPLACE FUNCTION app_current_user_id() RETURNS uuid
        LANGUAGE sql STABLE AS $$
          SELECT NULLIF(current_setting('app.user_id', true), '')::uuid
        $$;
        """
    )

    # ---- plano de autenticacao (sem RLS, ver routers/auth.py) ------------
    op.create_table(
        "app_user",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("email", sa.String(320), nullable=False),
        sa.Column("password_hash", sa.Text(), nullable=False),
        sa.Column("nome", sa.String(120), nullable=False, server_default=""),
        sa.Column("timezone", sa.String(64), nullable=False, server_default="America/Sao_Paulo"),
        sa.Column("is_admin", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column(
            "criado_em", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
    )
    op.create_index("ix_app_user_email", "app_user", ["email"], unique=True)

    op.create_table(
        "refresh_token",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False),
        sa.Column("family_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("expira_em", sa.DateTime(timezone=True), nullable=False),
        sa.Column("usado_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revogado_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column("criado_em", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["app_user.id"],
            name="fk_refresh_token_user_id_app_user",
            ondelete="CASCADE",
        ),
    )
    op.create_index("ix_refresh_token_token_hash", "refresh_token", ["token_hash"], unique=True)
    op.create_index("ix_refresh_token_family_id", "refresh_token", ["family_id"])

    # ---- primeira tabela de dados do usuario -----------------------------
    op.create_table(
        "exercise",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("is_global", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("nome", sa.String(160), nullable=False),
        sa.Column(
            "grupo_muscular",
            postgresql.ARRAY(sa.String(40)),
            nullable=False,
            server_default="{}",
        ),
        sa.Column("equipamento", sa.String(80), nullable=True),
        sa.Column("how_to", sa.Text(), nullable=True),
        sa.Column("common_mistakes", sa.Text(), nullable=True),
        sa.Column(
            "criado_em", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["app_user.id"], name="fk_exercise_user_id_app_user", ondelete="CASCADE"
        ),
        sa.CheckConstraint(
            "(is_global AND user_id IS NULL) OR (NOT is_global AND user_id IS NOT NULL)",
            name="ck_exercise_global_xor_owned",
        ),
    )
    op.create_index("ix_exercise_user_id_nome", "exercise", ["user_id", "nome"])

    # ---- privilegios da role de runtime ---------------------------------
    op.execute(f"GRANT USAGE ON SCHEMA public TO {APP_ROLE}")
    op.execute(f"GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO {APP_ROLE}")
    op.execute(
        f"ALTER DEFAULT PRIVILEGES IN SCHEMA public "
        f"GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO {APP_ROLE}"
    )
    op.execute(f"GRANT EXECUTE ON FUNCTION app_current_user_id() TO {APP_ROLE}")

    # ---- RLS -------------------------------------------------------------
    # A API conecta como bealegend_app, que nao e dona das tabelas e portanto
    # esta integralmente sujeita as policies. O dono (bealegend) permanece
    # isento — e e o unico caminho para migrations e para semear o catalogo
    # global, onde user_id e NULL de proposito.
    op.execute("ALTER TABLE exercise ENABLE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY exercise_select ON exercise FOR SELECT
        USING (is_global OR user_id = app_current_user_id())
        """
    )
    op.execute(
        """
        CREATE POLICY exercise_insert ON exercise FOR INSERT
        WITH CHECK (user_id = app_current_user_id())
        """
    )
    op.execute(
        """
        CREATE POLICY exercise_update ON exercise FOR UPDATE
        USING (user_id = app_current_user_id())
        WITH CHECK (user_id = app_current_user_id())
        """
    )
    op.execute(
        """
        CREATE POLICY exercise_delete ON exercise FOR DELETE
        USING (user_id = app_current_user_id())
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS exercise CASCADE")
    op.execute("DROP TABLE IF EXISTS refresh_token CASCADE")
    op.execute("DROP TABLE IF EXISTS app_user CASCADE")
    op.execute("DROP FUNCTION IF EXISTS app_current_user_id()")
