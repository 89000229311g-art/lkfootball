from sqlalchemy.orm import Session
from app.core.database import SessionLocal
from app.models import User

def check_database():
    db = SessionLocal()
    try:
        # Check if superuser exists
        superuser = db.query(User).filter(User.phone == "+37312345678").first()
        if superuser:
            print(f"Superuser found: {superuser.full_name} (phone: {superuser.phone})")
            print(f"Role: {superuser.role}")
        else:
            print("Superuser not found!")
            
        # Count total users
        user_count = db.query(User).count()
        print(f"\nTotal users in database: {user_count}")
        
    finally:
        db.close()

if __name__ == "__main__":
    check_database()