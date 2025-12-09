"""add notes column to StudySession

Revision ID: 1c69127bb430
Revises: 
Create Date: 2025-12-02 13:34:13.151779

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '1c69127bb430'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # SAFE: Only add the notes column to study_sessions
    # Do NOT drop coach_chat_messages table - it exists and is needed
    op.add_column('study_sessions', sa.Column('notes', sa.String(length=255), nullable=True))


def downgrade() -> None:
    # SAFE: Only remove the notes column if rolling back
    op.drop_column('study_sessions', 'notes')

