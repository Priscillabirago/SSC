"""add is_pinned to study_sessions

Revision ID: a1b2c3d4e5f6
Revises: 082a320e62e1
Create Date: 2025-01-21 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = '082a320e62e1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add is_pinned column to study_sessions
    # Default to False for existing sessions
    op.add_column('study_sessions', sa.Column('is_pinned', sa.Boolean(), nullable=False, server_default='false'))


def downgrade() -> None:
    op.drop_column('study_sessions', 'is_pinned')
