"""Vinculo de parceiro: convite mutuo e leitura compartilhada do progresso.

Revision ID: 0012
Revises: 0011

`partner_link` e' uma tabela comum (nao participa do sync — e' interacao em
tempo real, nao dado offline). O que ela desbloqueia e' visibilidade extra em
RLS: `app_is_partner_of(other_user_id)` diz se o usuario atual tem um vinculo
aceito com `other_user_id`, e as policies de SELECT de `session`, `meal_log`,
`habit` e `habit_checkin` passam a deixar essas linhas passarem tambem —
exatamente o que o resumo semanal do parceiro le. `finance_transaction` fica
de fora de proposito: gasto e' o dado mais sensivel do app, e a feature pedida
foi "ver o progresso do parceiro", nao "ver as financas do parceiro".
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0012"
down_revision: str | None = "0011"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

APP_ROLE = "bealegend_app"
#: Tabelas cuja SELECT passa a valer tambem para quem tem vinculo aceito com
#: o dono da linha. Compartilhar aqui e' o que faz o resumo do parceiro
#: funcionar sem nenhuma query rodar fora da RLS do usuario que pergunta.
TABELAS_COMPARTILHADAS = ("session", "meal_log", "habit", "habit_checkin")


def upgrade() -> None:
    op.create_table(
        "partner_link",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("requester_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("receiver_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("status", sa.String(10), nullable=False, server_default="pendente"),
        sa.Column(
            "criado_em", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column("respondido_em", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["requester_id"], ["app_user.id"], name="fk_partner_link_requester_id_app_user",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["receiver_id"], ["app_user.id"], name="fk_partner_link_receiver_id_app_user",
            ondelete="CASCADE",
        ),
        sa.CheckConstraint(
            "status IN ('pendente','aceito','recusado')", name="ck_partner_link_status"
        ),
        sa.CheckConstraint("requester_id <> receiver_id", name="ck_partner_link_not_self"),
    )
    op.create_index("ix_partner_link_requester_id", "partner_link", ["requester_id"])
    op.create_index("ix_partner_link_receiver_id", "partner_link", ["receiver_id"])

    op.execute("ALTER TABLE partner_link ENABLE ROW LEVEL SECURITY")
    op.execute(f"GRANT SELECT, INSERT, UPDATE, DELETE ON partner_link TO {APP_ROLE}")
    op.execute(
        "CREATE POLICY partner_link_select ON partner_link FOR SELECT "
        "USING (requester_id = app_current_user_id() OR receiver_id = app_current_user_id())"
    )
    op.execute(
        "CREATE POLICY partner_link_insert ON partner_link FOR INSERT "
        "WITH CHECK (requester_id = app_current_user_id())"
    )
    # So' quem recebeu o convite pode mudar o status (aceitar/recusar); quem
    # convidou cancela apagando a linha (policy de DELETE abaixo), nao
    # editando — evita um requester "auto-aceitar" o proprio convite.
    op.execute(
        "CREATE POLICY partner_link_update ON partner_link FOR UPDATE "
        "USING (receiver_id = app_current_user_id()) "
        "WITH CHECK (receiver_id = app_current_user_id())"
    )
    op.execute(
        "CREATE POLICY partner_link_delete ON partner_link FOR DELETE "
        "USING (requester_id = app_current_user_id() OR receiver_id = app_current_user_id())"
    )

    op.execute(
        """
        CREATE FUNCTION app_is_partner_of(other_user_id uuid) RETURNS boolean
        LANGUAGE sql STABLE AS $$
          SELECT EXISTS (
            SELECT 1 FROM partner_link
            WHERE status = 'aceito'
              AND (requester_id = other_user_id OR receiver_id = other_user_id)
          )
        $$;
        """
    )
    op.execute(f"GRANT EXECUTE ON FUNCTION app_is_partner_of(uuid) TO {APP_ROLE}")

    for table in TABELAS_COMPARTILHADAS:
        op.execute(f"DROP POLICY {table}_select ON {table}")
        op.execute(
            f"CREATE POLICY {table}_select ON {table} FOR SELECT "
            "USING (user_id = app_current_user_id() OR app_is_partner_of(user_id))"
        )


def downgrade() -> None:
    for table in TABELAS_COMPARTILHADAS:
        op.execute(f"DROP POLICY {table}_select ON {table}")
        op.execute(
            f"CREATE POLICY {table}_select ON {table} FOR SELECT "
            "USING (user_id = app_current_user_id())"
        )

    op.execute("DROP FUNCTION IF EXISTS app_is_partner_of(uuid)")
    op.execute("DROP TABLE IF EXISTS partner_link CASCADE")
