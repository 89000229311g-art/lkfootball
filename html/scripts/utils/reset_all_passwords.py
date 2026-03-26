import sys
import os

# Add project root to python path
sys.path.append(os.getcwd())

from app.core.database import SessionLocal
from app.models.user import User
from app.core.security import get_password_hash

def reset_all_passwords():
    db = SessionLocal()
    try:
        print("--- RESETTING ALL PASSWORDS ---")
        
        users = db.query(User).all()
        for user in users:
            new_pass = None
            if user.role == "super_admin" or user.role == "admin":
                new_pass = "admin123"
            elif user.role == "coach":
                new_pass = "coach123"
            elif user.role == "parent":
                new_pass = "parent123"
            
            if new_pass:
                print(f"Resetting {user.phone} ({user.role}) -> {new_pass}")
                user.password_hash = get_password_hash(new_pass)
            
        db.commit()
        print("--- DONE ---")

    except Exception as e:
        print(f"Error: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    reset_all_passwords()
