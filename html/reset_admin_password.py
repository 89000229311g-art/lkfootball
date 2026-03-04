#!/usr/bin/env python3
"""
Reset admin password to 'admin'
"""
from sqlalchemy.orm import Session
from app.core.database import SessionLocal
from app.core.security import get_password_hash
from app.models import User, UserRole

def reset_admin_password():
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.phone == "admin").first()
        if user:
            # Reset password to 'admin'
            user.password_hash = get_password_hash("admin")
            db.commit()
            print(f"✅ Reset password for user: {user.full_name} (phone: {user.phone})")
            
            # Verify the reset worked
            from app.core.security import verify_password
            if verify_password("admin", user.password_hash):
                print("✅ Password verification successful!")
                return True
            else:
                print("❌ Password verification failed!")
                return False
        else:
            print("❌ Admin user not found")
            return False
            
    except Exception as e:
        print(f"❌ Error: {e}")
        db.rollback()
        return False
    finally:
        db.close()

if __name__ == "__main__":
    if reset_admin_password():
        print("\n🎉 Admin password reset successfully!")
    else:
        print("\n💥 Failed to reset admin password!")