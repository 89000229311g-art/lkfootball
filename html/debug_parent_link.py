
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, joinedload
from app.core.config import settings
from app.models import Student, User, StudentGuardian

engine = create_engine(settings.SQLALCHEMY_DATABASE_URI)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
db = SessionLocal()

phone = "+37376000062"
user = db.query(User).filter(User.phone == phone).first()

if not user:
    print(f"User with phone {phone} not found")
else:
    print(f"User found: {user.full_name} (ID: {user.id})")
    
    guardians = db.query(StudentGuardian).filter(StudentGuardian.user_id == user.id).all()
    print(f"Found {len(guardians)} links in StudentGuardian")
    
    for g in guardians:
        student = db.query(Student).get(g.student_id)
        if student:
            print(f" - Linked to Student: {student.first_name} {student.last_name} (ID: {student.id})")
        else:
            print(f" - Linked to Student ID {g.student_id} (Not found in DB)")

db.close()
