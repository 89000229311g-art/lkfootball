#!/usr/bin/env python3
"""
Check password hash for admin user
"""
from sqlalchemy.orm import Session
from app.core.database import SessionLocal
from app.core.security import verify_password
from app.models import User, UserRole

def check_admin_password():
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.phone == "admin").first()
        if user:
            print(f"User: {user.full_name}")
            print(f"Phone: {user.phone}")
            print(f"Password hash: {user.password_hash}")
            
            # Test password verification
            test_passwords = ["admin", "password", "123456", "admin123"]
            for pwd in test_passwords:
                if verify_password(pwd, user.password_hash):
                    print(f"✅ Password '{pwd}' is correct!")
                    return pwd
            else:
                print("❌ None of the test passwords match")
                return None
        else:
            print("❌ Admin user not found")
            return None
            
    except Exception as e:
        print(f"❌ Error: {e}")
        return None
    finally:
        db.close()

if __name__ == "__main__":
    password = check_admin_password()
    if password:
        print(f"\n🎉 Admin password is: {password}")
    else:
        print("\n💥 Could not determine admin password!")