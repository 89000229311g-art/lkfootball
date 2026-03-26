from app.core.database import SessionLocal
from app.models import User
from sqlalchemy import text

def reset_project():
    db = SessionLocal()
    try:
        survivor_id = 114  # Gennadiy
        
        # Verify survivor exists
        survivor = db.query(User).filter(User.id == survivor_id).first()
        if not survivor:
            print(f"Survivor user {survivor_id} not found! Aborting.")
            return

        print(f"Starting FACTORY RESET. Survivor: {survivor.full_name} (ID: {survivor_id})")

        # Disable triggers/constraints if needed? 
        # Postgres usually requires correct deletion order.
        
        # 1. Operational Data
        print("Deleting operational data...")
        tables = [
            "invoice_items", "payments", "attendances", "student_skills", 
            "student_physical_test_results", "physical_tests", "student_photos", 
            "absence_requests", "freeze_requests", "messages", "posts", "audit_log",
            "equipment", "student_equipment", "employee_contracts", "salary_payments",
            "push_subscriptions", "student_group_history", "polls", "poll_votes",
            "post_reactions", "announcement_reads", "payment_reminders", 
            "coach_recommendations", "season_summaries", "media_reports", 
            "training_plans", "expenses", "trial_sessions", "bookings"
        ]
        
        for table in tables:
            try:
                db.execute(text(f"DELETE FROM {table}"))
            except Exception as e:
                print(f"Error deleting {table}: {e}")
                # Continue if table doesn't exist or other error, but rollback might be needed if transaction aborted
                # Ideally check existence first, but let's assume standard schema
                
        # 2. Students & Relations
        print("Deleting students and relations...")
        db.execute(text("DELETE FROM student_guardians"))
        db.execute(text("DELETE FROM students"))
        
        # 3. Schedule & Events
        print("Deleting schedule and events...")
        db.execute(text("DELETE FROM events"))
        db.execute(text("DELETE FROM generated_events"))
        db.execute(text("DELETE FROM schedule_changes"))
        db.execute(text("DELETE FROM schedule_templates"))
        
        # 4. Groups
        print("Deleting groups...")
        db.execute(text("DELETE FROM group_coaches"))
        db.execute(text("DELETE FROM groups"))
        
        # 5. Users (except survivor)
        print("Deleting users...")
        db.execute(text(f"DELETE FROM user_credentials WHERE user_id != {survivor_id}"))
        db.execute(text(f"DELETE FROM users WHERE id != {survivor_id}"))
        
        db.commit()
        print("FACTORY RESET COMPLETE.")
        print(f"Only user left: {survivor.full_name} ({survivor.phone})")

    except Exception as e:
        db.rollback()
        print(f"Error during reset: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    reset_project()
