from app.core.database import SessionLocal
from app.models import User
from sqlalchemy import text

def reassign_and_delete_users():
    db = SessionLocal()
    try:
        users_to_delete = [84, 91]
        target_user_id = 1  # Viktor Solntsev (Head)

        target = db.query(User).filter(User.id == target_user_id).first()
        if not target:
            print(f"Target user {target_user_id} not found!")
            return

        print(f"Reassigning data from users {users_to_delete} to {target.full_name} ({target.id})...")

        # 1. Groups (coach_id)
        try:
            db.execute(text(f"UPDATE groups SET coach_id = {target_user_id} WHERE coach_id IN (84, 91)"))
            db.commit()
            print("Groups updated.")
        except Exception as e:
            db.rollback()
            print(f"Groups update failed: {e}")

        # 2. Group Coaches
        try:
            db.execute(text(f"DELETE FROM group_coaches WHERE coach_id IN (84, 91)"))
            db.commit()
            print("Group coaches updated.")
        except Exception as e:
            db.rollback()
            print(f"Group coaches update failed: {e}")

        # 3. Student Skills (rated_by_id)
        try:
            db.execute(text(f"UPDATE student_skills SET rated_by_id = {target_user_id} WHERE rated_by_id IN (84, 91)"))
            db.commit()
            print("Student skills updated.")
        except Exception as e:
            db.rollback()
            print(f"Student skills update failed: {e}")

        # 4. Attendance (marked_by_id)
        try:
            db.execute(text(f"UPDATE attendance SET marked_by_id = {target_user_id} WHERE marked_by_id IN (84, 91)"))
            db.commit()
            print("Attendance updated.")
        except Exception as e:
            db.rollback()
            print(f"Attendance update failed (ignoring): {e}")

        # 5. User Credentials
        try:
            db.execute(text(f"UPDATE user_credentials SET created_by_id = {target_user_id} WHERE created_by_id IN (84, 91)"))
            db.execute(text(f"UPDATE user_credentials SET updated_by_id = {target_user_id} WHERE updated_by_id IN (84, 91)"))
            db.commit()
            print("User credentials metadata updated.")
        except Exception as e:
            db.rollback()
            print(f"User credentials metadata update failed: {e}")
        
        # 6. Delete Users
        print("Deleting users...")
        try:
            db.execute(text(f"DELETE FROM user_credentials WHERE user_id IN (84, 91)"))
            db.commit()
            print("User credentials deleted.")
            
            db.execute(text(f"DELETE FROM users WHERE id IN (84, 91)"))
            db.commit()
            print("Users 84 and 91 deleted successfully.")
        except Exception as e:
            db.rollback()
            print(f"User deletion failed: {e}")

    except Exception as e:
        print(f"Global Error: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    reassign_and_delete_users()
