"""add platform owner role

Revision ID: 20260830_0002
Revises: 20260830_0001
Create Date: 2026-08-30
"""

from alembic import op


revision = "20260830_0002"
down_revision = "20260830_0001"
branch_labels = None
depends_on = None


def upgrade():
    context = op.get_context()
    with context.autocommit_block():
        op.execute("ALTER TYPE userrole ADD VALUE IF NOT EXISTS 'platform_owner'")


def downgrade():
    pass
