"""
Create test data: 3 students with skill ratings linked to parents
"""
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy.orm import Session
from app.core.database import SessionLocal, engine
from app.models import Student, User, StudentGuardian, StudentSkills, Group
from app.core.security import get_password_hash
from datetime import date, datetime

def create_test_skills_data():
    db = SessionLocal()
    
    try:
        # Find or create a group
        group = db.query(Group).first()
        if not group:
            print("No groups found. Creating test group...")
            group = Group(
                name="U10 Тестовая группа",
                description="Тестовая группа для навыков",
                coach_id=None
            )
            db.add(group)
            db.commit()
            db.refresh(group)
            print(f"Created group: {group.name} (ID: {group.id})")
        
        # Define test data
        test_children = [
            {
                "first_name": "Алексей",
                "last_name": "Иванов",
                "dob": date(2016, 3, 15),
                "parent_phone": "+37360111001",
                "parent_name": "Мария Иванова",
                "parent_email": "parent1@test.com",
                "skills": [
                    {"month": 10, "year": 2025, "technique": 3, "speed": 4, "discipline": 3, "teamwork": 4, "endurance": 3},
                    {"month": 11, "year": 2025, "technique": 3, "speed": 4, "discipline": 4, "teamwork": 4, "endurance": 4},
                    {"month": 12, "year": 2025, "technique": 4, "speed": 4, "discipline": 4, "teamwork": 5, "endurance": 4},
                    {"month": 1, "year": 2026, "technique": 4, "speed": 5, "discipline": 5, "teamwork": 5, "endurance": 5},
                ]
            },
            {
                "first_name": "Даниил",
                "last_name": "Петров",
                "dob": date(2015, 7, 22),
                "parent_phone": "+37360111002",
                "parent_name": "Елена Петрова",
                "parent_email": "parent2@test.com",
                "skills": [
                    {"month": 10, "year": 2025, "technique": 2, "speed": 3, "discipline": 4, "teamwork": 3, "endurance": 3},
                    {"month": 11, "year": 2025, "technique": 3, "speed": 3, "discipline": 4, "teamwork": 4, "endurance": 3},
                    {"month": 12, "year": 2025, "technique": 3, "speed": 4, "discipline": 4, "teamwork": 4, "endurance": 4},
                    {"month": 1, "year": 2026, "technique": 4, "speed": 4, "discipline": 5, "teamwork": 4, "endurance": 4},
                ]
            },
            {
                "first_name": "Артём",
                "last_name": "Сидоров",
                "dob": date(2016, 11, 8),
                "parent_phone": "+37360111003",
                "parent_name": "Ольга Сидорова",
                "parent_email": "parent3@test.com",
                "skills": [
                    {"month": 10, "year": 2025, "technique": 4, "speed": 3, "discipline": 3, "teamwork": 3, "endurance": 2},
                    {"month": 11, "year": 2025, "technique": 4, "speed": 3, "discipline": 3, "teamwork": 3, "endurance": 3},
                    {"month": 12, "year": 2025, "technique": 5, "speed": 4, "discipline": 4, "teamwork": 4, "endurance": 3},
                    {"month": 1, "year": 2026, "technique": 5, "speed": 4, "discipline": 4, "teamwork": 5, "endurance": 4},
                ]
            }
        ]
        
        for child_data in test_children:
            # Check if parent already exists
            parent = db.query(User).filter(User.phone == child_data["parent_phone"]).first()
            if not parent:
                # Create parent user
                parent = User(
                    phone=child_data["parent_phone"],
                    password_hash=get_password_hash("test123"),
                    full_name=child_data["parent_name"],
                    role="parent"
                )
                db.add(parent)
                db.commit()
                db.refresh(parent)
                print(f"Created parent: {parent.full_name} (ID: {parent.id}) - Login: {parent.phone} / test123")
            else:
                print(f"Parent exists: {parent.full_name} (ID: {parent.id})")
            
            # Check if student already exists
            student = db.query(Student).filter(
                Student.first_name == child_data["first_name"],
                Student.last_name == child_data["last_name"]
            ).first()
            
            if not student:
                # Create student
                student = Student(
                    first_name=child_data["first_name"],
                    last_name=child_data["last_name"],
                    dob=child_data["dob"],
                    parent_phone=child_data["parent_phone"],
                    group_id=group.id,
                    status="active"
                )
                db.add(student)
                db.commit()
                db.refresh(student)
                print(f"Created student: {student.first_name} {student.last_name} (ID: {student.id})")
            else:
                print(f"Student exists: {student.first_name} {student.last_name} (ID: {student.id})")
            
            # Link parent to student
            existing_link = db.query(StudentGuardian).filter(
                StudentGuardian.user_id == parent.id,
                StudentGuardian.student_id == student.id
            ).first()
            
            if not existing_link:
                guardian_link = StudentGuardian(
                    user_id=parent.id,
                    student_id=student.id,
                    relationship_type="parent"
                )
                db.add(guardian_link)
                db.commit()
                print(f"Linked parent {parent.full_name} to student {student.first_name}")
            
            # Add skills ratings
            for skill_data in child_data["skills"]:
                existing_skill = db.query(StudentSkills).filter(
                    StudentSkills.student_id == student.id,
                    StudentSkills.rating_month == skill_data["month"],
                    StudentSkills.rating_year == skill_data["year"]
                ).first()
                
                if not existing_skill:
                    skill = StudentSkills(
                        student_id=student.id,
                        rating_month=skill_data["month"],
                        rating_year=skill_data["year"],
                        technique=skill_data["technique"],
                        speed=skill_data["speed"],
                        discipline=skill_data["discipline"],
                        teamwork=skill_data["teamwork"],
                        endurance=skill_data["endurance"],
                        coach_comment=f"Оценка за {skill_data['month']}/{skill_data['year']}"
                    )
                    db.add(skill)
                    print(f"Added skills for {student.first_name} - {skill_data['month']}/{skill_data['year']}")
            
            db.commit()
        
        print("\n=== Test Data Created ===")
        print("Parents can login with:")
        print("  +37360111001 / test123 - Мария Иванова")
        print("  +37360111002 / test123 - Елена Петрова") 
        print("  +37360111003 / test123 - Ольга Сидорова")
        
    finally:
        db.close()


if __name__ == "__main__":
    create_test_skills_data()
