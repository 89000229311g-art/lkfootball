"""
Database initialization script.
- Creates ALL tables from SQLAlchemy models (via create_all)
- Ensures correct PostgreSQL enum values exist
- Creates default superuser if not present
- Safe to run multiple times (idempotent)
"""
import sys
import logging

logging.basicConfig(level=logging.INFO, format="%(message)s")
log = logging.getLogger(__name__)


def _add_missing_columns(engine):
    """
    Inspect all SQLAlchemy models and add any columns missing from the DB.
    Safe: uses ALTER TABLE ... ADD COLUMN IF NOT EXISTS.
    Does NOT drop or modify existing columns.
    """
    from sqlalchemy import text, inspect as sa_inspect
    from sqlalchemy.dialects.postgresql import ARRAY
    import sqlalchemy as sa

    inspector = sa_inspect(engine)
    existing_tables = inspector.get_table_names(schema="public")

    # Map SQLAlchemy column types to Postgres SQL types
    TYPE_MAP = {
        sa.Integer: "INTEGER",
        sa.BigInteger: "BIGINT",
        sa.String: "VARCHAR",
        sa.Text: "TEXT",
        sa.Boolean: "BOOLEAN",
        sa.Float: "DOUBLE PRECISION",
        sa.Numeric: "NUMERIC",
        sa.DateTime: "TIMESTAMP",
        sa.Date: "DATE",
        sa.JSON: "JSON",
    }

    from app.models.base import Base
    with engine.connect() as conn:
        for table in Base.metadata.sorted_tables:
            tname = table.name
            if tname not in existing_tables:
                continue  # will be created by create_all

            existing_cols = {c["name"] for c in inspector.get_columns(tname, schema="public")}

            for col in table.columns:
                if col.name in existing_cols:
                    continue

                # Determine SQL type string
                col_type = None
                for py_type, sql_type in TYPE_MAP.items():
                    if isinstance(col.type, py_type):
                        col_type = sql_type
                        break

                if col_type is None:
                    # For ARRAY, Enum and other special types — use TEXT as fallback
                    col_type = "TEXT"

                nullable = "" if col.nullable else " NOT NULL"
                default = ""
                if col.default is not None and hasattr(col.default, "arg"):
                    arg = col.default.arg
                    if callable(arg):
                        default = " DEFAULT NOW()" if "at" in col.name else ""
                    elif isinstance(arg, bool):
                        default = f" DEFAULT {'TRUE' if arg else 'FALSE'}"
                    elif isinstance(arg, (int, float)):
                        default = f" DEFAULT {arg}"
                    elif isinstance(arg, str):
                        default = f" DEFAULT '{arg}'"
                elif col.server_default is not None:
                    default = f" DEFAULT NOW()"
                # Boolean columns without explicit default — use FALSE
                elif isinstance(col.type, sa.Boolean):
                    default = " DEFAULT FALSE"

                sql = f'ALTER TABLE "{tname}" ADD COLUMN IF NOT EXISTS "{col.name}" {col_type}{default}'
                try:
                    conn.execute(text(sql))
                    conn.commit()
                    log.info(f"  + Added column: {tname}.{col.name} ({col_type})")
                except Exception as e:
                    conn.rollback()
                    log.warning(f"  ! Could not add {tname}.{col.name}: {e}")
        conn.commit()


