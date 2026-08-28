"""Treino: plano semanal, catalogo de cardio, execucao de sessao e historico.

Revision ID: 0003
Revises: 0002
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

APP_ROLE = "bealegend_app"

# Todas denormalizam user_id (mesmo as filhas de training_plan/session): uma
# policy `user_id = app_current_user_id()` direta, sem EXISTS em cadeia, e o
# mesmo padrao de trigger de sync que exercise ja usa.
TABELAS_POR_USUARIO = (
    "training_plan",
    "plan_day",
    "plan_item",
    "session",
    "set_log",
    "cardio_log",
    "body_metric",
)


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


def _add_rls(table: str) -> None:
    op.create_index(f"ix_{table}_row_version", table, ["row_version"])
    op.execute(
        f"CREATE TRIGGER {table}_bump_row_version "
        f"BEFORE UPDATE ON {table} FOR EACH ROW EXECUTE FUNCTION bump_row_version()"
    )
    op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
    op.execute(
        f"CREATE POLICY {table}_select ON {table} FOR SELECT "
        f"USING (user_id = app_current_user_id())"
    )
    op.execute(
        f"CREATE POLICY {table}_insert ON {table} FOR INSERT "
        f"WITH CHECK (user_id = app_current_user_id())"
    )
    op.execute(
        f"CREATE POLICY {table}_update ON {table} FOR UPDATE "
        f"USING (user_id = app_current_user_id()) "
        f"WITH CHECK (user_id = app_current_user_id())"
    )
    op.execute(
        f"CREATE POLICY {table}_delete ON {table} FOR DELETE "
        f"USING (user_id = app_current_user_id())"
    )
    op.execute(f"GRANT SELECT, INSERT, UPDATE, DELETE ON {table} TO {APP_ROLE}")


def upgrade() -> None:
    op.create_table(
        "training_plan",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("nome", sa.String(160), nullable=False),
        sa.Column("objetivo", sa.Text(), nullable=True),
        sa.Column("ativo", sa.Boolean(), nullable=False, server_default=sa.true()),
        *_sync_columns(),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["app_user.id"],
            name="fk_training_plan_user_id_app_user",
            ondelete="CASCADE",
        ),
    )

    op.create_table(
        "plan_day",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("plan_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("dia_semana", sa.String(10), nullable=False),
        sa.Column("tipo", sa.String(10), nullable=False),
        sa.Column("foco", sa.String(160), nullable=True),
        sa.Column("duracao_min", sa.String(20), nullable=True),
        sa.Column("intensidade", sa.String(20), nullable=True),
        sa.Column("observacoes", sa.Text(), nullable=True),
        *_sync_columns(),
        sa.ForeignKeyConstraint(
            ["user_id"], ["app_user.id"], name="fk_plan_day_user_id_app_user", ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["plan_id"],
            ["training_plan.id"],
            name="fk_plan_day_plan_id_training_plan",
            ondelete="CASCADE",
        ),
        sa.CheckConstraint(
            "dia_semana IN ('segunda','terca','quarta','quinta','sexta','sabado','domingo')",
            name="ck_plan_day_dia_semana",
        ),
        sa.CheckConstraint("tipo IN ('forca','cardio','hiit','descanso')", name="ck_plan_day_tipo"),
    )
    op.create_index("ix_plan_day_user_id_plan_id", "plan_day", ["user_id", "plan_id"])

    op.create_table(
        "cardio_protocol",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("is_global", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("nome", sa.String(120), nullable=False),
        sa.Column("aquecimento", sa.String(80), nullable=True),
        sa.Column("parte_principal", sa.String(120), nullable=True),
        sa.Column("recuperacao", sa.String(80), nullable=True),
        sa.Column("desaquecimento", sa.String(80), nullable=True),
        sa.Column("rpe_alvo", sa.String(40), nullable=True),
        sa.Column("observacao", sa.Text(), nullable=True),
        *_sync_columns(),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["app_user.id"],
            name="fk_cardio_protocol_user_id_app_user",
            ondelete="CASCADE",
        ),
        sa.CheckConstraint(
            "(is_global AND user_id IS NULL) OR (NOT is_global AND user_id IS NOT NULL)",
            name="ck_cardio_protocol_global_xor_owned",
        ),
    )

    op.create_table(
        "plan_item",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("plan_day_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("exercise_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("cardio_protocol_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("ordem", sa.SmallInteger(), nullable=False),
        sa.Column("series_min", sa.SmallInteger(), nullable=True),
        sa.Column("series_max", sa.SmallInteger(), nullable=True),
        sa.Column("reps_min", sa.SmallInteger(), nullable=True),
        sa.Column("reps_max", sa.SmallInteger(), nullable=True),
        sa.Column("unidade", sa.String(10), nullable=False, server_default="reps"),
        sa.Column("unilateral", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("rir_min", sa.SmallInteger(), nullable=True),
        sa.Column("rir_max", sa.SmallInteger(), nullable=True),
        sa.Column("descanso_seg", sa.Integer(), nullable=True),
        sa.Column("notas", sa.Text(), nullable=True),
        *_sync_columns(),
        sa.ForeignKeyConstraint(
            ["user_id"], ["app_user.id"], name="fk_plan_item_user_id_app_user", ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["plan_day_id"],
            ["plan_day.id"],
            name="fk_plan_item_plan_day_id_plan_day",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["exercise_id"],
            ["exercise.id"],
            name="fk_plan_item_exercise_id_exercise",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["cardio_protocol_id"],
            ["cardio_protocol.id"],
            name="fk_plan_item_cardio_protocol_id_cardio_protocol",
            ondelete="RESTRICT",
        ),
        sa.CheckConstraint(
            "(exercise_id IS NOT NULL) != (cardio_protocol_id IS NOT NULL)",
            name="ck_plan_item_exercise_xor_cardio",
        ),
        sa.CheckConstraint("unidade IN ('reps','segundos')", name="ck_plan_item_unidade"),
    )
    op.create_index("ix_plan_item_user_id_plan_day_id", "plan_item", ["user_id", "plan_day_id"])

    op.create_table(
        "session",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("plan_day_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("data", sa.Date(), nullable=False),
        sa.Column("status", sa.String(12), nullable=False, server_default="planejada"),
        sa.Column("duracao_real_min", sa.SmallInteger(), nullable=True),
        sa.Column("rpe_geral", sa.SmallInteger(), nullable=True),
        sa.Column("notas", sa.Text(), nullable=True),
        *_sync_columns(),
        sa.ForeignKeyConstraint(
            ["user_id"], ["app_user.id"], name="fk_session_user_id_app_user", ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["plan_day_id"],
            ["plan_day.id"],
            name="fk_session_plan_day_id_plan_day",
            ondelete="SET NULL",
        ),
        sa.CheckConstraint(
            "status IN ('planejada','em_curso','concluida','pulada')", name="ck_session_status"
        ),
    )
    op.create_index("ix_session_user_id_data", "session", ["user_id", "data"])

    op.create_table(
        "set_log",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("session_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("exercise_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("numero_serie", sa.SmallInteger(), nullable=False),
        sa.Column("reps", sa.SmallInteger(), nullable=False),
        sa.Column("carga_kg", sa.Numeric(6, 2), nullable=False),
        sa.Column("rir", sa.SmallInteger(), nullable=True),
        sa.Column("concluido_em", sa.String(30), nullable=False),
        *_sync_columns(),
        sa.ForeignKeyConstraint(
            ["user_id"], ["app_user.id"], name="fk_set_log_user_id_app_user", ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["session_id"], ["session.id"], name="fk_set_log_session_id_session", ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["exercise_id"],
            ["exercise.id"],
            name="fk_set_log_exercise_id_exercise",
            ondelete="RESTRICT",
        ),
    )
    op.create_index("ix_set_log_user_id_session_id", "set_log", ["user_id", "session_id"])

    op.create_table(
        "cardio_log",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("session_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("protocolo_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("duracao_min", sa.SmallInteger(), nullable=False),
        sa.Column("distancia_km", sa.Numeric(5, 2), nullable=True),
        sa.Column("rpe", sa.SmallInteger(), nullable=True),
        sa.Column("tipo", sa.String(12), nullable=False),
        *_sync_columns(),
        sa.ForeignKeyConstraint(
            ["user_id"], ["app_user.id"], name="fk_cardio_log_user_id_app_user", ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["session_id"],
            ["session.id"],
            name="fk_cardio_log_session_id_session",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["protocolo_id"],
            ["cardio_protocol.id"],
            name="fk_cardio_log_protocolo_id_cardio_protocol",
            ondelete="SET NULL",
        ),
        sa.CheckConstraint("tipo IN ('corrida','bike','caminhada')", name="ck_cardio_log_tipo"),
    )
    op.create_index("ix_cardio_log_user_id_session_id", "cardio_log", ["user_id", "session_id"])

    op.create_table(
        "body_metric",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("data", sa.Date(), nullable=False),
        sa.Column("tipo", sa.String(20), nullable=False),
        sa.Column("valor", sa.Numeric(6, 2), nullable=True),
        sa.Column("unidade", sa.String(10), nullable=True),
        *_sync_columns(),
        sa.ForeignKeyConstraint(
            ["user_id"], ["app_user.id"], name="fk_body_metric_user_id_app_user", ondelete="CASCADE"
        ),
        sa.CheckConstraint("tipo IN ('peso','circunferencia','foto')", name="ck_body_metric_tipo"),
    )
    op.create_index("ix_body_metric_user_id_data", "body_metric", ["user_id", "data"])

    # cardio_protocol e catalogo global-com-excecao, como exercise: RLS propria
    # (sem user_id NOT NULL), sem os triggers/policies genericos acima.
    op.create_index("ix_cardio_protocol_row_version", "cardio_protocol", ["row_version"])
    op.execute(
        "CREATE TRIGGER cardio_protocol_bump_row_version "
        "BEFORE UPDATE ON cardio_protocol FOR EACH ROW EXECUTE FUNCTION bump_row_version()"
    )
    op.execute("ALTER TABLE cardio_protocol ENABLE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY cardio_protocol_select ON cardio_protocol FOR SELECT "
        "USING (is_global OR user_id = app_current_user_id())"
    )
    op.execute(
        "CREATE POLICY cardio_protocol_insert ON cardio_protocol FOR INSERT "
        "WITH CHECK (user_id = app_current_user_id())"
    )
    op.execute(
        "CREATE POLICY cardio_protocol_update ON cardio_protocol FOR UPDATE "
        "USING (user_id = app_current_user_id()) "
        "WITH CHECK (user_id = app_current_user_id())"
    )
    op.execute(
        "CREATE POLICY cardio_protocol_delete ON cardio_protocol FOR DELETE "
        "USING (user_id = app_current_user_id())"
    )
    op.execute(f"GRANT SELECT, INSERT, UPDATE, DELETE ON cardio_protocol TO {APP_ROLE}")

    for tabela in TABELAS_POR_USUARIO:
        _add_rls(tabela)


def downgrade() -> None:
    for tabela in reversed(
        (*TABELAS_POR_USUARIO, "cardio_protocol", "plan_item", "plan_day", "training_plan")
    ):
        op.execute(f"DROP TABLE IF EXISTS {tabela} CASCADE")
