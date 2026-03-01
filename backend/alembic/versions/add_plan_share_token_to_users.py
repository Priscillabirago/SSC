"""add plan_share_token and plan_share_expires_at to users

Revision ID: add_plan_share_token
Revises: add_calendar_token
Create Date: 2026-02-23

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "add_plan_share_token"
down_revision: Union[str, None] = "add_calendar_token"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    columns = [col["name"] for col in inspector.get_columns("users")]

    with op.batch_alter_table("users", schema=None) as batch_op:
        if "plan_share_token" not in columns:
            batch_op.add_column(sa.Column("plan_share_token", sa.String(64), nullable=True))
            batch_op.create_index("ix_users_plan_share_token", ["plan_share_token"], unique=True)
        if "plan_share_expires_at" not in columns:
            batch_op.add_column(sa.Column("plan_share_expires_at", sa.DateTime(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.drop_index("ix_users_plan_share_token")
        batch_op.drop_column("plan_share_token")
        batch_op.drop_column("plan_share_expires_at")
