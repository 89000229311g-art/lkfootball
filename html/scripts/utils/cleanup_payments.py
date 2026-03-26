import sys
import os
from sqlalchemy import create_engine, func
from sqlalchemy.orm import sessionmaker

# Add parent directory to path to import app modules
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.config import settings
from app.models import Payment, Student

def cleanup_duplicates():
    engine = create_engine(settings.SQLALCHEMY_DATABASE_URI)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = SessionLocal()

    try:
        print("🔍 Checking for duplicate payments (Pending + Completed for same period)...")
        
        # Find all completed payments
        completed_payments = db.query(Payment).filter(
            Payment.status == 'completed',
            Payment.deleted_at.is_(None)
        ).all()
        
        fixed_count = 0
        
        for completed in completed_payments:
            # Check if there is a pending payment for the same student and period
            pending = db.query(Payment).filter(
                Payment.student_id == completed.student_id,
                Payment.payment_period == completed.payment_period,
                Payment.status == 'pending',
                Payment.deleted_at.is_(None)
            ).first()
            
            if pending:
                print(f"⚠️ Found duplicate for Student {completed.student_id} Period {completed.payment_period}:")
                print(f"   Completed ID: {completed.id} ({completed.amount} MDL)")
                print(f"   Pending ID:   {pending.id} ({pending.amount} MDL)")
                
                # Soft delete the pending one
                from app.core.timezone import now_naive
                pending.deleted_at = now_naive()
                pending.deletion_reason = "Auto-cleanup: Duplicate of completed payment"
                
                # Check student debt status
                # If this was the only pending payment, clear debt flag
                other_pending = db.query(Payment).filter(
                    Payment.student_id == pending.student_id,
                    Payment.status == 'pending',
                    Payment.deleted_at.is_(None),
                    Payment.id != pending.id
                ).count()
                
                if other_pending == 0:
                    student = db.query(Student).filter(Student.id == pending.student_id).first()
                    if student and student.is_debtor:
                        student.is_debtor = False
                        print(f"   ✅ Cleared debtor status for student {student.id}")
                        db.add(student)
                
                db.add(pending)
                fixed_count += 1
        
        db.commit()
        print(f"✅ Cleanup complete. Fixed {fixed_count} duplicate pairs.")
        
    except Exception as e:
        print(f"❌ Error: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    cleanup_duplicates()
