import sys
import os
sys.path.append(os.getcwd())
from app.core.database import SessionLocal
from app.models.user import User

def update_name():
    db = SessionLocal()
    # Phone number of the super_admin
    phone = "+37376624536"
    
    user = db.query(User).filter(User.phone == phone).first()
    if user:
        print(f"Found user: {user.full_name}")
        user.full_name = "Геннадий Васильевич"
        db.commit()
        print(f"Updated name to: {user.full_name}")
    else:
        print("User not found!")
    
    db.close()

if __name__ == "__main__":
    update_name()