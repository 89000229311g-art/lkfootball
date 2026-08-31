"""multi academy foundation

Revision ID: 20260830_0001
Revises: init_db_managed
Create Date: 2026-08-30
"""

from alembic import op
import sqlalchemy as sa


revision = "20260830_0001"
down_revision = "init_db_managed"
branch_labels = None
depends_on = None


TENANT_TABLES = [
    "users",
    "students",
    "groups",
    "events",
    "payments",
    "messages",
    "posts",
    "school_settings",
]


def _table_exists(bind, name):
    return sa.inspect(bind).has_table(name)


def _column_exists(bind, table, column):
    if not _table_exists(bind, table):
        return False
    return column in [c["name"] for c in sa.inspect(bind).get_columns(table)]


def upgrade():
    bind = op.get_bind()

    if not _table_exists(bind, "academies"):
        op.create_table(
            "academies",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("name", sa.String(length=200), nullable=False),
            sa.Column("short_name", sa.String(length=80), nullable=True),
            sa.Column("slug", sa.String(length=80), nullable=False),
            sa.Column("logo_url", sa.String(length=500), nullable=True),
            sa.Column("primary_color", sa.String(length=20), nullable=False, server_default="#EAB308"),
            sa.Column("city", sa.String(length=120), nullable=True),
            sa.Column("contact_phone", sa.String(length=50), nullable=True),
            sa.Column("contact_email", sa.String(length=200), nullable=True),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("subscription_status", sa.String(length=30), nullable=False, server_default="trial"),
            sa.Column("subscription_plan", sa.String(length=50), nullable=False, server_default="starter"),
            sa.Column("subscription_expires_at", sa.Date(), nullable=True),
            sa.Column("max_users", sa.Integer(), nullable=True),
            sa.Column("max_students", sa.Integer(), nullable=True),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_academies_id", "academies", ["id"])
        op.create_index("ix_academies_slug", "academies", ["slug"], unique=True)

    op.execute(
        """
        INSERT INTO academies (
            name, short_name, slug, primary_color, subscription_status,
            subscription_plan, is_active, created_at, updated_at
        )
        SELECT 'Football CRM', 'Football CRM', 'sunny', '#16A34A', 'active', 'legacy', true, now(), now()
        WHERE NOT EXISTS (SELECT 1 FROM academies WHERE slug = 'sunny')
        """
    )

    for table in TENANT_TABLES:
        if _table_exists(bind, table) and not _column_exists(bind, table, "academy_id"):
            op.add_column(table, sa.Column("academy_id", sa.Integer(), nullable=True))
            op.create_index(f"ix_{table}_academy_id", table, ["academy_id"])
            op.create_foreign_key(
                f"fk_{table}_academy_id_academies",
                table,
                "academies",
                ["academy_id"],
                ["id"],
                ondelete="RESTRICT" if table != "school_settings" else "CASCADE",
            )
            op.execute(
                f"""
                UPDATE {table}
                SET academy_id = (SELECT id FROM academies WHERE slug = 'sunny')
                WHERE academy_id IS NULL
                """
            )

    if _table_exists(bind, "group_coaches") and not _column_exists(bind, "group_coaches", "academy_id"):
        op.add_column("group_coaches", sa.Column("academy_id", sa.Integer(), nullable=True))
        op.create_index("ix_group_coaches_academy_id", "group_coaches", ["academy_id"])
        op.create_foreign_key(
            "fk_group_coaches_academy_id_academies",
            "group_coaches",
            "academies",
            ["academy_id"],
            ["id"],
            ondelete="CASCADE",
        )
        op.execute(
            """
            UPDATE group_coaches gc
            SET academy_id = g.academy_id
            FROM groups g
            WHERE gc.group_id = g.id AND gc.academy_id IS NULL
            """
        )

    if _table_exists(bind, "payments"):
        op.create_index(
            "ix_payment_academy_status_date",
            "payments",
            ["academy_id", "status", "payment_date"],
            unique=False,
            if_not_exists=True,
        )

    if _table_exists(bind, "users"):
        op.execute(
            """
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1 FROM pg_constraint
                    WHERE conname = 'users_phone_key'
                ) THEN
                    ALTER TABLE users DROP CONSTRAINT users_phone_key;
                END IF;
            END $$;
            """
        )
        op.create_index("ix_users_academy_phone", "users", ["academy_id", "phone"], unique=True, if_not_exists=True)

    if _table_exists(bind, "school_settings"):
        op.execute(
            """
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1 FROM pg_constraint
                    WHERE conname = 'school_settings_key_key'
                ) THEN
                    ALTER TABLE school_settings DROP CONSTRAINT school_settings_key_key;
                END IF;
            END $$;
            """
        )
        op.create_index(
            "ix_school_settings_academy_key",
            "school_settings",
            ["academy_id", "key"],
            unique=True,
            if_not_exists=True,
        )


def downgrade():
    bind = op.get_bind()

    for table in reversed(TENANT_TABLES):
        if _column_exists(bind, table, "academy_id"):
            op.drop_constraint(f"fk_{table}_academy_id_academies", table, type_="foreignkey")
            op.drop_index(f"ix_{table}_academy_id", table_name=table)
            op.drop_column(table, "academy_id")

    if _column_exists(bind, "group_coaches", "academy_id"):
        op.drop_constraint("fk_group_coaches_academy_id_academies", "group_coaches", type_="foreignkey")
        op.drop_index("ix_group_coaches_academy_id", table_name="group_coaches")
        op.drop_column("group_coaches", "academy_id")

    if _table_exists(bind, "academies"):
        op.drop_index("ix_academies_slug", table_name="academies")
        op.drop_index("ix_academies_id", table_name="academies")
        op.drop_table("academies")
