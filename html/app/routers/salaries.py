"""
Salary management API endpoints.

Access control:
- super_admin: Full access (create/edit contracts, create payments, view all)
- accountant: Can create payments, view all, cannot create/edit contracts
- admin, coach: Can view own payments only
"""
import json
from typing import List, Optional
from datetime import date
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, or_, and_

from app.core.deps import get_db, get_current_user
from app.core.timezone import now_naive  # Moldova timezone
from app.models import User, Group, Student, Event, Attendance, AttendanceStatus
from app.models.salary import EmployeeContract, SalaryPayment
from app.schemas.salary import (
    ContractCreate, ContractUpdate, ContractResponse, ContractWithCalculation, ContractListResponse,
    PaymentCreate, PaymentUpdate, PaymentResponse, PaymentListResponse,
    MonthlyReportResponse, EmployeeSalaryReport, EmployeePaymentsSummary
)

router = APIRouter()

# Helper: Check if user can manage salaries (super_admin or accountant)
def can_manage_salaries(user: User) -> bool:
    role = user.role.lower() if user.role else ""
    return role in ["super_admin", "accountant", "owner"]

# Helper: Check if user can create/edit contracts (super_admin only)
def can_manage_contracts(user: User) -> bool:
    role = user.role.lower() if user.role else ""
    return role in ["super_admin", "owner"]

# Helper: Check if user is staff (can have salary)
def is_staff(user: User) -> bool:
    role = user.role.lower() if user.role else ""
    return role in ["super_admin", "admin", "accountant", "coach", "owner"]


