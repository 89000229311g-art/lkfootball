import sys
import os

# Add current directory to path
sys.path.append(os.getcwd())

from sqlalchemy import inspect
from app.core.database import engine

def check_schema():
    inspector = inspect(engine)
    
    tables = ['student_skills']
    
    for table in tables:
        print(f"--- Columns in {table} ---")
        columns = inspector.get_columns(table)
        for col in columns:
            print(f"{col['name']} ({col['type']}) nullable={col['nullable']}")
            
if __name__ == "__main__":
    check_schema()
