"""add_completed_at_to_tasks

Revision ID: 281e16dcf539
Revises: aa53967cc53a
Create Date: 2025-12-10 19:55:13.764406

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '281e16dcf539'
down_revision: Union[str, None] = 'aa53967cc53a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Check if column already exists (for re-running migrations)
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    columns = [col['name'] for col in inspector.get_columns('tasks')]
    
    # SQLite doesn't support ALTER TABLE for foreign keys, so we use batch mode
    with op.batch_alter_table('tasks', schema=None) as batch_op:
        if 'completed_at' not in columns:
            # completed_at: timestamp when task was marked complete (nullable)
            batch_op.add_column(sa.Column('completed_at', sa.DateTime(), nullable=True))
    
    # Backfill existing completed tasks: use updated_at as best guess for completion time
    # This is imperfect but better than NULL for existing data
    op.execute("""
        UPDATE tasks 
        SET completed_at = updated_at 
        WHERE is_completed = 1 AND completed_at IS NULL
    """)


def downgrade() -> None:
    with op.batch_alter_table('tasks', schema=None) as batch_op:
        batch_op.drop_column('completed_at')

