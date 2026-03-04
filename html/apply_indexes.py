import os
import sys
from sqlalchemy import create_engine, text

# Add current dir to path
sys.path.append(os.getcwd())

from app.core.config import settings

def apply_indexes():
    print(f"Connecting to database: {settings.SQLALCHEMY_DATABASE_URI}")
    # Use autocommit to avoid transaction blocks failing entire script
    engine = create_engine(settings.SQLALCHEMY_DATABASE_URI, isolation_level="AUTOCOMMIT")
    
    # Read SQL file
    with open("add_performance_indexes.sql", "r") as f:
        sql_content = f.read()
    
    # Split statements (naive split by ;)
    statements = sql_content.split(";")
    
    with engine.connect() as connection:
        for statement in statements:
            statement = statement.strip()
            if not statement or statement.startswith("--") or statement.startswith("SELECT"):
                continue
                
            try:
                print(f"Executing: {statement[:50]}...")
                connection.execute(text(statement))
                print("✅ Success")
            except Exception as e:
                print(f"⚠️ Error (might already exist): {e}")
                
        connection.commit()
    
    print("All indexes processed.")

if __name__ == "__main__":
    apply_indexes()
