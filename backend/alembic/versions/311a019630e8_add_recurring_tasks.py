"""add_recurring_tasks

Revision ID: 311a019630e8
Revises: ea240db594b8
Create Date: 2025-12-02 19:58:36.574450

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '311a019630e8'
down_revision: Union[str, None] = 'ea240db594b8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Check if columns already exist (for re-running migrations)
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    columns = [col['name'] for col in inspector.get_columns('tasks')]
    
    # SQLite doesn't support ALTER TABLE for foreign keys, so we use batch mode
    with op.batch_alter_table('tasks', schema=None) as batch_op:
        # Add recurring task fields only if they don't exist
        if 'is_recurring_template' not in columns:
            # is_recurring_template: marks if this task is a template for recurring instances
            batch_op.add_column(sa.Column('is_recurring_template', sa.Boolean(), nullable=False, server_default='0'))
        
        if 'recurring_template_id' not in columns:
            # recurring_template_id: self-referential FK to the template (NULL for templates, points to template for instances)
            # Note: SQLite doesn't enforce foreign keys by default, but we add the column for consistency
            batch_op.add_column(sa.Column('recurring_template_id', sa.Integer(), nullable=True))
        
        if 'recurrence_pattern' not in columns:
            # recurrence_pattern: JSON storing pattern config
            # Format: {"frequency": "daily|weekly|biweekly|monthly", "interval": 1, "days_of_week": [0,2,4], 
            #          "day_of_month": 15, "week_of_month": 2, "advance_days": 3}
            batch_op.add_column(sa.Column('recurrence_pattern', sa.JSON(), nullable=True))
        
        if 'recurrence_end_date' not in columns:
            # recurrence_end_date: when to stop generating instances (NULL = never)
            batch_op.add_column(sa.Column('recurrence_end_date', sa.DateTime(), nullable=True))
        
        if 'next_occurrence_date' not in columns:
            # next_occurrence_date: when to create the next instance (for templates)
            batch_op.add_column(sa.Column('next_occurrence_date', sa.DateTime(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('tasks', schema=None) as batch_op:
        batch_op.drop_column('next_occurrence_date')
        batch_op.drop_column('recurrence_end_date')
        batch_op.drop_column('recurrence_pattern')
        batch_op.drop_column('recurring_template_id')
        batch_op.drop_column('is_recurring_template')

