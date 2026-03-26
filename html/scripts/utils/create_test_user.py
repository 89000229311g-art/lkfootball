#!/usr/bin/env python3
"""
Create a test user directly in the database for testing
"""
from sqlalchemy.orm import Session
from app.core.database import SessionLocal
from app.core.security import get_password_hash
from app.models import User, UserRole

def create_test_user():
    db = SessionLocal()
    try:
        # Check if user already exists
        existing_user = db.query(User).filter(User.phone == "+373777777").first()
        if existing_user:
            print(f"✅ User already exists: {existing_user.full_name}")
            print(f"   Phone: {existing_user.phone}")
            print(f"   Role: {existing_user.role}")
            print(f"   Active: {existing_user.is_active}")
            return existing_user
        
        # Create new user
        user_data = {
            "phone": "+373777777",
            "password": get_password_hash("1"),
            "full_name": "Руководитель Академии",
            "role": UserRole.SUPER_ADMIN,
            "is_active": True
        }
        
        user = User(**user_data)
        db.add(user)
        db.commit()
        db.refresh(user)
        
        print(f"✅ Created test user:")
        print(f"   ID: {user.id}")
        print(f"   Name: {user.full_name}")
        print(f"   Phone: {user.phone}")
        print(f"   Role: {user.role}")
        
        return user
        
    except Exception as e:
        print(f"❌ Error creating user: {e}")
        db.rollback()
        return None
    finally:
        db.close()

if __name__ == "__main__":
    user = create_test_user()
    if user:
        print("\n🎉 Test user ready!")
    else:
        print("\n💥 Failed to create test user!")