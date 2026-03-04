
from sqlalchemy import text, inspect
from app.core.database import engine

def debug_db():
    print(f"Connecting to: {engine.url}")
    inspector = inspect(engine)
    tables = inspector.get_table_names()
    print("Tables found:", tables)
    
    if "student_skills" in tables:
        print("Table 'student_skills' exists.")
        columns = [c['name'] for c in inspector.get_columns("student_skills")]
        print("Columns:", columns)
        
        if "talent_tags" not in columns:
            print("Adding talent_tags...")
            with engine.connect() as conn:
                conn.execute(text("ALTER TABLE student_skills ADD COLUMN talent_tags JSONB DEFAULT '[]'::jsonb"))
                conn.commit()
            print("Done.")
        else:
            print("talent_tags already exists.")
    else:
        print("Table 'student_skills' NOT found!")

if __name__ == "__main__":
    debug_db()
