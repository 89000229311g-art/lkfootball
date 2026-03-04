import sys
import os

# Add project root to python path
sys.path.append(os.getcwd())

from app.core.database import SessionLocal
from app.models.user import User
from app.core.security import get_password_hash

def reset_passwords():
    db = SessionLocal()
    try:
        print("--- RESETTING PASSWORDS ---")
        
        # 1. Admin
        admin = db.query(User).filter(User.role == "super_admin").first()
        if admin:
            print(f"Resetting Admin ({admin.phone})...")
            admin.password_hash = get_password_hash("admin123")
            print("  -> New Password: admin123")
        
        # 2. Coach
        coach = db.query(User).filter(User.role == "coach").first()
        if coach:
            print(f"Resetting Coach ({coach.phone})...")
            coach.password_hash = get_password_hash("coach123")
            print("  -> New Password: coach123")
            
        # 3. Parent
        parent = db.query(User).filter(User.role == "parent").first()
        if parent:
            print(f"Resetting Parent ({parent.phone})...")
            parent.password_hash = get_password_hash("parent123")
            print("  -> New Password: parent123")
            
        db.commit()
        print("--- DONE ---")

    except Exception as e:
        print(f"Error: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    reset_passwords()
