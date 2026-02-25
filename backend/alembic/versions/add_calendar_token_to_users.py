"""add calendar_token to users

Revision ID: add_calendar_token
Revises: add_notes_to_tasks
Create Date: 2026-02-23 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'add_calendar_token'
down_revision: Union[str, None] = 'add_notes_to_tasks'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    columns = [col['name'] for col in inspector.get_columns('users')]

    with op.batch_alter_table('users', schema=None) as batch_op:
        if 'calendar_token' not in columns:
            batch_op.add_column(sa.Column('calendar_token', sa.String(64), nullable=True))
            batch_op.create_index('ix_users_calendar_token', ['calendar_token'], unique=True)


def downgrade() -> None:
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.drop_index('ix_users_calendar_token')
        batch_op.drop_column('calendar_token')
