import sys
import os
from datetime import date

# Add project root to path
sys.path.append(os.getcwd())

from sqlalchemy.orm import Session
from app.core.deps import get_db
from app.models import Student, StudentGuardian
from app.core.timezone import now_naive

def test_delete_orphans():
    db = next(get_db())
    
    # 1. Create a dummy orphan student
    print("Creating dummy orphan student...")
    orphan = Student(
        first_name="TestOrphan",
        last_name="ToDelete",
        dob=date(2015, 1, 1),
        status="active"
    )
    db.add(orphan)
    db.commit()
    db.refresh(orphan)
    print(f"Created orphan student ID: {orphan.id}")
    
    # 2. Verify it is an orphan
    guardian = db.query(StudentGuardian).filter(StudentGuardian.student_id == orphan.id).first()
    if guardian:
        print("Error: Student has guardian!")
        return
    print("Verified: Student has no guardian.")
    
    # 3. Find and delete orphans
    print("Searching for orphans to delete...")
    # Find active students with no guardians
    orphans = db.query(Student).outerjoin(StudentGuardian).filter(
        StudentGuardian.id == None,
        Student.deleted_at == None,
        Student.status == "active"
    ).all()
    
    print(f"Found {len(orphans)} orphans.")
    
    deleted_count = 0
    for student in orphans:
        if student.first_name == "TestOrphan" and student.last_name == "ToDelete":
            print(f"Deleting orphan ID: {student.id} ({student.first_name} {student.last_name})")
            
            # Soft delete logic
            student.deleted_at = now_naive()
            student.status = "archived"
            student.deletion_reason = "Orphan cleanup script"
            
            db.add(student)
            deleted_count += 1
    
    db.commit()
    print(f"Deleted {deleted_count} orphans.")
    
    # 4. Verify deletion
    check_student = db.query(Student).filter(Student.id == orphan.id).first()
    if check_student.deleted_at and check_student.status == "archived":
        print("Success: Student was soft deleted.")
    else:
        print("Error: Student was not deleted correctly.")

if __name__ == "__main__":
    test_delete_orphans()