def run():
    from app.core.database import engine, SessionLocal
    from app.models import (
        Base, User, UserRole,
        # Import ALL models so they register with Base.metadata
        Group, Student, StudentGuardian, Event, Booking, Attendance,
        Payment, InvoiceItem, Message, TrainingPlan, MediaReport,
        StudentGroupHistory, StudentSkills, SeasonSummary,
        ScheduleTemplate, GeneratedEvent, ScheduleChange, Achievement,
        EmployeeContract, SalaryPayment, AuditLog,
        StudentPhoto, AbsenceRequest, AnnouncementRead, GroupChatReadStatus,
        PaymentReminder, CoachRecommendation, TrialSession,
        Expense, PhysicalTest, StudentPhysicalTestResult, FreezeRequest,
        SchoolSettings, PushSubscription, MarketingCampaign,
        Lead, LeadTask, FunnelStage, HRCandidate, HRFunnelStage, Task,
    )
    from app.models.user_activity import UserActivityLog
    from app.models.credential import UserCredential
    from app.core.security import get_password_hash
    from sqlalchemy import text

    # ------------------------------------------------------------------ #
    # 1. Ensure PostgreSQL enums contain lowercase values expected by code #
    # ------------------------------------------------------------------ #
    enum_fixes = {
        "userrole":      ["super_admin", "admin", "coach", "parent", "owner", "accountant"],
        "paymentmethod": ["cash", "card", "bank_transfer", "online"],
        "attendancestatus": ["present", "absent", "late", "excused"],
    }

    with engine.connect() as conn:
        for enum_name, values in enum_fixes.items():
            # Check if enum exists
            exists = conn.execute(
                text("SELECT 1 FROM pg_type WHERE typname = :n"), {"n": enum_name}
            ).fetchone()
            if exists:
                for val in values:
                    already = conn.execute(
                        text(
                            "SELECT 1 FROM pg_enum "
                            "WHERE enumtypid=(SELECT oid FROM pg_type WHERE typname=:n) "
                            "AND enumlabel=:v"
                        ),
                        {"n": enum_name, "v": val},
                    ).fetchone()
                    if not already:
                        conn.execute(
                            text(f"ALTER TYPE {enum_name} ADD VALUE IF NOT EXISTS '{val}'")
                        )
                        log.info(f"  Added enum value: {enum_name}.{val}")
        conn.commit()

    # ------------------------------------------------------------------ #
    # 2. Create all tables (skips existing ones)                          #
    # ------------------------------------------------------------------ #
    log.info("[1/3] Creating database tables...")
    Base.metadata.create_all(bind=engine, checkfirst=True)
    log.info("      Tables ready.")

    # ------------------------------------------------------------------ #
    # 2b. Add missing columns to existing tables (safe ALTER TABLE)       #
    # ------------------------------------------------------------------ #
    log.info("[1b/3] Checking for missing columns in existing tables...")
    _add_missing_columns(engine)

    # ------------------------------------------------------------------ #
    # 3. Fix alembic_version to avoid migration errors                    #
    # ------------------------------------------------------------------ #
    with engine.connect() as conn:
        table_exists = conn.execute(
            text("SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'alembic_version')")
        ).fetchone()[0]

        if table_exists:
            conn.execute(text("DELETE FROM alembic_version"))
            conn.execute(text("INSERT INTO alembic_version (version_num) VALUES ('init_db_managed')"))
            log.info("      Alembic version table updated.")
        else:
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS alembic_version (
                    version_num VARCHAR(32) NOT NULL,
                    CONSTRAINT alembic_version_pk PRIMARY KEY (version_num)
                )
            """))
            conn.execute(text("INSERT INTO alembic_version (version_num) VALUES ('init_db_managed')"))
            log.info("      Alembic version table created.")
        conn.commit()

    # ------------------------------------------------------------------ #
    # 4. Create superuser if not exists                                   #
    # ------------------------------------------------------------------ #
    log.info("[2/3] Checking superuser...")
    db = SessionLocal()
    try:
        superuser = db.query(User).filter(
            User.role == UserRole.SUPER_ADMIN,
            User.deleted_at.is_(None)
        ).first()

        if not superuser:
            superuser = User(
                phone="+79777086823",
                password_hash=get_password_hash("79777086823"),
                full_name="Руководитель Sunny",
                role=UserRole.SUPER_ADMIN,
                is_active=True,
            )
            db.add(superuser)
            db.commit()
            log.info("      Superuser created: +79777086823 / 79777086823")
        else:
            log.info(f"      Superuser exists: {superuser.full_name} ({superuser.phone})")
    finally:
        db.close()

    log.info("[3/3] Database initialization complete.")


if __name__ == "__main__":
    run()
