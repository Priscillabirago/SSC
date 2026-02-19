"""add_in_progress_session_status

Revision ID: 082a320e62e1
Revises: c2c428812587
Create Date: 2025-01-21 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '082a320e62e1'
down_revision: Union[str, None] = 'c2c428812587'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add 'in_progress' to the SessionStatus enum
    # For SQLite: enum values are stored as strings, so no schema change needed
    # For PostgreSQL: need to add the new enum value
    
    conn = op.get_bind()
    dialect = conn.dialect.name
    
    if dialect == 'postgresql':
        # PostgreSQL requires explicit enum type alteration
        op.execute("ALTER TYPE sessionstatus ADD VALUE IF NOT EXISTS 'in_progress'")
    # For SQLite and other databases that store enums as strings, no action needed
    # The Python enum in the model will handle validation


def downgrade() -> None:
    # Note: PostgreSQL doesn't support removing enum values easily
    # For downgrade, we'd need to:
    # 1. Update any 'in_progress' sessions to 'partial' (closest equivalent)
    # 2. Cannot remove the enum value from PostgreSQL without recreating the type
    
    conn = op.get_bind()
    dialect = conn.dialect.name
    
    # Convert any in_progress sessions to partial before downgrade
    op.execute("UPDATE study_sessions SET status = 'partial' WHERE status = 'in_progress'")
    
    # Note: We cannot remove the enum value from PostgreSQL
    # The value will remain in the type but won't be used by the application

