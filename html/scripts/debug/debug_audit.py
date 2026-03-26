
import os
import sys
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

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

def check_audit_log():
    with engine.connect() as conn:
        print("\n--- Audit Log Count ---")
        try:
            count = conn.execute(text("SELECT count(*) FROM audit_log")).scalar()
            print(f"Total audit logs: {count}")
            
            if count > 0:
                print("\n--- Latest 5 Logs ---")
                logs = conn.execute(text("SELECT id, entity_type, action, created_at FROM audit_log ORDER BY created_at DESC LIMIT 5")).fetchall()
                for log in logs:
                    print(f"ID: {log[0]}, Type: {log[1]}, Action: {log[2]}, Time: {log[3]}")
            else:
                print("No audit logs found.")
                
        except Exception as e:
            print(f"Error checking audit_log: {e}")
            # Check if table exists
            try:
                conn.execute(text("SELECT 1 FROM audit_log LIMIT 1"))
            except Exception as table_err:
                print(f"Table audit_log might not exist: {table_err}")

if __name__ == "__main__":
    check_audit_log()
