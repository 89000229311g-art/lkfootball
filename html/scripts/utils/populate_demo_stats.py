
import asyncio
import random
from datetime import date, datetime, timedelta
from sqlalchemy.orm import Session
from app.core.database import SessionLocal
from app.core.security import get_password_hash
from app.models import (
    User, UserRole, Group, Student, StudentStatus, 
    Event, EventType, Attendance, AttendanceStatus,
    Payment, PaymentMethod, StudentSkills, PhysicalTest, StudentPhysicalTestResult
)

def populate_demo_data():
    db = SessionLocal()
    try:
        print("🚀 Starting demo data population...")

        # 1. Create Users
        users = {
            "admin": {"phone": "admin", "name": "Admin User", "role": UserRole.ADMIN},
            "coach": {"phone": "coach", "name": "Coach Mike", "role": UserRole.COACH},
            "parent1": {"phone": "parent1", "name": "Parent John", "role": UserRole.PARENT},
            "parent2": {"phone": "parent2", "name": "Parent Sarah", "role": UserRole.PARENT},
        }

        created_users = {}
        for key, data in users.items():
            user = db.query(User).filter(User.phone == data["phone"]).first()
            if not user:
                user = User(
                    phone=data["phone"],
                    full_name=data["name"],
                    role=data["role"],
                    password_hash=get_password_hash("123")
                )
                db.add(user)
                db.commit()
                db.refresh(user)
                print(f"✅ Created user: {data['name']} ({data['role']})")
            else:
                print(f"ℹ️ User exists: {data['name']}")
            created_users[key] = user

        # 2. Create Groups
        groups = [
            {"name": "U10 Eagles", "age_group": "U10"},
            {"name": "U12 Lions", "age_group": "U12"}
        ]
        
        created_groups = []
        for g_data in groups:
            group = db.query(Group).filter(Group.name == g_data["name"]).first()
            if not group:
                group = Group(
                    name=g_data["name"],
                    age_group=g_data["age_group"],
                    coach_id=created_users["coach"].id
                )
                db.add(group)
                db.commit()
                db.refresh(group)
                print(f"✅ Created group: {g_data['name']}")
            else:
                print(f"ℹ️ Group exists: {g_data['name']}")
            created_groups.append(group)

        # 3. Create Students
        first_names = ["Alex", "Bob", "Charlie", "David", "Eve", "Frank", "Grace", "Hank", "Ivy", "Jack"]
        last_names = ["Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis", "Rodriguez", "Martinez"]
        
        created_students = []
        for i in range(10):
            fname = first_names[i]
            lname = last_names[i]
            student = db.query(Student).filter(Student.first_name == fname, Student.last_name == lname).first()
            if not student:
                group = created_groups[i % 2]
                student = Student(
                    first_name=fname,
                    last_name=lname,
                    dob=date(2014 if i < 5 else 2012, 1, 1),
                    parent_phone=f"+3736000000{i}",
                    group_id=group.id,
                    status=StudentStatus.ACTIVE,
                    balance=0
                )
                db.add(student)
                db.commit()
                db.refresh(student)
                print(f"✅ Created student: {fname} {lname}")
            created_students.append(student)

        # 4. Create Events (Past 30 days)
        today = date.today()
        start_date = today - timedelta(days=30)
        
        events = []
        for i in range(30):
            current_date = start_date + timedelta(days=i)
            # Create event for each group every other day
            if i % 2 == 0:
                for group in created_groups:
                    # Check if event exists
                    start_time = datetime.combine(current_date, datetime.min.time().replace(hour=17))
                    event = db.query(Event).filter(Event.group_id == group.id, Event.start_time == start_time).first()
                    
                    if not event:
                        event = Event(
                            group_id=group.id,
                            coach_id=created_users["coach"].id,
                            type=EventType.TRAINING,
                            start_time=start_time,
                            end_time=start_time + timedelta(hours=1, minutes=30),
                            topic="Passing drills"
                        )
                        db.add(event)
                        db.commit()
                        db.refresh(event)
                        events.append(event)

        print(f"✅ Created/Checked {len(events)} events")

        # 5. Create Attendance (Random)
        if events:
            print("⏳ Generating attendance...")
            count = 0
            for event in events:
                group_students = [s for s in created_students if s.group_id == event.group_id]
                for student in group_students:
                    att = db.query(Attendance).filter(Attendance.event_id == event.id, Attendance.student_id == student.id).first()
                    if not att:
                        status = random.choice([AttendanceStatus.PRESENT, AttendanceStatus.PRESENT, AttendanceStatus.PRESENT, AttendanceStatus.ABSENT, AttendanceStatus.LATE])
                        att = Attendance(
                            event_id=event.id,
                            student_id=student.id,
                            status=status,
                            mark=random.randint(6, 10) if status == AttendanceStatus.PRESENT else None
                        )
                        db.add(att)
                        count += 1
            db.commit()
            print(f"✅ Created {count} attendance records")

        # 6. Create Payments (Last 3 months)
        print("⏳ Generating payments...")
        payment_count = 0
        for student in created_students:
            for month_offset in range(3):
                payment_date = today - timedelta(days=30 * month_offset)
                period = date(payment_date.year, payment_date.month, 1)
                
                existing = db.query(Payment).filter(Payment.student_id == student.id, Payment.payment_period == period).first()
                if not existing:
                    payment = Payment(
                        student_id=student.id,
                        amount=500.0,
                        payment_date=payment_date,
                        payment_period=period,
                        method=PaymentMethod.CASH,
                        status="completed"
                    )
                    db.add(payment)
                    payment_count += 1
        db.commit()
        print(f"✅ Created {payment_count} payments")

        # 7. Create Skills (Last month)
        print("⏳ Generating skills...")
        skill_count = 0
        for student in created_students:
            period_month = today.month
            period_year = today.year
            
            existing = db.query(StudentSkills).filter(
                StudentSkills.student_id == student.id,
                StudentSkills.rating_month == period_month,
                StudentSkills.rating_year == period_year
            ).first()
            
            if not existing:
                skills = StudentSkills(
                    student_id=student.id,
                    rating_month=period_month,
                    rating_year=period_year,
                    technique=random.randint(3, 5),
                    speed=random.randint(3, 5),
                    discipline=random.randint(3, 5),
                    tactics=random.randint(3, 5),
                    physical=random.randint(3, 5),
                    coach_comment="Good progress!"
                )
                db.add(skills)
                skill_count += 1
        db.commit()
        print(f"✅ Created {skill_count} skill ratings")

        print("\n🎉 Demo data population complete!")
        
    except Exception as e:
        print(f"❌ Error: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    populate_demo_data()
