import sys
import os
import random
from datetime import datetime

# Add project root to path
sys.path.append(os.getcwd())

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.core.config import settings
from app.models.physical_test import PhysicalTest, StudentPhysicalTestResult
from app.models.student import Student
from app.models.user import User

def seed_physical_data():
    engine = create_engine(settings.SQLALCHEMY_DATABASE_URI)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = SessionLocal()

    try:
        print("🚀 Starting seeding physical tests and results...")
        
        # Ensure tables exist
        from app.models.base import Base
        Base.metadata.create_all(bind=engine)
        print("✅ Tables created (if not existed).")

        # 1. Define Tests for each category
        tests_data = [
            # Technique
            {"name": "Жонглирование", "unit": "раз", "category": "technique", "description": "Количество ударов без падения мяча"},
            {"name": "Дриблинг змейкой", "unit": "сек", "category": "technique", "description": "Проход конусов на время"},
            
            # Physical
            {"name": "Прыжок в длину", "unit": "см", "category": "physical", "description": "Прыжок с места"},
            {"name": "Отжимания", "unit": "раз", "category": "physical", "description": "За 1 минуту"},
            
            # Discipline (New)
            {"name": "Посещаемость", "unit": "%", "category": "discipline", "description": "Процент посещенных тренировок"},
            {"name": "Опоздания", "unit": "раз", "category": "discipline", "description": "Количество опозданий за квартал"},
            
            # Tactics
            {"name": "Игровое мышление", "unit": "балл", "category": "tactics", "description": "Оценка тренера 1-10"},
            {"name": "Точность передач", "unit": "%", "category": "tactics", "description": "Процент точных передач в двусторонке"},
            
            # Speed
            {"name": "Бег 30м", "unit": "сек", "category": "speed", "description": "Спринт с высокого старта"},
            {"name": "Рывок 10м", "unit": "сек", "category": "speed", "description": "Стартовая скорость"},
        ]

        # 2. Create/Update Tests
        created_tests = {}
        for t_data in tests_data:
            test = db.query(PhysicalTest).filter(PhysicalTest.name == t_data["name"]).first()
            if not test:
                test = PhysicalTest(**t_data)
                db.add(test)
                print(f"➕ Created test: {t_data['name']} ({t_data['category']})")
            else:
                test.category = t_data["category"]
                test.unit = t_data["unit"]
                print(f"🔄 Updated test: {t_data['name']}")
            
            db.commit()
            db.refresh(test)
            created_tests[test.name] = test

        # 3. Find a student to populate
        student = db.query(Student).first()
        if not student:
            print("❌ No students found in DB. Create a student first.")
            return

        print(f"👤 Populating data for student: {student.first_name} {student.last_name} (ID: {student.id})")

        # 4. Generate Random Results for 4 Quarters of 2025
        year = 2025
        coach = db.query(User).filter(User.role.in_(['coach', 'admin', 'super_admin'])).first()
        coach_id = coach.id if coach else None

        for quarter in [1, 2, 3, 4]:
            print(f"  📅 Processing Quarter {quarter}...")
            
            for test_name, test_obj in created_tests.items():
                # Generate realistic random values based on category
                value = 0
                if test_obj.category == "speed":
                    value = round(random.uniform(4.0, 6.0), 2) # Seconds
                elif test_obj.category == "technique":
                    if test_obj.unit == "раз":
                        value = random.randint(10, 100)
                    else:
                        value = round(random.uniform(15.0, 30.0), 1)
                elif test_obj.category == "physical":
                    if test_obj.unit == "см":
                        value = random.randint(150, 220)
                    else:
                        value = random.randint(20, 60)
                elif test_obj.category == "discipline":
                    if test_obj.unit == "%":
                        value = random.randint(70, 100)
                    else:
                        value = random.randint(0, 5)
                elif test_obj.category == "tactics":
                    if test_obj.unit == "балл":
                        value = random.randint(5, 10)
                    else:
                        value = random.randint(60, 95)

                # Check if result exists
                result = db.query(StudentPhysicalTestResult).filter(
                    StudentPhysicalTestResult.student_id == student.id,
                    StudentPhysicalTestResult.test_id == test_obj.id,
                    StudentPhysicalTestResult.year == year,
                    StudentPhysicalTestResult.quarter == quarter
                ).first()

                if not result:
                    result = StudentPhysicalTestResult(
                        student_id=student.id,
                        test_id=test_obj.id,
                        year=year,
                        quarter=quarter,
                        value=value,
                        date=datetime.utcnow(),
                        coach_id=coach_id
                    )
                    db.add(result)
                else:
                    result.value = value
            
            db.commit()

        print("✅ Data seeding completed successfully!")

    except Exception as e:
        print(f"❌ Error: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    seed_physical_data()
