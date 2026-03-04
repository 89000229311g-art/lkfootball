import sys
import os
sys.path.append(os.getcwd())
from app.core.database import SessionLocal
from app.models.user import User

def list_users():
    db = SessionLocal()
    users = db.query(User).all()
    print("--- USERS ---")
    for u in users:
        print(f"ID: {u.id}, Phone: {u.phone}, Role: {u.role}, Name: {u.full_name}")
    db.close()

if __name__ == "__main__":
    list_users()
