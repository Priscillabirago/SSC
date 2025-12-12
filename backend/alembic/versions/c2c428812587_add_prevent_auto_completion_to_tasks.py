"""add_prevent_auto_completion_to_tasks

Revision ID: c2c428812587
Revises: 281e16dcf539
Create Date: 2025-12-10 20:40:26.825254

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c2c428812587'
down_revision: Union[str, None] = '281e16dcf539'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    columns = [col['name'] for col in inspector.get_columns('tasks')]
    
    with op.batch_alter_table('tasks', schema=None) as batch_op:
        if 'prevent_auto_completion' not in columns:
            batch_op.add_column(sa.Column('prevent_auto_completion', sa.Boolean(), nullable=False, server_default='0'))


def downgrade() -> None:
    with op.batch_alter_table('tasks', schema=None) as batch_op:
        batch_op.drop_column('prevent_auto_completion')

