"""Web Push, preferencias e entregas idempotentes.

Revision ID: 0007
Revises: 0006
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0007"
down_revision: str | None = "0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

APP_ROLE = "bealegend_app"


def _timestamps() -> list[sa.Column]:
    return [
        sa.Column(
            "criado_em", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
    ]


def _rls(table: str) -> None:
    op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
    for action in ("select", "insert", "update", "delete"):
        using = "USING (user_id = app_current_user_id())" if action != "insert" else ""
        check = (
            "WITH CHECK (user_id = app_current_user_id())" if action in ("insert", "update") else ""
        )
        op.execute(
            f"CREATE POLICY {table}_{action} ON {table} FOR {action.upper()} {using} {check}"
        )
    op.execute(f"GRANT SELECT, INSERT, UPDATE, DELETE ON {table} TO {APP_ROLE}")


def upgrade() -> None:
    op.create_table(
        "push_subscription",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("endpoint", sa.Text(), nullable=False, unique=True),
        sa.Column("p256dh", sa.Text(), nullable=False),
        sa.Column("auth", sa.Text(), nullable=False),
        sa.Column("user_agent", sa.String(500), nullable=True),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("failure_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_success_at", sa.DateTime(timezone=True), nullable=True),
        *_timestamps(),
        sa.ForeignKeyConstraint(["user_id"], ["app_user.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_push_subscription_user_active", "push_subscription", ["user_id", "active"])
    op.create_table(
        "notification_preference",
        sa.Column("user_id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("treino_enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("treino_horario", sa.Time(), nullable=False, server_default="18:00"),
        sa.Column("refeicao_enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("resumo_semanal_enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("resumo_dia_semana", sa.Integer(), nullable=False, server_default="6"),
        sa.Column("resumo_horario", sa.Time(), nullable=False, server_default="18:00"),
        *_timestamps(),
        sa.ForeignKeyConstraint(["user_id"], ["app_user.id"], ondelete="CASCADE"),
        sa.CheckConstraint("resumo_dia_semana BETWEEN 0 AND 6", name="resumo_dia_valido"),
    )
    op.create_table(
        "notification_delivery",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("subscription_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("kind", sa.String(120), nullable=False),
        sa.Column("scheduled_for", sa.DateTime(timezone=True), nullable=False),
        sa.Column("payload", postgresql.JSONB(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("error", sa.String(500), nullable=True),
        sa.Column(
            "criado_em", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.ForeignKeyConstraint(["user_id"], ["app_user.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["subscription_id"], ["push_subscription.id"], ondelete="CASCADE"),
        sa.UniqueConstraint(
            "subscription_id", "kind", "scheduled_for", name="uq_notification_delivery_once"
        ),
    )
    op.create_index(
        "ix_notification_delivery_user_scheduled",
        "notification_delivery",
        ["user_id", "scheduled_for"],
    )
    for table in ("push_subscription", "notification_preference", "notification_delivery"):
        _rls(table)

    # Um endpoint Web Push identifica um navegador. Ao trocar de conta no mesmo
    # aparelho, a assinatura precisa mudar de dono; mantê-la nos dois usuários
    # vazaria o conteúdo de notificações. A função só aceita o usuário presente
    # no contexto RLS e não expõe a assinatura anterior.
    op.execute(
        """
        CREATE FUNCTION claim_push_subscription(
          p_user_id uuid, p_id uuid, p_endpoint text, p_p256dh text,
          p_auth text, p_user_agent varchar
        ) RETURNS void
        LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
        BEGIN
          IF p_user_id IS DISTINCT FROM app_current_user_id() THEN
            RAISE EXCEPTION 'invalid push owner';
          END IF;
          DELETE FROM push_subscription
          WHERE endpoint = p_endpoint AND user_id IS DISTINCT FROM p_user_id;
          INSERT INTO push_subscription (
            id, user_id, endpoint, p256dh, auth, user_agent, active,
            failure_count, criado_em, updated_at
          ) VALUES (
            p_id, p_user_id, p_endpoint, p_p256dh, p_auth, p_user_agent,
            true, 0, now(), now()
          )
          ON CONFLICT (endpoint) DO UPDATE SET
            user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh,
            auth = EXCLUDED.auth, user_agent = EXCLUDED.user_agent,
            active = true, failure_count = 0, updated_at = now();
        END $$;
        """
    )
    op.execute(
        "REVOKE ALL ON FUNCTION claim_push_subscription(uuid,uuid,text,text,text,varchar) "
        "FROM PUBLIC"
    )
    op.execute(
        f"GRANT EXECUTE ON FUNCTION claim_push_subscription(uuid,uuid,text,text,text,varchar) "
        f"TO {APP_ROLE}"
    )


def downgrade() -> None:
    op.execute("DROP FUNCTION IF EXISTS claim_push_subscription(uuid,uuid,text,text,text,varchar)")
    for table in ("notification_delivery", "notification_preference", "push_subscription"):
        op.execute(f"DROP TABLE IF EXISTS {table} CASCADE")
