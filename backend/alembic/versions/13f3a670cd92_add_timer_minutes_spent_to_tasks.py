"""add_timer_minutes_spent_to_tasks

Revision ID: 13f3a670cd92
Revises: 311a019630e8
Create Date: 2025-12-07 22:15:05.569052

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '13f3a670cd92'
down_revision: Union[str, None] = '311a019630e8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Check if column already exists (for re-running migrations)
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    columns = [col['name'] for col in inspector.get_columns('tasks')]
    
    # SQLite doesn't support ALTER TABLE for foreign keys, so we use batch mode
    with op.batch_alter_table('tasks', schema=None) as batch_op:
        if 'timer_minutes_spent' not in columns:
            # timer_minutes_spent: time tracked via timer on Tasks page (separate from session time)
            batch_op.add_column(sa.Column('timer_minutes_spent', sa.Integer(), nullable=False, server_default='0'))
    
    # Migrate existing data: if actual_minutes_spent exists, try to preserve it
    # We'll assume existing actual_minutes_spent might include timer time, but we can't perfectly separate it
    # So we'll set timer_minutes_spent to 0 and let actual_minutes_spent represent session time
    # Users can manually adjust if needed
    op.execute("""
        UPDATE tasks 
        SET timer_minutes_spent = 0 
        WHERE timer_minutes_spent IS NULL
    """)


def downgrade() -> None:
    with op.batch_alter_table('tasks', schema=None) as batch_op:
        batch_op.drop_column('timer_minutes_spent')

