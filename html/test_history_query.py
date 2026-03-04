
import os
import sys
from sqlalchemy import create_engine, text, extract, func
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv
from datetime import datetime

# Add app to path
sys.path.append(os.getcwd())

from app.models.audit import AuditLog
from app.core.timezone import now_naive

# Load environment variables
load_dotenv()

# Get database URL
DATABASE_URL = os.getenv("SQLALCHEMY_DATABASE_URI")
if not DATABASE_URL:
    user = os.getenv("POSTGRES_USER", "football_admin")
    password = os.getenv("POSTGRES_PASSWORD", "secure_password_123")
    server = os.getenv("POSTGRES_SERVER", "localhost")
    db = os.getenv("POSTGRES_DB", "football_academy")
    port = os.getenv("POSTGRES_PORT", "5433") 
    DATABASE_URL = f"postgresql://{user}:{password}@{server}:{port}/{db}"

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def test_calendar_query():
    db = SessionLocal()
    try:
        year = 2026
        month = 2
        print(f"Checking changes for {year}-{month}...")
        
        # Test the query logic from audit_service.py
        result = db.query(
            extract('day', AuditLog.created_at).label('day'),
            func.count(AuditLog.id).label('count')
        ).filter(
            extract('year', AuditLog.created_at) == year,
            extract('month', AuditLog.created_at) == month
        ).group_by(
            extract('day', AuditLog.created_at)
        ).all()
        
        print(f"Result: {result}")
        
        changes = {int(row.day): row.count for row in result}
        print(f"Changes map: {changes}")
        
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    test_calendar_query()
