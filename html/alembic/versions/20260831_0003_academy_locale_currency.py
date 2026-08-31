"""academy locale and currency

Revision ID: 20260831_0003
Revises: 20260830_0002
Create Date: 2026-08-31
"""

from alembic import op
import sqlalchemy as sa


revision = "20260831_0003"
down_revision = "20260830_0002"
branch_labels = None
depends_on = None


def _column_exists(bind, table, column):
    if not sa.inspect(bind).has_table(table):
        return False
    return column in [c["name"] for c in sa.inspect(bind).get_columns(table)]


def upgrade():
    bind = op.get_bind()
    columns = [
        ("country_code", sa.String(length=2), "MD"),
        ("currency", sa.String(length=3), "MDL"),
        ("default_language", sa.String(length=5), "ru"),
        ("locale", sa.String(length=20), "ru-MD"),
        ("timezone", sa.String(length=60), "Europe/Chisinau"),
    ]

    for name, type_, default in columns:
        if not _column_exists(bind, "academies", name):
            op.add_column(
                "academies",
                sa.Column(name, type_, nullable=False, server_default=default),
            )

    op.execute(
        """
        UPDATE academies
        SET country_code = 'RU',
            currency = 'RUB',
            default_language = 'ru',
            locale = 'ru-RU',
            timezone = 'Europe/Moscow'
        WHERE lower(coalesce(city, '')) IN ('королев', 'королёв', 'moscow', 'москва')
           OR slug IN ('eleven')
        """
    )


def downgrade():
    bind = op.get_bind()
    for column in ["timezone", "locale", "default_language", "currency", "country_code"]:
        if _column_exists(bind, "academies", column):
            op.drop_column("academies", column)
