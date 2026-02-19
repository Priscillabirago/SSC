"""add notes to tasks

Revision ID: add_notes_to_tasks
Revises: c2c428812587
Create Date: 2025-01-27 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'add_notes_to_tasks'
down_revision: Union[str, None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add notes column as Text (for user notes on tasks)
    op.add_column('tasks', sa.Column('notes', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('tasks', 'notes')

