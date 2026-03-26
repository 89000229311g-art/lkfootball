
from sqlalchemy.orm import Session
from app.core.database import SessionLocal
from app.models import Student, Payment, Group, InvoiceItem
from app.services.payment_service import recalculate_student_balance
from datetime import date
from sqlalchemy import func

def test_matrix_logic():
    db = SessionLocal()
    try:
        # 1. Setup Student
        student = Student(
            first_name="Matrix",
            last_name="Test",
            status="active"
        )
        db.add(student)
        db.commit()
        db.refresh(student)
        print(f"Student ID: {student.id}")

        # 2. Create Mixed Payments (Invoice + Partial Payment)
        # Scenario: 
        # - Invoice for 1200 (Pending)
        # - Partial Payment 500 (Completed)
        # - Additional Service 300 (Completed)
        
        # Payment 1: Monthly Fee Invoice (Pending, 1200)
        p1 = Payment(
            student_id=student.id,
            amount=1200,
            status="pending",
            payment_period=date(2026, 2, 1),
            description="Monthly Fee"
        )
        
        # Payment 2: Partial Payment (Completed, 500)
        p2 = Payment(
            student_id=student.id,
            amount=500,
            status="completed",
            payment_period=date(2026, 2, 1),
            description="Partial Pay"
        )
        
        # Payment 3: Extra Service (Completed, 300)
        p3 = Payment(
            student_id=student.id,
            amount=300,
            status="completed",
            payment_period=date(2026, 2, 1),
            description="Extra"
        )

        db.add_all([p1, p2, p3])
        db.commit()

        # 3. Simulate Matrix Logic
        payments = db.query(Payment).filter(
            Payment.student_id == student.id,
            Payment.payment_period == date(2026, 2, 1)
        ).all()
        
        # Current Matrix Logic (Simplified)
        current_data = {
            "amount": 0,
            "status": "pending",
            "items": []
        }
        
        for p in payments:
            current_data["amount"] += p.amount
            if p.status == 'completed':
                current_data["status"] = 'completed'
            elif current_data["status"] != 'completed':
                current_data["status"] = p.status
        
        print("\n--- Current Logic Output ---")
        print(f"Total Amount: {current_data['amount']}") # Expected: 2000 (1200+500+300)
        print(f"Status: {current_data['status']}")       # Expected: 'completed' (because p2 is completed)
        
        # Issue:
        # 1. Shows "Completed" even though debt remains (1200 invoice not fully covered).
        # 2. Shows total amount 2000, which is misleading. Should show what? 
        #    - Paid: 800 (500+300)
        #    - Debt: 400 (1200 - 800?? No, 1200 is the invoice).
        #    - Balance: -1200 + 800 = -400.
        
        # Let's see what the REAL balance is
        real_balance = recalculate_student_balance(db, student.id)
        print(f"\nReal Balance: {real_balance}") # Should be 800 (Paid) - 1200 (Invoiced) = -400.
        
    finally:
        # Cleanup
        if 'student' in locals():
            db.query(Payment).filter(Payment.student_id == student.id).delete()
            db.delete(student)
            db.commit()
        db.close()

if __name__ == "__main__":
    test_matrix_logic()
