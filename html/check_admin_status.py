#!/usr/bin/env python3
"""
Check admin user status in detail
"""
from sqlalchemy.orm import Session
from app.core.database import SessionLocal
from app.models import User, UserRole

def check_admin_status():
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.phone == "admin").first()
        if user:
            print(f"User details:")
            print(f"   ID: {user.id}")
            print(f"   Name: {user.full_name}")
            print(f"   Phone: {user.phone}")
            print(f"   Role: {user.role}")
            print(f"   Active: {user.is_active}")
            print(f"   Deleted: {user.deleted_at}")
            print(f"   Created: {user.created_at}")
            print(f"   Updated: {user.updated_at}")
            
            # Check if there are any deleted users
            deleted_users = db.query(User).filter(User.deleted_at.isnot(None)).all()
            if deleted_users:
                print(f"\n📋 Deleted users ({len(deleted_users)}):")
                for u in deleted_users:
                    print(f"   {u.full_name} ({u.phone}) - deleted at: {u.deleted_at}")
            
            return user
        else:
            print("❌ Admin user not found")
            return None
            
    except Exception as e:
        print(f"❌ Error: {e}")
        return None
    finally:
        db.close()

if __name__ == "__main__":
    user = check_admin_status()
    if user:
        print(f"\n🎉 Admin user found and {'active' if user.is_active else 'inactive'}")
    else:
        print(f"\n💥 Admin user not found!")