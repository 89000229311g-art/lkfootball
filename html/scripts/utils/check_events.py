from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from app.core.config import settings
from datetime import datetime, timedelta

engine = create_engine(settings.SQLALCHEMY_DATABASE_URI)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
db = SessionLocal()

def check_and_create_events():
    # 1. Check events for group 2
    print("Checking events for Group 2...")
    result = db.execute(text("SELECT id, start_time, type FROM events WHERE group_id = 2")).fetchall()
    
    if result:
        print(f"Found {len(result)} events:")
        for r in result:
            print(f"- {r.type} at {r.start_time}")
    else:
        print("No events found for Group 2.")
        
        # 2. Create test events if none
        print("Creating test events for Group 2...")
        today = datetime.now()
        
        # Event 1: Today
        db.execute(text("""
            INSERT INTO events (group_id, start_time, end_time, type, location, created_at, updated_at)
            VALUES (2, :start1, :end1, 'training', 'Стадион 1', NOW(), NOW())
        """), {
            "start1": today.replace(hour=18, minute=0, second=0),
            "end1": today.replace(hour=19, minute=30, second=0)
        })
        
        # Event 2: Tomorrow
        tomorrow = today + timedelta(days=1)
        db.execute(text("""
            INSERT INTO events (group_id, start_time, end_time, type, location, created_at, updated_at)
            VALUES (2, :start2, :end2, 'training', 'Стадион 1', NOW(), NOW())
        """), {
            "start2": tomorrow.replace(hour=18, minute=0, second=0),
            "end2": tomorrow.replace(hour=19, minute=30, second=0)
        })
        
        db.commit()
        print("Created 2 test events.")

if __name__ == "__main__":
    try:
        check_and_create_events()
    finally:
        db.close()
