import sys
import os
sys.path.append(os.getcwd())
from app.core.database import SessionLocal
from app.models.user import User
from app.core.security import get_password_hash

def update_passwords():
    db = SessionLocal()
    
    users_to_update = [
        {"phone": "+37376624536", "password": "admin123"},
        {"phone": "+373123", "password": "coach123"},
        {"phone": "+37312345678", "password": "parent123"}
    ]
    
    for u_data in users_to_update:
        user = db.query(User).filter(User.phone == u_data["phone"]).first()
        if user:
            print(f"Updating password for {user.full_name} ({user.phone})...")
            user.password_hash = get_password_hash(u_data["password"])
        else:
            print(f"User {u_data['phone']} not found!")
            
    db.commit()
    print("Passwords updated successfully!")
    db.close()

if __name__ == "__main__":
    update_passwords()