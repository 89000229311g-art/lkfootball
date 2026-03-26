"""
Script to populate UserCredential table for all users.
This ensures every user can view their password in the app.
"""
from app.core.database import SessionLocal
from app.models import User, UserCredential
from app.core.encryption import encrypt_password

# Default passwords by role (from password management docs)
DEFAULT_PASSWORDS = {
    'super_admin': 'super123',
    'admin': 'admin123',
    'coach': 'coach123',
    'parent': 'parent123',
}

def populate_credentials():
    db = SessionLocal()
    try:
        # Get all users
        users = db.query(User).all()
        print(f"Found {len(users)} users")
        
        created = 0
        existing = 0
        
        for user in users:
            # Check if credential already exists
            credential = db.query(UserCredential).filter(
                UserCredential.user_id == user.id
            ).first()
            
            if credential:
                existing += 1
                print(f"  ✓ {user.full_name} ({user.role}) - already has credentials")
                continue
            
            # Get default password for role
            role = user.role.lower() if user.role else 'parent'
            default_password = DEFAULT_PASSWORDS.get(role, 'parent123')
            
            # Create credential
            new_credential = UserCredential(
                user_id=user.id,
                login=user.phone,
                password_encrypted=encrypt_password(default_password),
                note=f"Auto-created with default password for {role}"
            )
            db.add(new_credential)
            created += 1
            print(f"  + {user.full_name} ({user.role}) - created with password: {default_password}")
        
        db.commit()
        
        print(f"\n=== Summary ===")
        print(f"Total users: {len(users)}")
        print(f"Already had credentials: {existing}")
        print(f"Created new credentials: {created}")
        
    finally:
        db.close()

if __name__ == "__main__":
    populate_credentials()
