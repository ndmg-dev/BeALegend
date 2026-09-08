"""Preferencia de push para conquista desbloqueada.

Revision ID: 0011
Revises: 0010
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0011"
down_revision: str | None = "0010"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "notification_preference",
        sa.Column(
            "conquista_enabled", sa.Boolean(), nullable=False, server_default=sa.true()
        ),
    )


def downgrade() -> None:
    op.drop_column("notification_preference", "conquista_enabled")
