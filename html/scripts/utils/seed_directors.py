import os
import sys
import argparse
from sqlalchemy.orm import Session
from app.core.database import SessionLocal, engine
from app.models.user import User, UserRole
from app.models.credential import UserCredential
from app.core.security import get_password_hash
from app.core.config import settings

def update_credential(db: Session, user: User, password_plain: str):
    """Update or create user credential with plain password"""
    cred = db.query(UserCredential).filter(UserCredential.user_id == user.id).first()
    if cred:
        cred.password_plain = password_plain
        cred.login = user.phone
    else:
        cred = UserCredential(
            user_id=user.id,
            login=user.phone,
            password_plain=password_plain,
            created_by_id=user.id
        )
        db.add(cred)
    db.commit()

def init_db(db: Session, finance_phone: str, finance_pass: str, sport_phone: str, sport_pass: str):
    # 1. Create Finance Director (Owner) - Gennady
    finance_phone = clean_phone(finance_phone)
    owner = db.query(User).filter(User.phone == finance_phone).first()
    
    if not owner:
        print(f"Creating Finance Director: {finance_phone}")
        owner = User(
            phone=finance_phone,
            password_hash=get_password_hash(finance_pass),
            role="owner",
            full_name="Геннадий",
            is_active=True,
            can_view_history=True,
            can_view_analytics=True,
            can_view_crm=True,
            can_view_recruitment=True,
            can_view_marketing=True
        )
        db.add(owner)
    else:
        print(f"Finance Director already exists: {finance_phone}. Updating password and permissions.")
        owner.password_hash = get_password_hash(finance_pass)
        owner.role = "owner"
        # owner.full_name = "Геннадий (Финансовый директор)" # Optional: update name if needed
        owner.is_active = True
        owner.can_view_history = True
        owner.can_view_analytics = True
        owner.can_view_crm = True
        owner.can_view_recruitment = True
        owner.can_view_marketing = True
        db.add(owner)
    
    # Commit first to ensure ID
    db.commit()
    update_credential(db, owner, finance_pass)

    # 2. Create Sport Director (Super Admin) - Anatoly
    sport_phone = clean_phone(sport_phone)
    super_admin = db.query(User).filter(User.phone == sport_phone).first()
    
    if not super_admin:
        print(f"Creating Sport Director: {sport_phone}")
        super_admin = User(
            phone=sport_phone,
            password_hash=get_password_hash(sport_pass),
            role="super_admin",
            full_name="Анатолий",
            is_active=True,
            can_view_history=True,
            can_view_analytics=True,
            can_view_crm=True,
            can_view_recruitment=True,
            can_view_marketing=True
        )
        db.add(super_admin)
    else:
        print(f"Sport Director already exists: {sport_phone}. Updating password and permissions.")
        super_admin.password_hash = get_password_hash(sport_pass)
        super_admin.role = "super_admin"
        # super_admin.full_name = "Анатолий (Спортивный директор)" # Optional
        super_admin.is_active = True
        super_admin.can_view_history = True
        super_admin.can_view_analytics = True
        super_admin.can_view_crm = True
        super_admin.can_view_recruitment = True
        super_admin.can_view_marketing = True
        db.add(super_admin)
    
    # Commit first to ensure ID
    db.commit()
    update_credential(db, super_admin, sport_pass)
    
    print("✅ Initialization complete!")

def clean_phone(phone: str) -> str:
    """Normalize phone number format"""
    return phone.strip().replace(" ", "").replace("-", "")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Initialize academy directors")
    parser.add_argument("--finance-phone", required=True, help="Phone for Finance Director")
    parser.add_argument("--finance-pass", required=True, help="Password for Finance Director")
    parser.add_argument("--sport-phone", required=True, help="Phone for Sport Director")
    parser.add_argument("--sport-pass", required=True, help="Password for Sport Director")
    
    args = parser.parse_args()
    
    db = SessionLocal()
    try:
        init_db(db, args.finance_phone, args.finance_pass, args.sport_phone, args.sport_pass)
    finally:
        db.close()
