"""add task status and time tracking

Revision ID: e361c11cea6b
Revises: 1c69127bb430
Create Date: 2025-01-27 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e361c11cea6b'
down_revision: Union[str, None] = '1c69127bb430'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add status column with default 'todo'
    # Use String for SQLite compatibility (SQLite doesn't support native ENUM)
    op.add_column('tasks', sa.Column('status', sa.String(20), nullable=False, server_default='todo'))
    
    # Add actual_minutes_spent column (nullable)
    op.add_column('tasks', sa.Column('actual_minutes_spent', sa.Integer(), nullable=True))
    
    # Update existing completed tasks to have status='completed'
    op.execute("UPDATE tasks SET status = 'completed' WHERE is_completed = true")


def downgrade() -> None:
    op.drop_column('tasks', 'actual_minutes_spent')
    op.drop_column('tasks', 'status')
    # Note: The enum type will be dropped automatically when the column is dropped