@router.get("/staff")
async def get_staff_for_contracts(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get all staff members (potential contract holders).
    Returns users with role: super_admin, admin, accountant, coach.
    Includes current contract status.
    """
    if not can_manage_salaries(current_user):
        raise HTTPException(status_code=403, detail="Недостаточно прав")
    
    # Get all staff users
    staff_users = db.query(User).filter(
        User.role.in_(["super_admin", "admin", "accountant", "coach", "owner"]),
        User.deleted_at.is_(None)
    ).order_by(User.full_name).all()
    
    # Get all active contracts
    contracts = db.query(EmployeeContract).filter(
        EmployeeContract.is_active == True
    ).all()
    contracts_map = {c.user_id: c for c in contracts}
    
    result = []
    for user in staff_users:
        contract = contracts_map.get(user.id)
        
        rates_val = {}
        if contract and contract.rates:
            if isinstance(contract.rates, str):
                try:
                    rates_val = json.loads(contract.rates)
                except:
                    pass
            elif isinstance(contract.rates, dict):
                rates_val = contract.rates

        result.append({
            "id": user.id,
            "full_name": user.full_name,
            "role": user.role,
            "phone": user.phone,
            "has_contract": contract is not None,
            "contract_id": contract.id if contract else None,
            "salary_type": contract.salary_type if contract else None,
            "base_salary": contract.base_salary if contract else 0,
            "per_student_rate": contract.per_student_rate if contract else 0,
            "per_training_rate": contract.per_training_rate if contract else 0,
            "rates": rates_val,
            "advance_percent": contract.advance_percent if contract else 40,
            "advance_day": contract.advance_day if contract else 25,
            "salary_day": contract.salary_day if contract else 10,
            "effective_from": contract.effective_from if contract else None,
            "notes": contract.notes if contract else ""
        })
    
    return {"data": result}


# ==================== CONTRACTS ====================

@router.get("/contracts", response_model=ContractListResponse)
async def get_contracts(
    user_id: Optional[int] = None,
    active_only: bool = True,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get employee contracts.
    - super_admin, accountant: See all contracts
    - Others: See only own contract
    """
    if not can_manage_salaries(current_user):
        # Non-managers can only see their own
        user_id = current_user.id
    
    query = db.query(EmployeeContract)
    
    if user_id:
        query = query.filter(EmployeeContract.user_id == user_id)
    
    if active_only:
        query = query.filter(EmployeeContract.is_active == True)
    
    contracts = query.order_by(EmployeeContract.created_at.desc()).all()
    
    result = []
    for c in contracts:
        user = db.query(User).filter(User.id == c.user_id).first()
        
        # Ensure rates is dict
        rates_val = c.rates
        if isinstance(rates_val, str):
            try:
                rates_val = json.loads(rates_val)
            except:
                rates_val = {}
                
        c_dict = c.__dict__.copy()
        c_dict["rates"] = rates_val
        
        result.append({
            **c_dict,
            "user_name": user.full_name if user else None,
            "user_role": user.role if user else None,
            "salary_type_display": c.salary_type_display
        })
    
    return {"data": result, "total": len(result)}


@router.post("/contracts", response_model=ContractResponse)
async def create_contract(
    contract_in: ContractCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Create new salary contract for employee.
    Only super_admin can create contracts.
    """
    if not can_manage_contracts(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Только руководитель может создавать контракты"
        )
    
    # Verify target user exists and is staff
    target_user = db.query(User).filter(User.id == contract_in.user_id).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    
    if not is_staff(target_user):
        raise HTTPException(
            status_code=400,
            detail="Контракты можно создавать только для сотрудников"
        )
    
    # Deactivate any existing active contracts for this user
    db.query(EmployeeContract).filter(
        EmployeeContract.user_id == contract_in.user_id,
        EmployeeContract.is_active == True
    ).update({"is_active": False})
    
    contract = EmployeeContract(
        user_id=contract_in.user_id,
        salary_type=contract_in.salary_type.value,
        base_salary=contract_in.base_salary,
        per_student_rate=contract_in.per_student_rate,
        per_training_rate=contract_in.per_training_rate,
        rates=contract_in.rates,
        advance_percent=contract_in.advance_percent,
        advance_day=contract_in.advance_day,
        salary_day=contract_in.salary_day,
        effective_from=contract_in.effective_from,
        effective_to=contract_in.effective_to,
        notes=contract_in.notes,
        is_active=True,
        created_by_id=current_user.id
    )
    
    db.add(contract)
    db.commit()
    db.refresh(contract)
    
    return {
        **contract.__dict__,
        "user_name": target_user.full_name,
        "user_role": target_user.role,
        "salary_type_display": contract.salary_type_display
    }


@router.put("/contracts/{contract_id}", response_model=ContractResponse)
async def update_contract(
    contract_id: int,
    contract_in: ContractUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Update salary contract.
    Only super_admin can edit contracts.
    """
    if not can_manage_contracts(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Только руководитель может редактировать контракты"
        )
    
    contract = db.query(EmployeeContract).filter(EmployeeContract.id == contract_id).first()
    if not contract:
        raise HTTPException(status_code=404, detail="Контракт не найден")
    
    update_data = contract_in.dict(exclude_unset=True)
    if "salary_type" in update_data and update_data["salary_type"]:
        update_data["salary_type"] = update_data["salary_type"].value
    
    for field, value in update_data.items():
        setattr(contract, field, value)
    
    contract.updated_at = now_naive()  # Moldova timezone
    db.commit()
    db.refresh(contract)
    
    user = db.query(User).filter(User.id == contract.user_id).first()
    return {
        **contract.__dict__,
        "user_name": user.full_name if user else None,
        "user_role": user.role if user else None,
        "salary_type_display": contract.salary_type_display
    }


# ==================== SALARY CALCULATION ====================

def calculate_salary(user_id: int, year: int, month: int, db: Session) -> dict:
    """
    Calculate salary for employee for given month.
    
    Returns:
    {
        "base": float,
        "students_bonus": float,
        "trainings_bonus": float,
        "total": float,
        "students_count": int,
        "trainings_count": int,
        "contract": EmployeeContract or None
    }
    """
    contract = db.query(EmployeeContract).filter(
        EmployeeContract.user_id == user_id,
        EmployeeContract.is_active == True
    ).first()
    
    if not contract:
        return {
            "base": 0, "students_bonus": 0, "trainings_bonus": 0,
            "total": 0, "students_count": 0, "trainings_count": 0,
            "contract": None
        }
    
    # Count students in coach's groups (primary and secondary)
    primary_groups = db.query(Group).filter(Group.coach_id == user_id).all()
    user = db.query(User).filter(User.id == user_id).first()
    secondary_groups = user.coach_groups if user else []
    
    # Combine and deduplicate
    all_groups = {g.id: g for g in primary_groups + secondary_groups}.values()
    coach_groups = list(all_groups)
    
    students_count = sum(
        db.query(Student).filter(Student.group_id == g.id, Student.deleted_at.is_(None)).count()
        for g in coach_groups
    )
    
    # Count trainings conducted in the month
    start_date = date(year, month, 1)
    if month == 12:
        end_date = date(year + 1, 1, 1)
    else:
        end_date = date(year, month + 1, 1)
    
    group_ids = [g.id for g in coach_groups]
    
    # Events for coach's groups
    trainings_query = db.query(Event).filter(
        Event.start_time >= start_date.isoformat(),
        Event.start_time < end_date.isoformat(),
        Event.group_id.in_(group_ids) if group_ids else False
    )
    
    trainings_count = trainings_query.count()
    
    # Calculate salary based on type
    base = contract.base_salary or 0
    students_bonus = 0
    trainings_bonus = 0
    details = []  # List of {date, description, amount, type}
    
    if contract.salary_type == "fixed":
        total = base
        if base > 0:
            details.append({
                "date": start_date.strftime("%Y-%m-%d"),
                "description": "Фиксированный оклад",
                "amount": base,
                "type": "base"
            })

    elif contract.salary_type == "per_student":
        students_bonus = students_count * (contract.per_student_rate or 0)
        total = students_bonus
        # Add details per group
        for g in coach_groups:
            count = db.query(Student).filter(Student.group_id == g.id, Student.deleted_at.is_(None)).count()
            if count > 0:
                amount = count * (contract.per_student_rate or 0)
                details.append({
                    "date": start_date.strftime("%Y-%m-%d"),
                    "description": f"Группа {g.name} ({count} учеников)",
                    "amount": amount,
                    "type": "student_bonus"
                })

    elif contract.salary_type == "per_training":
        # Get actual trainings for details
        trainings = trainings_query.order_by(Event.start_time).all()
        
        trainings_bonus = 0
        for t in trainings:
            # Determine rate: specific rate for event type OR default per_training_rate
            amount = contract.per_training_rate or 0
            
            # Safe rates access
            if contract.rates:
                try:
                    rates_dict = contract.rates
                    if isinstance(rates_dict, str):
                        rates_dict = json.loads(rates_dict)
                    
                    if isinstance(rates_dict, dict) and t.type in rates_dict:
                        amount = float(rates_dict[t.type])
                except Exception:
                    pass # Fallback to default
            
            trainings_bonus += amount
            
            # Get attendance count for this training
            attendance_count = db.query(Attendance).filter(
                Attendance.event_id == t.id,
                Attendance.status == AttendanceStatus.PRESENT
            ).count()
            
            details.append({
                "date": t.start_time.strftime("%Y-%m-%d %H:%M"),
                "description": f"{t.type}: {t.group.name if t.group else ''} ({attendance_count} чел.) - {amount} MDL",
                "amount": amount,
                "type": "training_bonus"
            })
    
        total = trainings_bonus

    elif contract.salary_type == "combined":
        # Base
        if base > 0:
            details.append({
                "date": start_date.strftime("%Y-%m-%d"),
                "description": "Фиксированный оклад",
                "amount": base,
                "type": "base"
            })
            
        # Students
        students_bonus = students_count * (contract.per_student_rate or 0)
        if students_bonus > 0:
             details.append({
                "date": start_date.strftime("%Y-%m-%d"),
                "description": f"Бонус за учеников ({students_count} чел.)",
                "amount": students_bonus,
                "type": "student_bonus"
            })

        # Trainings
        trainings = trainings_query.order_by(Event.start_time).all()
        
        for t in trainings:
            # Determine rate
            amount = contract.per_training_rate or 0
            
            # Safe rates access
            if contract.rates:
                try:
                    rates_dict = contract.rates
                    if isinstance(rates_dict, str):
                        rates_dict = json.loads(rates_dict)
                    
                    if isinstance(rates_dict, dict) and t.type in rates_dict:
                        amount = float(rates_dict[t.type])
                except Exception:
                    pass # Fallback to default
            
            trainings_bonus += amount
            
            attendance_count = db.query(Attendance).filter(
                Attendance.event_id == t.id,
                Attendance.status == AttendanceStatus.PRESENT
            ).count()
            
            details.append({
                "date": t.start_time.strftime("%Y-%m-%d %H:%M"),
                "description": f"{t.type}: {t.group.name if t.group else ''} ({attendance_count} чел.) - {amount} MDL",
                "amount": amount,
                "type": "training_bonus"
            })
        
        trainings_count = len(trainings)
        
        total = base + students_bonus + trainings_bonus
    else:
        total = base
    
    return {
        "base": base,
        "students_bonus": students_bonus,
        "trainings_bonus": trainings_bonus,
        "total": total,
        "students_count": students_count,
        "trainings_count": trainings_count,
        "contract": contract,
        "details": details
    }


@router.get("/calculate/{user_id}")
async def get_salary_calculation(
    user_id: int,
    year: int = Query(default=None),
    month: int = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Calculate salary for employee for given month.
    """
    if not can_manage_salaries(current_user) and current_user.id != user_id:
        raise HTTPException(status_code=403, detail="Недостаточно прав")
    
    if not year:
        year = date.today().year
    if not month:
        month = date.today().month
    
    calc = calculate_salary(user_id, year, month, db)
    user = db.query(User).filter(User.id == user_id).first()
    
    advance_amount = calc["total"] * (calc["contract"].advance_percent / 100) if calc["contract"] else 0
    
    return {
        "user_id": user_id,
        "user_name": user.full_name if user else None,
        "year": year,
        "month": month,
        "salary_type": calc["contract"].salary_type if calc["contract"] else None,
        "base_salary": calc["base"],
        "students_count": calc["students_count"],
        "students_bonus": calc["students_bonus"],
        "trainings_count": calc["trainings_count"],
        "trainings_bonus": calc["trainings_bonus"],
        "total_salary": calc["total"],
        "advance_amount": round(advance_amount, 2),
        "remaining_amount": round(calc["total"] - advance_amount, 2)
    }


# ==================== PAYMENTS ====================

@router.get("/payments", response_model=PaymentListResponse)
async def get_payments(
    user_id: Optional[int] = None,
    year: Optional[int] = None,
    month: Optional[int] = None,
    payment_type: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get salary payments with filters.
    - super_admin, accountant: See all payments
    - Others: See only own payments
    """
    if not can_manage_salaries(current_user):
        user_id = current_user.id
    
    query = db.query(SalaryPayment)
    
    if user_id:
        query = query.filter(SalaryPayment.user_id == user_id)
    if year:
        query = query.filter(SalaryPayment.period_year == year)
    if month:
        query = query.filter(SalaryPayment.period_month == month)
    if payment_type:
        query = query.filter(SalaryPayment.payment_type == payment_type)
    
    total = query.count()
    payments = query.order_by(SalaryPayment.payment_date.desc()).offset(skip).limit(limit).all()
    
    result = []
    for p in payments:
        user = db.query(User).filter(User.id == p.user_id).first()
        result.append({
            **{k: v for k, v in p.__dict__.items() if k != "_sa_instance_state"},
            "user_name": user.full_name if user else None,
            "user_role": user.role if user else None,
            "payment_type_display": p.payment_type_display,
            "period_display": p.period_display
        })
    
    return {"data": result, "total": total, "skip": skip, "limit": limit}


@router.post("/payments", response_model=PaymentResponse)
async def create_payment(
    payment_in: PaymentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Create salary payment.
    super_admin and accountant can create payments.
    """
    if not can_manage_salaries(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Недостаточно прав для создания выплат"
        )
    
    # Verify target user exists
    target_user = db.query(User).filter(User.id == payment_in.user_id).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    
    # Get current calculation for audit
    calc = calculate_salary(
        payment_in.user_id, 
        payment_in.period_year, 
        payment_in.period_month, 
        db
    )
    
    payment = SalaryPayment(
        user_id=payment_in.user_id,
        amount=payment_in.amount,
        payment_type=payment_in.payment_type.value,
        payment_date=payment_in.payment_date,
        period_month=payment_in.period_month,
        period_year=payment_in.period_year,
        method=payment_in.method.value,
        status=payment_in.status.value,
        description=payment_in.description,
        reference_id=payment_in.reference_id,
        calculated_base=calc["base"],
        calculated_students=calc["students_count"],
        calculated_trainings=calc["trainings_count"],
        created_by_id=current_user.id
    )
    
    db.add(payment)
    db.commit()
    db.refresh(payment)
    
    return {
        **{k: v for k, v in payment.__dict__.items() if k != "_sa_instance_state"},
        "user_name": target_user.full_name,
        "user_role": target_user.role,
        "payment_type_display": payment.payment_type_display,
        "period_display": payment.period_display
    }


@router.put("/payments/{payment_id}", response_model=PaymentResponse)
async def update_payment(
    payment_id: int,
    payment_in: PaymentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Update salary payment.
    """
    if not can_manage_salaries(current_user):
        raise HTTPException(status_code=403, detail="Недостаточно прав")
    
    payment = db.query(SalaryPayment).filter(SalaryPayment.id == payment_id).first()
    if not payment:
        raise HTTPException(status_code=404, detail="Платёж не найден")
    
    update_data = payment_in.dict(exclude_unset=True)
    
    # Convert enums to values
    for field in ["payment_type", "method", "status"]:
        if field in update_data and update_data[field]:
            update_data[field] = update_data[field].value
    
    for field, value in update_data.items():
        setattr(payment, field, value)
    
    db.commit()
    db.refresh(payment)
    
    user = db.query(User).filter(User.id == payment.user_id).first()
    return {
        **{k: v for k, v in payment.__dict__.items() if k != "_sa_instance_state"},
        "user_name": user.full_name if user else None,
        "user_role": user.role if user else None,
        "payment_type_display": payment.payment_type_display,
        "period_display": payment.period_display
    }


@router.delete("/payments/{payment_id}")
async def delete_payment(
    payment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Delete salary payment. Only super_admin.
    """
    if not can_manage_contracts(current_user):
        raise HTTPException(status_code=403, detail="Только руководитель может удалять платежи")
    
    payment = db.query(SalaryPayment).filter(SalaryPayment.id == payment_id).first()
    if not payment:
        raise HTTPException(status_code=404, detail="Платёж не найден")
    
    db.delete(payment)
    db.commit()
    
    return {"message": "Платёж удалён"}


# ==================== MY SALARY (for employees) ====================

@router.get("/my-payments", response_model=EmployeePaymentsSummary)
async def get_my_payments(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get current user's salary information and payment history.
    Available for all staff members.
    """
    if not is_staff(current_user):
        raise HTTPException(status_code=403, detail="Только для сотрудников")
    
    today = date.today()
    current_month = today.month
    current_year = today.year
    
    # Get active contract
    contract = db.query(EmployeeContract).filter(
        EmployeeContract.user_id == current_user.id,
        EmployeeContract.is_active == True
    ).first()
    
    # Calculate current month salary
    calc = calculate_salary(current_user.id, current_year, current_month, db)
    
    # Get payments for current month
    current_month_payments = db.query(SalaryPayment).filter(
        SalaryPayment.user_id == current_user.id,
        SalaryPayment.period_year == current_year,
        SalaryPayment.period_month == current_month,
        SalaryPayment.status == "completed"
    ).all()
    
    current_month_paid = sum(
        p.amount if p.payment_type != "deduction" else -p.amount 
        for p in current_month_payments
    )
    
    # Year to date totals
    ytd_payments = db.query(SalaryPayment).filter(
        SalaryPayment.user_id == current_user.id,
        SalaryPayment.period_year == current_year,
        SalaryPayment.status == "completed"
    ).all()
    
    ytd_total_paid = sum(
        p.amount if p.payment_type != "deduction" else -p.amount 
        for p in ytd_payments
    )
    
    # Calculate YTD earned (sum of all months)
    ytd_total_earned = 0
    for m in range(1, current_month + 1):
        month_calc = calculate_salary(current_user.id, current_year, m, db)
        ytd_total_earned += month_calc["total"]
    
    # Determine next payment
    next_payment_type = None
    next_payment_date = None
    next_payment_amount = None
    
    if contract:
        advance_day = contract.advance_day or 25
        salary_day = contract.salary_day or 10
        advance_amount = calc["total"] * (contract.advance_percent / 100)
        
        # Check if advance already paid this month
        advance_paid = any(p.payment_type == "advance" for p in current_month_payments)
        
        if today.day < advance_day and not advance_paid:
            next_payment_type = "advance"
            next_payment_date = date(current_year, current_month, advance_day)
            next_payment_amount = advance_amount
        elif today.day < salary_day or (today.day >= advance_day and not advance_paid):
            # Next is salary on 10th of next month
            if current_month == 12:
                next_payment_date = date(current_year + 1, 1, salary_day)
            else:
                next_payment_date = date(current_year, current_month + 1, salary_day)
            next_payment_type = "salary"
            next_payment_amount = calc["total"] - advance_amount
    
    # Recent payments (last 10)
    recent_payments = db.query(SalaryPayment).filter(
        SalaryPayment.user_id == current_user.id,
        SalaryPayment.status == "completed"
    ).order_by(SalaryPayment.payment_date.desc()).limit(10).all()
    
    recent_list = []
    for p in recent_payments:
        recent_list.append({
            **{k: v for k, v in p.__dict__.items() if k != "_sa_instance_state"},
            "user_name": current_user.full_name,
            "user_role": current_user.role,
            "payment_type_display": p.payment_type_display,
            "period_display": p.period_display
        })
    
    return {
        "user_id": current_user.id,
        "user_name": current_user.full_name,
        "has_contract": contract is not None,
        "salary_type": contract.salary_type if contract else None,
        "base_salary": contract.base_salary if contract else 0,
        "current_month_salary": calc["total"],
        "current_month_paid": current_month_paid,
        "current_month_remaining": calc["total"] - current_month_paid,
        "ytd_total_earned": ytd_total_earned,
        "ytd_total_paid": ytd_total_paid,
        "next_payment_type": next_payment_type,
        "next_payment_date": next_payment_date,
        "next_payment_amount": round(next_payment_amount, 2) if next_payment_amount else None,
        "recent_payments": recent_list
    }


# ==================== REPORTS ====================

@router.get("/report", response_model=MonthlyReportResponse)
async def get_monthly_report(
    year: int = Query(default=None),
    month: int = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get monthly salary report for all employees.
    Only super_admin and accountant.
    Optimized to prevent N+1 queries.
    """
    if not can_manage_salaries(current_user):
        raise HTTPException(status_code=403, detail="Недостаточно прав")
    
    if not year:
        year = date.today().year
    if not month:
        month = date.today().month
    
    month_names = {
        1: "Январь", 2: "Февраль", 3: "Март", 4: "Апрель",
        5: "Май", 6: "Июнь", 7: "Июль", 8: "Август",
        9: "Сентябрь", 10: "Октябрь", 11: "Ноябрь", 12: "Декабрь"
    }
    
    # 1. Get all staff
    staff = db.query(User).filter(
        User.role.in_(["super_admin", "admin", "accountant", "coach", "owner"]),
        User.deleted_at.is_(None)
    ).all()
    
    # 2. Get all active contracts
    contracts = db.query(EmployeeContract).filter(
        EmployeeContract.is_active == True
    ).all()
    contracts_map = {c.user_id: c for c in contracts}
    
    # 3. Get all groups with coaches
    groups = db.query(Group).options(joinedload(Group.coaches)).all()
    groups_by_coach = {}
    for g in groups:
        # Add primary coach
        if g.coach_id:
            if g.coach_id not in groups_by_coach:
                groups_by_coach[g.coach_id] = []
            groups_by_coach[g.coach_id].append(g)
        
        # Add secondary coaches (many-to-many)
        for coach in g.coaches:
            if coach.id not in groups_by_coach:
                groups_by_coach[coach.id] = []
            # Avoid duplicates if coach is both primary and secondary (shouldn't happen but safe)
            if g not in groups_by_coach[coach.id]:
                groups_by_coach[coach.id].append(g)
        
    # 4. Get student counts per group
    student_counts = db.query(
        Student.group_id, 
        func.count(Student.id)
    ).filter(
        Student.deleted_at.is_(None),
        Student.group_id.isnot(None)
    ).group_by(Student.group_id).all()
    student_counts_map = {g_id: count for g_id, count in student_counts}
    
    # 5. Get all events for the month
    start_date = date(year, month, 1)
    if month == 12:
        end_date = date(year + 1, 1, 1)
    else:
        end_date = date(year, month + 1, 1)
        
    events = db.query(Event).filter(
        Event.start_time >= start_date.isoformat(),
        Event.start_time < end_date.isoformat()
    ).all()
    
    # 6. Get attendance counts for these events
    event_ids = [e.id for e in events]
    attendance_counts = {}
    if event_ids:
        att_data = db.query(
            Attendance.event_id, 
            func.count(Attendance.id)
        ).filter(
            Attendance.event_id.in_(event_ids), 
            Attendance.status == AttendanceStatus.PRESENT
        ).group_by(Attendance.event_id).all()
        attendance_counts = {e_id: count for e_id, count in att_data}
        
    # 7. Get payments for the period
    payments = db.query(SalaryPayment).filter(
        SalaryPayment.period_year == year,
        SalaryPayment.period_month == month,
        SalaryPayment.status == "completed"
    ).all()
    payments_map = {}
    for p in payments:
        if p.user_id not in payments_map:
            payments_map[p.user_id] = []
        payments_map[p.user_id].append(p)
        
    # 8. Build Report
    employees_report = []
    total_calculated = 0
    total_paid = 0
    
    for user in staff:
        contract = contracts_map.get(user.id)
        
        # Calculate Salary (In-Memory)
        base = 0
        students_bonus = 0
        trainings_bonus = 0
        total = 0
        students_count = 0
        trainings_count = 0
        
        if contract:
            base = contract.base_salary or 0
            
            # Students count
            user_groups = groups_by_coach.get(user.id, [])
            students_count = sum(student_counts_map.get(g.id, 0) for g in user_groups)
            
            # Trainings count
            user_group_ids = {g.id for g in user_groups}
            user_events = []
            for e in events:
                # Logic: Event belongs to one of the user's groups
                if e.group_id in user_group_ids:
                    user_events.append(e)
            
            trainings_count = len(user_events)
            
            # Calculate Bonuses
            if contract.salary_type == "fixed":
                total = base
            
            elif contract.salary_type == "per_student":
                students_bonus = students_count * (contract.per_student_rate or 0)
                total = students_bonus
                
            elif contract.salary_type == "per_training":
                # Pre-process rates
                rates_dict = {}
                if contract.rates:
                    try:
                        rates_val = contract.rates
                        if isinstance(rates_val, str):
                            rates_val = json.loads(rates_val)
                        if isinstance(rates_val, dict):
                            rates_dict = rates_val
                    except Exception:
                        pass

                for t in user_events:
                    rate = contract.per_training_rate or 0
                    if t.type in rates_dict:
                        try:
                            rate = float(rates_dict[t.type])
                        except Exception:
                            pass
                    trainings_bonus += rate
                total = trainings_bonus
            
            elif contract.salary_type == "combined":
                students_bonus = students_count * (contract.per_student_rate or 0)
                
                # Pre-process rates
                rates_dict = {}
                if contract.rates:
                    try:
                        rates_val = contract.rates
                        if isinstance(rates_val, str):
                            rates_val = json.loads(rates_val)
                        if isinstance(rates_val, dict):
                            rates_dict = rates_val
                    except Exception:
                        pass

                for t in user_events:
                    rate = contract.per_training_rate or 0
                    if t.type in rates_dict:
                        try:
                            rate = float(rates_dict[t.type])
                        except Exception:
                            pass
                    trainings_bonus += rate
                total = base + students_bonus + trainings_bonus
            else:
                total = base
        
        # Calculate Payments
        user_payments = payments_map.get(user.id, [])
        advance_paid = sum(p.amount for p in user_payments if p.payment_type == "advance")
        salary_paid = sum(p.amount for p in user_payments if p.payment_type == "salary")
        bonus_paid = sum(p.amount for p in user_payments if p.payment_type == "bonus")
        deductions = sum(p.amount for p in user_payments if p.payment_type == "deduction")
        user_total_paid = advance_paid + salary_paid + bonus_paid - deductions
        
        total_calculated += total
        total_paid += user_total_paid
        
        employees_report.append({
            "user_id": user.id,
            "user_name": user.full_name or "Unknown",
            "user_role": user.role or "staff",
            "contract_id": contract.id if contract else None,
            "salary_type": contract.salary_type if contract else None,
            "base_salary": base,
            "calculated_salary": total,
            "students_count": students_count,
            "trainings_count": trainings_count,
            "advance_paid": advance_paid,
            "salary_paid": salary_paid,
            "bonus_paid": bonus_paid,
            "deductions": deductions,
            "total_paid": user_total_paid,
            "remaining": total - user_total_paid
        })
    
    return {
        "year": year,
        "month": month,
        "month_name": month_names.get(month, ""),
        "total_employees": len(employees_report),
        "total_calculated": total_calculated,
        "total_paid": total_paid,
        "total_remaining": total_calculated - total_paid,
        "employees": employees_report
    }

