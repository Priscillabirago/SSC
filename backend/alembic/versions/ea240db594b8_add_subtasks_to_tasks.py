"""add subtasks to tasks

Revision ID: ea240db594b8
Revises: e361c11cea6b
Create Date: 2025-01-27 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'ea240db594b8'
down_revision: Union[str, None] = 'e361c11cea6b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add subtasks column as JSON (stored as TEXT in SQLite)
    # Subtasks format: [{"id": "uuid", "title": "string", "completed": bool, "estimated_minutes": int}]
    op.add_column('tasks', sa.Column('subtasks', sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column('tasks', 'subtasks')

