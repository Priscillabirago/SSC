"""add_day_capacity_overrides

Revision ID: 97ff03a5b568
Revises: 13f3a670cd92
Create Date: 2025-12-07 23:21:03.292262

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '97ff03a5b568'
down_revision: Union[str, None] = '13f3a670cd92'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass

