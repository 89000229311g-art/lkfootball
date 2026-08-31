"""extend tenant isolation for pilot modules

Revision ID: 20260831_0004
Revises: 20260831_0003
Create Date: 2026-08-31
"""

from alembic import op
import sqlalchemy as sa


revision = "20260831_0004"
down_revision = "20260831_0003"
branch_labels = None
depends_on = None


TENANT_TABLES = [
    "audit_log",
    "leads",
    "marketing_campaigns",
    "tasks",
    "funnel_stages",
    "employee_contracts",
    "salary_payments",
    "hr_candidates",
    "hr_funnel_stages",
    "schedule_templates",
    "generated_events",
    "schedule_changes",
]


def _table_exists(bind, name):
    return sa.inspect(bind).has_table(name)


def _column_exists(bind, table, column):
    if not _table_exists(bind, table):
        return False
    return column in [c["name"] for c in sa.inspect(bind).get_columns(table)]


def _index_exists(bind, table, index_name):
    if not _table_exists(bind, table):
        return False
    return index_name in [i["name"] for i in sa.inspect(bind).get_indexes(table)]


def _add_academy_column(bind, table):
    if not _table_exists(bind, table):
        return
    if not _column_exists(bind, table, "academy_id"):
        op.add_column(table, sa.Column("academy_id", sa.Integer(), nullable=True))
    index_name = f"ix_{table}_academy_id"
    if not _index_exists(bind, table, index_name):
        op.create_index(index_name, table, ["academy_id"])


def upgrade():
    bind = op.get_bind()
    for table in TENANT_TABLES:
        _add_academy_column(bind, table)

    # Backfill old/global records to the legacy primary academy so new academies stay clean.
    if _table_exists(bind, "users"):
        op.execute(
            """
            UPDATE audit_log a SET academy_id = COALESCE(
              NULLIF(a.new_data->>'academy_id', '')::integer,
              NULLIF(a.old_data->>'academy_id', '')::integer,
              u.academy_id,
              1
            )
            FROM users u
            WHERE a.user_id = u.id AND a.academy_id IS NULL
            """
        )
    op.execute("UPDATE audit_log SET academy_id = COALESCE(NULLIF(new_data->>'academy_id', '')::integer, NULLIF(old_data->>'academy_id', '')::integer, 1) WHERE academy_id IS NULL")

    for table in ["leads", "marketing_campaigns", "tasks", "funnel_stages", "hr_candidates", "hr_funnel_stages"]:
        if _table_exists(bind, table):
            op.execute(f"UPDATE {table} SET academy_id = 1 WHERE academy_id IS NULL")

    if _table_exists(bind, "users"):
        op.execute("UPDATE employee_contracts c SET academy_id = u.academy_id FROM users u WHERE c.user_id = u.id AND c.academy_id IS NULL")
        op.execute("UPDATE salary_payments p SET academy_id = u.academy_id FROM users u WHERE p.user_id = u.id AND p.academy_id IS NULL")
    if _table_exists(bind, "groups"):
        op.execute("UPDATE schedule_templates t SET academy_id = g.academy_id FROM groups g WHERE t.group_id = g.id AND t.academy_id IS NULL")
        op.execute("UPDATE schedule_changes sc SET academy_id = g.academy_id FROM groups g WHERE sc.group_id = g.id AND sc.academy_id IS NULL")
    if _table_exists(bind, "events"):
        op.execute("UPDATE generated_events ge SET academy_id = e.academy_id FROM events e WHERE ge.event_id = e.id AND ge.academy_id IS NULL")


def downgrade():
    bind = op.get_bind()
    for table in reversed(TENANT_TABLES):
        if _column_exists(bind, table, "academy_id"):
            index_name = f"ix_{table}_academy_id"
            if _index_exists(bind, table, index_name):
                op.drop_index(index_name, table_name=table)
            op.drop_column(table, "academy_id")
