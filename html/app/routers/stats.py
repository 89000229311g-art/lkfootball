
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, aliased, joinedload
from sqlalchemy import func, case, and_, desc, extract
from typing import List, Optional
from datetime import date, datetime, timedelta

from app.core.deps import get_db, get_current_user
from app.models import Student, Group, Event, Payment, User, Attendance
from app.schemas.stats import DashboardStats, GroupStatItem, PaymentStatItem, ExpiringStudentItem, StudentBasicItem

router = APIRouter()

@router.get("/dashboard", response_model=DashboardStats)
async def get_dashboard_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.role not in ["super_admin", "admin", "owner"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    now = datetime.now()
    this_month = now.month
    this_year = now.year

    # 1. Students Counts
    total_students = db.query(func.count(Student.id)).filter(Student.deleted_at.is_(None)).scalar()
    active_students = db.query(func.count(Student.id)).filter(Student.status == 'active', Student.deleted_at.is_(None)).scalar()

    # 2. Groups & Coaches
    total_groups = db.query(func.count(Group.id)).filter(Group.deleted_at.is_(None)).scalar()
    # Estimate total coaches from groups (primary coaches)
    total_coaches = db.query(func.count(func.distinct(Group.coach_id))).filter(
        Group.coach_id != None,
        Group.deleted_at.is_(None)
    ).scalar()

    # 3. Events This Month
    events_this_month = db.query(func.count(Event.id)).filter(
        extract('month', Event.start_time) == this_month,
        extract('year', Event.start_time) == this_year
    ).scalar()

    # 4. Revenue
    total_revenue = db.query(func.sum(Payment.amount)).filter(
        Payment.status == 'completed',
        Payment.deleted_at.is_(None)
    ).scalar() or 0.0

    # Revenue this month
    # FIX: Use payment_date (Transaction Date) to match Payments page logic
    revenue_this_month = db.query(func.sum(Payment.amount)).filter(
        Payment.status == 'completed',
        Payment.deleted_at.is_(None),
        extract('month', Payment.payment_date) == this_month,
        extract('year', Payment.payment_date) == this_year
    ).scalar() or 0.0

    # 5. Group Stats (Optimized)
    # Get student count per group
    stmt = db.query(
        Student.group_id, 
        func.count(Student.id).label('count')
    ).filter(Student.deleted_at.is_(None)).group_by(Student.group_id).subquery()
    
    groups_query = db.query(
        Group, 
        User.full_name.label('coach_name'),
        func.coalesce(stmt.c.count, 0).label('student_count')
    ).outerjoin(User, Group.coach_id == User.id)\
     .outerjoin(stmt, Group.id == stmt.c.group_id)\
     .filter(Group.deleted_at.is_(None))\
     .all()
    
    group_stats = []
    for g, coach_name, s_count in groups_query:
        group_stats.append(GroupStatItem(
            id=g.id,
            name=g.name,
            coach_name=coach_name or "Не назначен",
            students_count=s_count,
            monthly_fee=g.monthly_fee or 0,
            potential_revenue=s_count * (g.monthly_fee or 0)
        ))

    # 6. Recent Payments
    recent_payments_query = db.query(Payment).options(
        joinedload(Payment.student).joinedload(Student.group)
    ).filter(
        Payment.status == 'completed',
        Payment.deleted_at.is_(None)
    ).order_by(desc(Payment.payment_date)).limit(5).all()
    
    recent_payments = []
    for p in recent_payments_query:
        student_name = "Unknown"
        group_name = None
        if p.student:
            student_name = f"{p.student.first_name} {p.student.last_name}"
            if p.student.group:
                group_name = p.student.group.name
        elif p.last_student_name:
            student_name = p.last_student_name

        recent_payments.append(PaymentStatItem(
            id=p.id,
            amount=p.amount,
            payment_date=p.payment_date,
            student_name=student_name,
            group_name=group_name,
            payment_method=p.method
        ))

    # 7. Expiring Docs (kept for compatibility, can be replaced by medical_debts logic if needed)
    warning_date = now.date() + timedelta(days=30)
    expiring_query = db.query(Student).filter(
        Student.status == 'active',
        Student.medical_certificate_expires != None,
        Student.medical_certificate_expires < warning_date,
        Student.deleted_at.is_(None)
    ).all()
    
    expiring_students = [
        ExpiringStudentItem(
            id=s.id,
            first_name=s.first_name,
            last_name=s.last_name,
            medical_certificate_expires=s.medical_certificate_expires
        ) for s in expiring_query
    ]
    expiring_docs_count = len(expiring_students)

    # 8. Attendance Rate
    total_attendances = db.query(func.count(Attendance.id)).join(Event).filter(
        extract('month', Event.start_time) == this_month,
        extract('year', Event.start_time) == this_year
    ).scalar()
    
    present_attendances = db.query(func.count(Attendance.id)).join(Event).filter(
        extract('month', Event.start_time) == this_month,
        extract('year', Event.start_time) == this_year,
        Attendance.status == 'present'
    ).scalar()
    
    attendance_rate = 0
    if total_attendances > 0:
        attendance_rate = round((present_attendances / total_attendances) * 100, 1)

    # 9. Paid This Month (Logic for Admin Dashboard)
    paid_payments_query = db.query(Payment.student_id).filter(
        Payment.status == 'completed',
        Payment.deleted_at.is_(None),
        extract('month', func.coalesce(Payment.payment_period, Payment.payment_date)) == this_month,
        extract('year', func.coalesce(Payment.payment_period, Payment.payment_date)) == this_year
    ).distinct()
    
    paid_student_ids = {row[0] for row in paid_payments_query.all() if row[0] is not None}
    
    # Paid Students List (Limit 10)
    paid_students_query = db.query(Student).options(joinedload(Student.group)).filter(
        Student.id.in_(paid_student_ids)
    ).limit(10).all()
    
    paid_students_list = [
        StudentBasicItem(
            id=s.id,
            first_name=s.first_name,
            last_name=s.last_name,
            group_name=s.group.name if s.group else "-"
        ) for s in paid_students_query
    ]
    paid_students_count = len(paid_student_ids)

    # 10. Debtors List (Active & Not Paid)
    debtors_query = db.query(Student).options(joinedload(Student.group)).filter(
        Student.status == 'active',
        Student.id.notin_(paid_student_ids)
    )
    debtors_count = debtors_query.count()
    debtors_list_items = debtors_query.limit(10).all()
    
    debtors_list = [
        StudentBasicItem(
            id=s.id,
            first_name=s.first_name,
            last_name=s.last_name,
            group_name=s.group.name if s.group else "-",
            debt_amount=s.group.monthly_fee if s.group else 0
        ) for s in debtors_list_items
    ]

    # 11. Medical Debts (Missing or Expired)
    med_debts_query = db.query(Student).options(joinedload(Student.group)).filter(
        Student.status == 'active',
        (Student.medical_certificate_expires == None) | (Student.medical_certificate_expires < now.date())
    )
    
    medical_debts_count = med_debts_query.count()
    medical_debts_items = med_debts_query.limit(10).all()
    
    medical_debts_list = [
        StudentBasicItem(
            id=s.id,
            first_name=s.first_name,
            last_name=s.last_name,
            group_name=s.group.name if s.group else "-",
            med_status="missing" if not s.medical_certificate_expires else "expired"
        ) for s in medical_debts_items
    ]

    # 12. Birthdays Today
    birthdays_query = db.query(Student).options(joinedload(Student.group)).filter(
        extract('month', Student.dob) == now.month,
        extract('day', Student.dob) == now.day,
        Student.status == 'active',
        Student.deleted_at.is_(None)
    )
    
    birthdays_count = birthdays_query.count()
    birthdays_list_items = birthdays_query.limit(10).all()
    
    birthdays_list = [
        StudentBasicItem(
            id=s.id,
            first_name=s.first_name,
            last_name=s.last_name,
            group_name=s.group.name if s.group else "-",
            med_status=None
        ) for s in birthdays_list_items
    ]

    return DashboardStats(
        total_students=total_students,
        active_students=active_students,
        total_groups=total_groups,
        total_coaches=total_coaches,
        events_this_month=events_this_month,
        total_revenue=total_revenue,
        revenue_this_month=revenue_this_month,
        attendance_rate=attendance_rate,
        group_stats=group_stats,
        recent_payments=recent_payments,
        expiring_students=expiring_students,
        expiring_docs_count=expiring_docs_count,
        paid_students_count=paid_students_count,
        paid_students_list=paid_students_list,
        debtors_count=debtors_count,
        debtors_list=debtors_list,
        medical_debts_count=medical_debts_count,
        medical_debts_list=medical_debts_list,
        birthdays_count=birthdays_count,
        birthdays_list=birthdays_list
    )
