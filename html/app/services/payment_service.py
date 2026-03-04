from datetime import date, timedelta
from sqlalchemy.orm import Session
from app.models import Group, Student, Payment
from app.core.localization import get_month_name_ru
# from app.core.background_tasks import notify_new_invoice, background_tasks

def generate_monthly_invoices(db: Session):
    """
    Generate monthly invoices for all active students.
    Should be run daily, but only acts on specific days (e.g., 25th).
    """
    today = date.today()
    
    # Run only on the 25th of the month
    if today.day != 25:
        return {"message": "Not the 25th of the month, skipping invoice generation", "count": 0}
    
    # Determine target month (Next Month)
    next_month_date = (today.replace(day=1) + timedelta(days=32)).replace(day=1)
    target_period = next_month_date
    
    # Get all active students
    students = db.query(Student).filter(
        Student.status == 'active',
        Student.deleted_at.is_(None),
        Student.group_id.isnot(None)
    ).all()
    
    invoices_created = 0
    
    for student in students:
        # Check if invoice already exists for this period
        existing = db.query(Payment).filter(
            Payment.student_id == student.id,
            Payment.payment_period == target_period
        ).first()
        
        if existing:
            continue
            
        # Determine amount
        # 1. Individual fee (if set)
        # 2. Group fee
        group = student.group
        if not group:
            continue
            
        if student.individual_fee is not None:
            amount = student.individual_fee
        else:
            amount = group.monthly_fee or 0.0
            
        if amount <= 0:
            continue
            
        # Create Invoice (Pending Payment)
        payment = Payment(
            student_id=student.id,
            amount=amount,
            payment_date=today,
            payment_period=target_period,
            method=None,
            status="pending",
            description=f"Автоматический счет за {get_month_name_ru(target_period.month)} {target_period.year}"
        )
        db.add(payment)
        
        # Update Student Balance (Debit)
        # student.balance -= amount
        # student.is_debtor = True
        # db.add(student)
        # Instead of manual update, we'll rely on recalculation or do it here if we want speed.
        # For now, manual is fine for generation, but let's be consistent.
        # But recalculate needs DB commit of payment first.
        
        student.balance -= amount
        student.is_debtor = True
        db.add(student)
        
        invoices_created += 1
        
    db.commit()
    
    return {"message": f"Generated {invoices_created} invoices for {target_period}", "count": invoices_created}

def recalculate_student_balance(db: Session, student_id: int) -> float:
    """
    🔄 Полный пересчет баланса ученика.
    Баланс = (Сумма оплаченных) - (Сумма выставленных счетов)
    """
    # Get all active payments/invoices
    payments = db.query(Payment).filter(
        Payment.student_id == student_id,
        Payment.deleted_at.is_(None)
    ).all()
    
    total_paid = sum(p.amount for p in payments if p.status == 'completed')
    # Total invoiced includes all non-cancelled payments (both pending and completed)
    # This ensures that a completed payment counts as both an invoice (liability) and a payment (asset), resulting in 0 net change.
    total_invoiced = sum(p.amount for p in payments if p.status != 'cancelled')
    
    new_balance = total_paid - total_invoiced
    
    # Update student
    student = db.query(Student).get(student_id)
    if student:
        student.balance = new_balance
        # Считаем должником, если баланс отрицательный (есть неоплаченные счета)
        student.is_debtor = new_balance < -1.0 
        
        db.add(student)
        db.flush() # Ensure changes are ready for commit
        
    return new_balance
