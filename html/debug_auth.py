from app.core.database import SessionLocal
from app.models.user import User
from app.core.security import verify_password, get_password_hash

def debug_users():
    db = SessionLocal()
    try:
        print("--- DEBUG AUTH ---")
        users = db.query(User).all()
        for u in users:
            print(f"User: {u.phone}, Role: {u.role}")
            
            # Test password for parent
            if u.role == 'parent':
                is_valid = verify_password('parent123', u.password_hash)
                print(f"  -> Testing password 'parent123': {'VALID' if is_valid else 'INVALID'}")
                
                # Double check hash generation
                new_hash = get_password_hash('parent123')
                is_valid_new = verify_password('parent123', new_hash)
                print(f"  -> New hash verification: {'VALID' if is_valid_new else 'INVALID'}")

            if u.role == 'super_admin':
                 is_valid = verify_password('owner123', u.password_hash)
                 print(f"  -> Testing password 'owner123': {'VALID' if is_valid else 'INVALID'}")

    finally:
        db.close()

if __name__ == "__main__":
    debug_users()
