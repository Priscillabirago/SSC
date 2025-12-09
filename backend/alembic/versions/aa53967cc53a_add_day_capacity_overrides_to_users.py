"""add_day_capacity_overrides_to_users

Revision ID: aa53967cc53a
Revises: 97ff03a5b568
Create Date: 2025-12-07 23:33:39.231923

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'aa53967cc53a'
down_revision: Union[str, None] = '97ff03a5b568'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass

