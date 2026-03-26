import sys
import os

# Add project root to python path
sys.path.append(os.getcwd())

from app.core.database import SessionLocal
from app.models.user import User
from app.core.security import verify_password, get_password_hash

def debug_auth():
    db = SessionLocal()
    try:
        print("--- DEBUG AUTH ---")
        
        # 1. Check all users and try to verify passwords
        users = db.query(User).all()
        for user in users:
            print(f"User: {user.phone}, Role: {user.role}")
            
            # Try default passwords
            candidates = ["admin123", "coach123", "parent123", "owner123"]
            
            # If specifically the coach we are debugging
            if user.phone in ["+37379000002", "37379000002"]:
                 candidates = ["coach123"]

            for cand in candidates:
                is_valid = verify_password(cand, user.password_hash)
                if is_valid:
                    print(f"  -> Testing password '{cand}': VALID")
                else:
                    if user.phone in ["+37379000002", "37379000002"]:
                         print(f"  -> Testing password '{cand}': INVALID")
            
            # 2. Reset Coach Password if needed (for debugging)
            if user.phone == "+37379000002":
                 print(f"  -> Resetting password for {user.phone} to 'coach123' to be sure.")
                 new_hash = get_password_hash("coach123")
                 user.password_hash = new_hash
                 db.commit()
                 
                 # Verify immediately
                 if verify_password("coach123", new_hash):
                     print(f"  -> New hash verification: VALID")
                 else:
                     print(f"  -> New hash verification: INVALID (Something is wrong with hashing!)")

    finally:
        db.close()

if __name__ == "__main__":
    debug_auth()
