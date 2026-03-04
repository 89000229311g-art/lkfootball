import sys
import os
from datetime import datetime

# Add project root to path
sys.path.append(os.getcwd())

from sqlalchemy.orm import Session
from app.core.deps import get_db
from app.models import Student, StudentGuardian
from app.core.timezone import now_naive

def delete_orphaned_students():
    """
    Finds and soft-deletes students who have no guardians linked.
    """
    db = next(get_db())
    
    print("Searching for orphaned students (no guardians)...")
    
    # Find active students with no guardians
    # Use outer join to find students where no StudentGuardian record exists
    orphans = db.query(Student).outerjoin(StudentGuardian).filter(
        StudentGuardian.id == None,
        Student.deleted_at == None,
        Student.status != "archived"  # Only active or frozen
    ).all()
    
    if not orphans:
        print("No orphaned students found.")
        return

    print(f"Found {len(orphans)} orphaned students:")
    
    deleted_count = 0
    for student in orphans:
        print(f"  - ID: {student.id}, Name: {student.first_name} {student.last_name}, Group ID: {student.group_id}")
        
        # Soft delete logic matching app/routers/students.py
        student.deleted_at = now_naive()
        student.status = "archived"
        student.deletion_reason = "Orphan cleanup script (no guardians)"
        # We don't have a current_user context here, so deleted_by_id remains None or could be set to a system user ID if available
        
        db.add(student)
        deleted_count += 1
    
    confirm = input(f"\nAre you sure you want to delete these {deleted_count} students? (yes/no): ")
    if confirm.lower() == 'yes':
        db.commit()
        print(f"Successfully archived {deleted_count} students.")
    else:
        print("Operation cancelled.")

if __name__ == "__main__":
    delete_orphaned_students()
