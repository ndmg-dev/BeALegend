"""Dieta: catalogo de alimentos, itens da refeicao, metas e suplementos.

Revision ID: 0010
Revises: 0009
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0010"
down_revision: str | None = "0009"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

APP_ROLE = "bealegend_app"

#: Catalogo escrito pelo seed (owner) e lido por todos: o SELECT tambem
#: enxerga is_global, e o app so escreve as proprias linhas.
TABELAS_CATALOGO = ("food_item", "supplement")
#: Do usuario, como o resto do sync.
TABELAS_USUARIO = ("meal_slot_item", "nutrition_target")


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


def _sync_infra(table: str) -> None:
    op.create_index(f"ix_{table}_row_version", table, ["row_version"])
    op.execute(
        f"CREATE TRIGGER {table}_bump_row_version BEFORE UPDATE ON {table} "
        "FOR EACH ROW EXECUTE FUNCTION bump_row_version()"
    )
    op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
    op.execute(f"GRANT SELECT, INSERT, UPDATE, DELETE ON {table} TO {APP_ROLE}")


def _policies_usuario(table: str) -> None:
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


def _policies_catalogo(table: str) -> None:
    """Mesma forma do exercise/cardio_protocol: le o global e o proprio,
    escreve so o proprio. O catalogo global e do owner (seed)."""
    op.execute(
        f"CREATE POLICY {table}_select ON {table} FOR SELECT "
        "USING (is_global OR user_id = app_current_user_id())"
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


def upgrade() -> None:
    op.create_table(
        "food_item",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("is_global", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("nome", sa.String(120), nullable=False),
        sa.Column("kcal", sa.Numeric(7, 2), nullable=False),
        sa.Column("proteina_g", sa.Numeric(6, 2), nullable=False),
        sa.Column("carboidrato_g", sa.Numeric(6, 2), nullable=False),
        sa.Column("gordura_g", sa.Numeric(6, 2), nullable=False),
        sa.Column("fibra_g", sa.Numeric(6, 2), nullable=False),
        sa.Column("referencia_pratica", sa.String(120), nullable=True),
        sa.Column("fonte", sa.Text(), nullable=True),
        sa.Column("conferir_rotulo", sa.Boolean(), nullable=False, server_default=sa.false()),
        *_sync_columns(),
        sa.ForeignKeyConstraint(
            ["user_id"], ["app_user.id"], name="fk_food_item_user_id_app_user", ondelete="CASCADE"
        ),
        sa.CheckConstraint(
            "(is_global AND user_id IS NULL) OR (NOT is_global AND user_id IS NOT NULL)",
            name="ck_food_item_global_xor_owned",
        ),
    )
    op.create_index("ix_food_item_user_id_nome", "food_item", ["user_id", "nome"])

    op.create_table(
        "supplement",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("is_global", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("nome", sa.String(120), nullable=False),
        sa.Column("como_usar", sa.Text(), nullable=True),
        sa.Column("faixa", sa.Text(), nullable=True),
        sa.Column("horario", sa.String(120), nullable=True),
        sa.Column("observar", sa.Text(), nullable=True),
        sa.Column("fonte", sa.Text(), nullable=True),
        sa.Column("status", sa.String(40), nullable=True),
        sa.Column("ordem", sa.Integer(), nullable=False, server_default="0"),
        *_sync_columns(),
        sa.ForeignKeyConstraint(
            ["user_id"], ["app_user.id"], name="fk_supplement_user_id_app_user", ondelete="CASCADE"
        ),
        sa.CheckConstraint(
            "(is_global AND user_id IS NULL) OR (NOT is_global AND user_id IS NOT NULL)",
            name="ck_supplement_global_xor_owned",
        ),
    )
    op.create_index("ix_supplement_user_id_nome", "supplement", ["user_id", "nome"])

    op.create_table(
        "meal_slot_item",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("meal_slot_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("food_item_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("quantidade_g", sa.Numeric(7, 2), nullable=True),
        sa.Column("ordem", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("observacao", sa.String(240), nullable=True),
        *_sync_columns(),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["app_user.id"],
            name="fk_meal_slot_item_user_id_app_user",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["meal_slot_id"],
            ["meal_slot.id"],
            name="fk_meal_slot_item_meal_slot_id_meal_slot",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["food_item_id"],
            ["food_item.id"],
            name="fk_meal_slot_item_food_item_id_food_item",
            ondelete="CASCADE",
        ),
    )
    op.create_index("ix_meal_slot_item_user_id_slot", "meal_slot_item", ["user_id", "meal_slot_id"])

    op.create_table(
        "nutrition_target",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("meal_plan_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("proteina_g_kg", sa.Numeric(4, 2), nullable=False),
        sa.Column("gordura_g_kg", sa.Numeric(4, 2), nullable=False),
        sa.Column("fibra_g_por_1000kcal", sa.Numeric(4, 1), nullable=False),
        sa.Column("fator_atividade", sa.Numeric(3, 2), nullable=False),
        sa.Column("ajuste_calorico", sa.Numeric(4, 3), nullable=False),
        sa.Column("manutencao_kcal_manual", sa.Integer(), nullable=True),
        sa.Column("sexo", sa.String(1), nullable=True),
        sa.Column("idade", sa.Integer(), nullable=True),
        sa.Column("altura_cm", sa.Integer(), nullable=True),
        *_sync_columns(),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["app_user.id"],
            name="fk_nutrition_target_user_id_app_user",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["meal_plan_id"],
            ["meal_plan.id"],
            name="fk_nutrition_target_meal_plan_id_meal_plan",
            ondelete="CASCADE",
        ),
        sa.CheckConstraint("sexo IS NULL OR sexo IN ('M','F')", name="ck_nutrition_target_sexo"),
    )
    op.create_index(
        "ix_nutrition_target_user_id_plan", "nutrition_target", ["user_id", "meal_plan_id"]
    )

    for table in TABELAS_CATALOGO:
        _sync_infra(table)
        _policies_catalogo(table)
    for table in TABELAS_USUARIO:
        _sync_infra(table)
        _policies_usuario(table)


def downgrade() -> None:
    for table in (*reversed(TABELAS_USUARIO), *reversed(TABELAS_CATALOGO)):
        op.execute(f"DROP TABLE IF EXISTS {table} CASCADE")
