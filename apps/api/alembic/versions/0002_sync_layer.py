"""Camada de sincronizacao: row_version, soft delete e idempotencia.

Revision ID: 0002
Revises: 0001
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

APP_ROLE = "bealegend_app"

# Tabelas que participam do sync. A fase 2 acrescenta as de treino.
SYNCED_TABLES = ["exercise"]


def upgrade() -> None:
    # ---- cursor de sync -------------------------------------------------
    # Uma sequencia global, e nao `updated_at`, e o cursor. Timestamp empata
    # (duas escritas no mesmo microssegundo) e depende do relogio do servidor;
    # empate no cursor faz o cliente pular linhas em silencio, que e o pior
    # tipo de bug de sync.
    op.execute("CREATE SEQUENCE sync_version_seq AS bigint START 1")

    op.execute(
        """
        CREATE OR REPLACE FUNCTION bump_row_version() RETURNS trigger
        LANGUAGE plpgsql AS $$
        BEGIN
          NEW.row_version := nextval('sync_version_seq');
          NEW.updated_at := now();
          RETURN NEW;
        END
        $$;
        """
    )

    for table in SYNCED_TABLES:
        op.add_column(
            table,
            sa.Column(
                "row_version",
                sa.BigInteger(),
                nullable=False,
                server_default=sa.text("nextval('sync_version_seq')"),
            ),
        )
        # Soft delete: o cliente precisa saber que a linha morreu. Um DELETE
        # de verdade some sem deixar rastro no delta e o registro ressuscita
        # no proximo push do outro dispositivo.
        op.add_column(table, sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True))
        op.create_index(f"ix_{table}_row_version", table, ["row_version"])
        op.execute(
            f"""
            CREATE TRIGGER {table}_bump_row_version
            BEFORE UPDATE ON {table}
            FOR EACH ROW EXECUTE FUNCTION bump_row_version()
            """
        )

    # ---- idempotencia ---------------------------------------------------
    # Sem isto, um retry apos timeout duplica lancamento de gasto: o cliente
    # nao sabe se o servidor recebeu, e a unica saida segura e reenviar.
    op.create_table(
        "idempotency_record",
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("chave", sa.String(120), nullable=False),
        sa.Column("entidade", sa.String(60), nullable=False),
        sa.Column("operacao", sa.String(20), nullable=False),
        sa.Column("resultado", postgresql.JSONB(), nullable=False),
        sa.Column(
            "criado_em", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.PrimaryKeyConstraint("user_id", "chave", name="pk_idempotency_record"),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["app_user.id"],
            name="fk_idempotency_record_user_id_app_user",
            ondelete="CASCADE",
        ),
    )
    op.create_index("ix_idempotency_record_criado_em", "idempotency_record", ["criado_em"])

    # ---- privilegios e RLS ----------------------------------------------
    op.execute(f"GRANT USAGE, SELECT ON SEQUENCE sync_version_seq TO {APP_ROLE}")
    op.execute(f"GRANT SELECT, INSERT, UPDATE, DELETE ON idempotency_record TO {APP_ROLE}")

    op.execute("ALTER TABLE idempotency_record ENABLE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY idempotency_record_all ON idempotency_record FOR ALL
        USING (user_id = app_current_user_id())
        WITH CHECK (user_id = app_current_user_id())
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS idempotency_record CASCADE")
    for table in SYNCED_TABLES:
        op.execute(f"DROP TRIGGER IF EXISTS {table}_bump_row_version ON {table}")
        op.drop_index(f"ix_{table}_row_version", table_name=table)
        op.drop_column(table, "deleted_at")
        op.drop_column(table, "row_version")
    op.execute("DROP FUNCTION IF EXISTS bump_row_version()")
    op.execute("DROP SEQUENCE IF EXISTS sync_version_seq")
