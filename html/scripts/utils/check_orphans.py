from sqlalchemy.orm import Session
from app.core.deps import get_db
from app.models import Student, StudentGuardian
from app.core.timezone import now_naive

def check_orphans():
    db = next(get_db())
    
    # Find students with no guardians
    # Using left join and checking for null
    orphans = db.query(Student).outerjoin(StudentGuardian).filter(
        StudentGuardian.id == None,
        Student.deleted_at == None  # Only active students
    ).all()
    
    print(f"Found {len(orphans)} orphaned students:")
    for student in orphans:
        print(f"ID: {student.id}, Name: {student.first_name} {student.last_name}, Group: {student.group_id}")

if __name__ == "__main__":
    check_orphans()
