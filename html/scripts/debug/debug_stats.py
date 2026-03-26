
from sqlalchemy import create_engine, func
from sqlalchemy.orm import sessionmaker
from app.core.config import settings
from app.models import Student, Group, User

engine = create_engine(settings.SQLALCHEMY_DATABASE_URI)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
db = SessionLocal()

print("--- DB STATS ---")
total_students_all = db.query(func.count(Student.id)).scalar()
total_students_active = db.query(func.count(Student.id)).filter(Student.deleted_at.is_(None)).scalar()
total_students_deleted = db.query(func.count(Student.id)).filter(Student.deleted_at.isnot(None)).scalar()

print(f"Students: Total={total_students_all}, Active={total_students_active}, Deleted={total_students_deleted}")

total_groups_all = db.query(func.count(Group.id)).scalar()
total_groups_active = db.query(func.count(Group.id)).filter(Group.deleted_at.is_(None)).scalar()
total_groups_deleted = db.query(func.count(Group.id)).filter(Group.deleted_at.isnot(None)).scalar()

print(f"Groups: Total={total_groups_all}, Active={total_groups_active}, Deleted={total_groups_deleted}")

# Check status distribution of active students
from sqlalchemy import func
status_counts = db.query(Student.status, func.count(Student.id)).filter(Student.deleted_at.is_(None)).group_by(Student.status).all()
print("Active Students Status Distribution:", status_counts)

# Check user role if possible (assuming we know the user ID or just list admins)
admins = db.query(User.id, User.role, User.full_name).filter(User.role.in_(['admin', 'super_admin', 'owner'])).all()
print("Admins:", admins)
