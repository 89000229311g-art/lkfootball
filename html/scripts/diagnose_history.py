
import sys
import os
sys.path.append(os.getcwd())

from app.core.database import SessionLocal
from app.models.audit import AuditLog
from app.models.user import User

def check_history():
    db = SessionLocal()
    try:
        print("Checking AuditLog entries...")
        count = db.query(AuditLog).count()
        print(f"Total audit logs: {count}")
        
        if count > 0:
            latest = db.query(AuditLog).order_by(AuditLog.created_at.desc()).limit(5).all()
            print("Latest 5 entries:")
            for item in latest:
                print(f"- {item.action} {item.entity_type} {item.entity_name} by {item.user_name} at {item.created_at}")
        
        print("-" * 30)
        print("Checking Users with history access...")
        users = db.query(User).all()
        for u in users:
            can_view = getattr(u, 'can_view_history', 'N/A')
            print(f"User: {u.full_name}, Role: {u.role}, Can View History: {can_view}")
            
    finally:
        db.close()

if __name__ == "__main__":
    check_history()
