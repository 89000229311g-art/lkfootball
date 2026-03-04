import shutil
import mimetypes
import logging
from pathlib import Path
from typing import List, Optional
from datetime import date, timedelta
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form, BackgroundTasks, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_
from sqlalchemy.orm import selectinload
import os
import uuid
from app.core.deps import get_db, get_current_user, get_async_db, get_current_user_async
from app.core.timezone import now_naive, today as get_today, now as get_now  # Moldova timezone
from app.core.audit_service import log_create, log_update, log_delete, entity_to_dict

# Setup logging
logger = logging.getLogger(__name__)
from app.models import User, Student, StudentGuardian, Group, StudentGroupHistory, Attendance, AttendanceStatus, Payment, FreezeRequest, FreezeRequestStatus, Message, ChatType, Event
from app.schemas.student import (
    StudentCreate,
    StudentUpdate,
    StudentResponse,
    StudentWithGuardians,
    StudentPagination
)
from app.schemas.payment import StudentPendingInvoicesResponse
from app.schemas.freeze_request import FreezeRequestCreate, FreezeRequestResponse, FreezeRequestFileUpdate
from app.core.background_tasks import sync_to_google_sheets
from app.services.messenger import messenger_service

router = APIRouter()


# ==================== MONTHLY BALANCE CALCULATION ====================
def calculate_monthly_balance(student: Student, db: Session = None) -> dict:
    """
    Calculate monthly subscription balance for a student.
    
    Logic:
    - Uses individual_fee if set, otherwise uses group monthly_fee
    - Checks subscription_expires to handle freeze/extensions
    - If paid for current target month: +monthly_fee (green)
    - If NOT paid for current target month: -monthly_fee (red, debt)
    
    Returns:
        {
            "monthly_balance": float,  # +monthly_fee or -monthly_fee
            "is_paid_this_month": bool,
            "monthly_fee": float,      # Фактическая сумма к оплате
            "group_fee": float,        # Стандартная сумма группы
            "individual_fee": float|None,  # Индивидуальная скидка
            "fee_discount_reason": str|None,  # Причина скидки
            "target_month": str,
            "balance_color": str  # "green" or "red"
        }
    """
    today = date.today()
    current_day = today.day
    current_month = today.month
    current_year = today.year
    
    # Определяем сумму к оплате:
    # 1. Если есть individual_fee - используем его (скидка)
    # 2. Иначе - стандартная цена группы
    group_fee = 0.0
    if student.group:
        group_fee = student.group.monthly_fee or 0.0
    
    # Индивидуальная сумма имеет приоритет
    individual_fee = student.individual_fee
    monthly_fee = individual_fee if individual_fee is not None else group_fee
    
    # If no fee defined, return 0 balance
    if monthly_fee == 0:
        return {
            "monthly_balance": 0.0,
            "is_paid_this_month": True,
            "monthly_fee": 0.0,
            "group_fee": group_fee,
            "individual_fee": individual_fee,
            "fee_discount_reason": student.fee_discount_reason,
            "target_month": "",
            "balance_color": "grey"
        }
    
    # Determine target month (what we're checking payment for)
    # User request: Update data on the 1st of each month.
    # Parents should pay 25-31 for NEXT month, but the status display 
    # should reflect the CURRENT month until the 1st of the next month.
    
    # Always check for CURRENT month
    target_month = current_month
    target_year = current_year
    
    # Russian month names
    month_names_ru = {
        1: "Январь", 2: "Февраль", 3: "Март", 4: "Апрель",
        5: "Май", 6: "Июнь", 7: "Июль", 8: "Август",
        9: "Сентябрь", 10: "Октябрь", 11: "Ноябрь", 12: "Декабрь"
    }
    
    # Check payment status for target month
    # States: 
    # - PAID (completed payment exists) -> Green
    # - INVOICED (pending payment exists) -> Red (Debt)
    # - NONE (no invoice, no payment) -> Grey (No debt yet)
    
    payment_status = "none" # none, pending, completed
    total_paid = 0.0
    total_invoiced = 0.0
    
    payments_list = [p for p in (student.payments if hasattr(student, 'payments') else []) if p.deleted_at is None]
    
    for p in payments_list:
        p_date = p.payment_period or p.payment_date
        if p_date and p_date.year == target_year and p_date.month == target_month:
            if p.status == 'completed':
                total_paid += p.amount
                payment_status = 'completed' # At least one payment exists
            elif p.status == 'pending':
                total_invoiced += p.amount
                if payment_status == 'none':
                    payment_status = 'pending'
    
    # --- FREEZE / SUBSCRIPTION LOGIC ---
    is_subscription_active = False
    if student.subscription_expires:
        # Конец целевого месяца
        import calendar
        last_day = calendar.monthrange(target_year, target_month)[1]
        target_month_end = date(target_year, target_month, last_day)
        
        if student.subscription_expires >= target_month_end:
            payment_status = 'completed'
            is_subscription_active = True

    # --- PAST DEBTS CHECK (ACCOUNTANT LOGIC) ---
    # Only show past debts if INVOICE was issued (pending payment)
    past_debts = []
    
    # Helper to subtract months
    def subtract_months(dt, months):
        month = dt.month - months
        year = dt.year
        while month <= 0:
            month += 12
            year -= 1
        return date(year, month, 1)

    # Check T-1 and T-2
    for i in range(1, 3):
        check_date = subtract_months(date(target_year, target_month, 1), i)
        
        # Check payments for that month
        past_status = "none"
        for p in payments_list:
            p_date = p.payment_period or p.payment_date
            if p_date and p_date.year == check_date.year and p_date.month == check_date.month:
                if p.status == 'completed':
                    past_status = 'completed'
                    break
                elif p.status == 'pending':
                    past_status = 'pending'
        
        # Check freeze
        if past_status != 'completed' and student.subscription_expires:
            import calendar
            last_day_past = calendar.monthrange(check_date.year, check_date.month)[1]
            past_month_end = date(check_date.year, check_date.month, last_day_past)
            if student.subscription_expires >= past_month_end:
                past_status = 'completed'
                
        # Only add to "Past Debts" if there is a PENDING invoice
        if past_status == 'pending':
            past_debts.append({
                "month": check_date.month,
                "year": check_date.year,
                "name": f"{month_names_ru.get(check_date.month, '')}"
            })

    # Calculate monthly balance for display
    # Logic:
    # If subscription is active (freeze/paid externally): Balance = 0 (Paid)
    # If invoices exist: Balance = Total Paid - Total Invoiced
    # If no invoices but paid: Balance = Total Paid - Monthly Fee
    # If no invoices and not paid: Balance = 0 (or -Monthly Fee if we want to show debt immediately?)
    # Currently: No Invoice -> 0 Balance (Grey)

    if is_subscription_active:
        monthly_balance = 0.0
        balance_color = "green"
        is_paid = True
    elif total_invoiced > 0:
        # We have pending invoices. Balance is what we paid minus what was asked.
        # Example: Invoiced 1200, Paid 500 -> Balance -700.
        # Example: Invoiced 1200, Paid 1200 -> Balance 0.
        monthly_balance = total_paid - total_invoiced
        
        if monthly_balance >= 0:
            balance_color = "green"
            is_paid = True
        else:
            balance_color = "red"
            is_paid = False
    elif total_paid > 0:
        # No pending invoice, but payment made.
        # Assume standard fee applies.
        # Example: Paid 1200. Fee 1200. Balance 0.
        # Example: Paid 1100. Fee 1200. Balance -100.
        monthly_balance = total_paid - monthly_fee
        
        if monthly_balance >= -1: # Tolerance for float logic
            balance_color = "green"
            is_paid = True
        else:
            balance_color = "red"
            is_paid = False
    else:
        # No invoice, no payment.
        monthly_balance = 0.0
        balance_color = "grey"
        is_paid = False
    
    return {
        "monthly_balance": monthly_balance,
        "is_paid_this_month": is_paid,
        "monthly_fee": monthly_fee,
        "group_fee": group_fee,
        "individual_fee": individual_fee,
        "fee_discount_reason": student.fee_discount_reason,
        "target_month": f"{month_names_ru.get(target_month, '')} {target_year}",
        "balance_color": balance_color,
        "past_debts": past_debts  # New field
    }


@router.get("/", response_model=StudentPagination)
async def get_students(
    skip: int = 0,
    limit: int = 100,
    status: Optional[str] = None,
    search: Optional[str] = None,
    group_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> dict:
    """
    📋 Получить список всех студентов с пагинацией и фильтрацией.
    Доступ: Admin, Coach, Owner.
    """
    if current_user.role.lower() not in ['super_admin', 'admin', 'owner', 'coach']:
         raise HTTPException(status_code=403, detail="Not authorized")

    query = db.query(Student).options(
        joinedload(Student.group),
        joinedload(Student.guardians).joinedload(StudentGuardian.user),
        joinedload(Student.achievements)
    )

    if status:
        query = query.filter(Student.status == status)
    
    if group_id:
        query = query.filter(Student.group_id == group_id)

    if search:
        search_term = f"%{search}%"
        query = query.filter(
            or_(
                Student.first_name.ilike(search_term),
                Student.last_name.ilike(search_term),
                Student.parent_phone.ilike(search_term)
            )
        )
    
    # Order by name
    query = query.order_by(Student.last_name, Student.first_name)

    total = query.count()
    students = query.offset(skip).limit(limit).all()

    # Calculate attendance for current month
    today = date.today()
    current_month = today.month
    current_year = today.year
    
    attendance_counts = db.query(
        Attendance.student_id, 
        func.count(Attendance.id)
    ).join(Event).filter(
        func.extract('month', Event.start_time) == current_month,
        func.extract('year', Event.start_time) == current_year,
        Attendance.status == 'present',
        Attendance.student_id.in_([s.id for s in students])
    ).group_by(Attendance.student_id).all()
    
    attendance_map = {student_id: count for student_id, count in attendance_counts}

    result = []
    for s in students:
        balance_info = calculate_monthly_balance(s, db)
        
        # Prepare response object based on schema
        # We need to manually construct dict to match Pydantic model structure if using ORM mode is tricky with computed fields
        # But since we use response_model=StudentPagination, FastAPI will validate it.
        # We just need to ensure keys match.
        
        student_dict = {
            "id": s.id,
            "first_name": s.first_name,
            "last_name": s.last_name,
            "dob": s.dob,
            "parent_phone": s.parent_phone,
            "group_id": s.group_id,
            "avatar_url": s.avatar_url,
            "status": s.status,
            "medical_info": s.medical_info,
            "medical_notes": s.medical_notes,
            "medical_certificate_expires": s.medical_certificate_expires,
            "blood_type": s.blood_type,
            "allergies": s.allergies,
            "emergency_contact": s.emergency_contact,
            "emergency_phone": s.emergency_phone,
            "insurance_number": s.insurance_number,
            "height": s.height,
            "weight": s.weight,
            "position": s.position,
            "dominant_foot": s.dominant_foot,
            "tshirt_size": s.tshirt_size,
            "notes": s.notes,
            "subscription_expires": s.subscription_expires,
            "balance": s.balance,
            "is_debtor": s.is_debtor,
            "is_frozen": s.is_frozen,
            "freeze_until": s.freeze_until,
            "individual_fee": s.individual_fee,
            "fee_discount_reason": s.fee_discount_reason,
            "stars": s.stars,
            "attendance_streak": s.attendance_streak,
            "attended_classes": attendance_map.get(s.id, 0),
            
            # Computed fields
            "monthly_balance": balance_info["monthly_balance"],
            "is_paid_this_month": balance_info["is_paid_this_month"],
            "monthly_fee": balance_info["monthly_fee"],
            "target_month": balance_info["target_month"],
            "balance_color": balance_info["balance_color"],
            "past_debts": balance_info.get("past_debts", []),
            
            # Relationships
            "group": s.group,
            "achievements": s.achievements,
            "guardian_ids": [g.user_id for g in s.guardians],
            "guardians": [
                {
                    "id": g.id,
                    "user_id": g.user_id,
                    "full_name": g.user.full_name if g.user else None,
                    "phone": g.user.phone if g.user else None,
                    "relationship_type": g.relationship_type
                } for g in s.guardians
            ]
        }
        result.append(student_dict)

    return {
        "data": result,
        "total": total,
        "skip": skip,
        "limit": limit,
        "pages": (total + limit - 1) // limit if limit > 0 else 0
    }


# ==================== INDIVIDUAL FEE MANAGEMENT ====================
@router.put("/{student_id}/individual-fee")
async def set_individual_fee(
    student_id: int,
    individual_fee: Optional[float] = None,
    fee_discount_reason: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> dict:
    """
    💰 Установить индивидуальную сумму абонемента для ученика (скидка).
    
    Доступ: только super_admin и admin
    
    Параметры:
    - individual_fee: Индивидуальная сумма (если null - используется стандарт группы)
    - fee_discount_reason: Причина скидки (многодетная семья, спонсор, соц помощь и т.д.)
    
    Примеры:
    - Стандартная оплата: individual_fee=null (используется цена группы 1200 лей)
    - Скидка 50%: individual_fee=600, reason="Многодетная семья"
    - Бесплатно: individual_fee=0, reason="Спонсорский ученик"
    """
    # Проверка прав доступа
    if current_user.role.lower() not in ["super_admin", "admin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Только администраторы могут устанавливать индивидуальную оплату"
        )
    
    # Поиск ученика
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Ученик не найден")
    
    # Сохраняем старые значения
    old_data = entity_to_dict(student)
    old_fee = student.individual_fee
    old_reason = student.fee_discount_reason
    
    # Обновляем
    student.individual_fee = individual_fee
    student.fee_discount_reason = fee_discount_reason
    db.commit()
    db.refresh(student)

    # Log update
    log_update(db, "student", student, old_data, user=current_user)
    
    # Получаем новый баланс
    balance_info = calculate_monthly_balance(student, db)
    
    return {
        "message": "Индивидуальная оплата обновлена",
        "student_id": student.id,
        "student_name": f"{student.first_name} {student.last_name}",
        "old_individual_fee": old_fee,
        "new_individual_fee": individual_fee,
        "old_reason": old_reason,
        "new_reason": fee_discount_reason,
        "group_fee": balance_info["group_fee"],
        "effective_fee": balance_info["monthly_fee"],
        "monthly_balance": balance_info["monthly_balance"],
        "balance_color": balance_info["balance_color"],
        "past_debts": balance_info.get("past_debts", [])
    }


@router.post("/{student_id}/avatar")
async def upload_student_avatar(
    student_id: int,
    avatar: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> dict:
    """
    Upload student avatar.
    """
    if current_user.role.lower() not in ["super_admin", "admin", "coach", "owner"]:
        # Check if parent of this student
        guardian = db.query(StudentGuardian).filter(
            StudentGuardian.student_id == student_id,
            StudentGuardian.user_id == current_user.id
        ).first()
        if not guardian:
            raise HTTPException(status_code=403, detail="Not authorized")

    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    # Validate file type
    allowed_types = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/jpg", "image/pjpeg"]
    if avatar.content_type not in allowed_types:
        # Check if we can allow based on filename extension as fallback
        mime_type, _ = mimetypes.guess_type(avatar.filename)
        if mime_type not in allowed_types:
             # Just in case mimetypes returns something else or None
             # Allow if extension is explicitly standard image
             ext = os.path.splitext(avatar.filename)[1].lower()
             if ext not in ['.jpg', '.jpeg', '.png', '.gif', '.webp']:
                 raise HTTPException(status_code=400, detail=f"Invalid file type. Allowed: {', '.join(allowed_types)}")

    # Save file
    upload_dir = Path("uploads/avatars")
    upload_dir.mkdir(parents=True, exist_ok=True)
    
    file_ext = os.path.splitext(avatar.filename)[1]
    if not file_ext:
        file_ext = mimetypes.guess_extension(avatar.content_type) or ""
        
    unique_filename = f"student_{student_id}_{uuid.uuid4()}{file_ext}"
    file_path = upload_dir / unique_filename
    
    try:
        with file_path.open("wb") as buffer:
            shutil.copyfileobj(avatar.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save file: {str(e)}")
    
    # Update student record
    old_data = entity_to_dict(student)
    avatar_url = f"/uploads/avatars/{unique_filename}"
    student.avatar_url = avatar_url
    
    # Log update
    log_update(db, "student", student, old_data, user=current_user)
    
    db.commit()
    
    return {"avatar_url": avatar_url}


@router.delete("/{student_id}/avatar")
async def delete_student_avatar(
    student_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> dict:
    """
    Delete student avatar.
    """
    if current_user.role.lower() not in ["super_admin", "admin", "coach", "owner"]:
        # Check if parent of this student
        guardian = db.query(StudentGuardian).filter(
            StudentGuardian.student_id == student_id,
            StudentGuardian.user_id == current_user.id
        ).first()
        if not guardian:
            raise HTTPException(status_code=403, detail="Not authorized")

    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    if student.avatar_url:
        # Try to delete file
        try:
            file_path = student.avatar_url.lstrip("/")
            if os.path.exists(file_path):
                os.remove(file_path)
        except Exception as e:
            print(f"Error deleting avatar file: {e}")
            
        old_data = entity_to_dict(student)
        student.avatar_url = None
        
        # Log update
        log_update(db, "student", student, old_data, user=current_user)
        
        db.commit()

    return {"message": "Avatar deleted"}


@router.delete("/orphan/cleanup")
async def delete_orphaned_students(
    dry_run: bool = Query(True, description="Если True, только покажет список на удаление"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> dict:
    """
    🗑️ Удалить учеников без родителей (сирот).
    Доступ: Super Admin, Owner.
    """
    if current_user.role.lower() not in ["super_admin", "owner"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Find orphans (active students with no guardians)
    orphans = db.query(Student).outerjoin(StudentGuardian).filter(
        StudentGuardian.id == None,
        Student.deleted_at == None,
        Student.status != "archived"
    ).all()
    
    if not orphans:
        return {"message": "No orphans found", "count": 0, "students": []}
        
    result_list = [{"id": s.id, "name": f"{s.last_name} {s.first_name}"} for s in orphans]
    
    if dry_run:
        return {
            "message": "Dry run completed. Set dry_run=false to execute.",
            "count": len(orphans),
            "students_to_delete": result_list
        }
    
    # Execute deletion
    count = 0
    for student in orphans:
        student.deleted_at = now_naive()
        student.deleted_by_id = current_user.id
        student.status = "archived"
        student.deletion_reason = "Orphan cleanup (API)"
        log_delete(db, "student", student.id, {"name": f"{student.first_name} {student.last_name}", "reason": "Orphan cleanup"}, user=current_user)
        count += 1
        
    db.commit()
    
    return {
        "message": f"Successfully archived {count} orphaned students",
        "count": count,
        "deleted_students": result_list
    }

@router.get("/{student_id}", response_model=StudentResponse)
async def get_student(
    student_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> dict:
    """
    👤 Получить профиль ученика.
    Доступ: Admin, Coach, Owner, Parent (своего ребенка).
    """
    student = db.query(Student).options(
        joinedload(Student.group),
        joinedload(Student.guardians).joinedload(StudentGuardian.user),
        joinedload(Student.achievements)
    ).filter(Student.id == student_id).first()

    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    # Check permissions
    if current_user.role.lower() == 'parent':
        is_guardian = any(g.user_id == current_user.id for g in student.guardians)
        if not is_guardian:
             raise HTTPException(status_code=403, detail="Not authorized")
    elif current_user.role.lower() not in ['super_admin', 'admin', 'owner', 'coach']:
         raise HTTPException(status_code=403, detail="Not authorized")

    balance_info = calculate_monthly_balance(student, db)
    
    # Construct response dict manually to include computed fields
    student_dict = {
        "id": student.id,
        "first_name": student.first_name,
        "last_name": student.last_name,
        "dob": student.dob,
        "parent_phone": student.parent_phone,
        "group_id": student.group_id,
        "avatar_url": student.avatar_url,
        "status": student.status,
        "medical_info": student.medical_info,
        "medical_notes": student.medical_notes,
        "medical_certificate_expires": student.medical_certificate_expires,
        "blood_type": student.blood_type,
        "allergies": student.allergies,
        "emergency_contact": student.emergency_contact,
        "emergency_phone": student.emergency_phone,
        "insurance_number": student.insurance_number,
        "height": student.height,
        "weight": student.weight,
        "position": student.position,
        "dominant_foot": student.dominant_foot,
        "tshirt_size": student.tshirt_size,
        "notes": student.notes,
        "subscription_expires": student.subscription_expires,
        "balance": student.balance,
        "is_debtor": student.is_debtor,
        "is_frozen": student.is_frozen,
        "freeze_until": student.freeze_until,
        "individual_fee": student.individual_fee,
        "fee_discount_reason": student.fee_discount_reason,
        "stars": student.stars,
        "attendance_streak": student.attendance_streak,
        
        # Computed fields
        "monthly_balance": balance_info["monthly_balance"],
        "is_paid_this_month": balance_info["is_paid_this_month"],
        "monthly_fee": balance_info["monthly_fee"],
        "target_month": balance_info["target_month"],
        "balance_color": balance_info["balance_color"],
        "past_debts": balance_info.get("past_debts", []),
        
        # Relationships
        "group": student.group,
        "achievements": student.achievements,
        "guardian_ids": [g.user_id for g in student.guardians]
    }
    
    return student_dict


@router.put("/{student_id}", response_model=StudentResponse)
async def update_student(
    student_id: int,
    student_update: StudentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> dict:
    """
    ✏️ Обновить данные ученика.
    Доступ: Super Admin, Admin, Owner, Coach.
    """
    if current_user.role.lower() not in ["super_admin", "admin", "owner", "coach"]:
         raise HTTPException(status_code=403, detail="Not authorized")
    
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
        
    old_data = entity_to_dict(student)
    
    update_data = student_update.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(student, key, value)
        
    # Log update
    log_update(db, "student", student, old_data, user=current_user)
    
    db.commit()
    db.refresh(student)
    
    # Recalculate balance info for response
    balance_info = calculate_monthly_balance(student, db)
    
    # Construct response dict manually to include computed fields
    student_dict = {
        "id": student.id,
        "first_name": student.first_name,
        "last_name": student.last_name,
        "dob": student.dob,
        "parent_phone": student.parent_phone,
        "group_id": student.group_id,
        "avatar_url": student.avatar_url,
        "status": student.status,
        "medical_info": student.medical_info,
        "medical_notes": student.medical_notes,
        "medical_certificate_expires": student.medical_certificate_expires,
        "blood_type": student.blood_type,
        "allergies": student.allergies,
        "emergency_contact": student.emergency_contact,
        "emergency_phone": student.emergency_phone,
        "insurance_number": student.insurance_number,
        "height": student.height,
        "weight": student.weight,
        "position": student.position,
        "dominant_foot": student.dominant_foot,
        "tshirt_size": student.tshirt_size,
        "notes": student.notes,
        "subscription_expires": student.subscription_expires,
        "balance": student.balance,
        "is_debtor": student.is_debtor,
        "is_frozen": student.is_frozen,
        "freeze_until": student.freeze_until,
        "individual_fee": student.individual_fee,
        "fee_discount_reason": student.fee_discount_reason,
        "stars": student.stars,
        "attendance_streak": student.attendance_streak,
        
        # Computed fields
        "monthly_balance": balance_info["monthly_balance"],
        "is_paid_this_month": balance_info["is_paid_this_month"],
        "monthly_fee": balance_info["monthly_fee"],
        "target_month": balance_info["target_month"],
        "balance_color": balance_info["balance_color"],
        "past_debts": balance_info.get("past_debts", []),
        
        # Relationships
        "group": student.group,
        "achievements": student.achievements,
        "guardian_ids": [g.user_id for g in student.guardians]
    }
    
    return student_dict

@router.delete("/{student_id}")
async def delete_student(
    student_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> dict:
    """
    🗑️ Удалить (архивировать) студента.
    Доступ: Admin, Super Admin.
    """
    if current_user.role.lower() not in ["super_admin", "admin", "owner"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    # Soft delete
    student.deleted_at = now_naive()
    student.deleted_by_id = current_user.id
    student.status = "archived"
    
    # Log deletion
    log_delete(db, "student", student.id, entity_to_dict(student), user=current_user)
    
    db.commit()
    
    return {"message": "Student archived"}


@router.get("/my", response_model=StudentPagination)
async def get_my_students(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> dict:
    """
    👨‍👩‍👧 Получить список детей текущего родителя.
    Эндпоинт для мобильного приложения.
    """
    # Найти детей через StudentGuardian
    guardian_relations = db.query(StudentGuardian).filter(
        StudentGuardian.user_id == current_user.id
    ).all()
    student_ids = [rel.student_id for rel in guardian_relations]
    
    if not student_ids:
        return {"data": [], "total": 0, "skip": 0, "limit": 100, "pages": 0}
    
    students = db.query(Student).options(
        joinedload(Student.group).joinedload(Group.coach),
        joinedload(Student.guardians).joinedload(StudentGuardian.user),
        joinedload(Student.payments),  # Eager load payments to avoid N+1 in balance calc
        joinedload(Student.achievements), # Eager load achievements
        joinedload(Student.freeze_requests) # Eager load freeze requests
    ).filter(Student.id.in_(student_ids)).all()

    # Calculate attendance counts
    attendance_data = db.query(
        Attendance.student_id,
        func.count(Attendance.id).label('count')
    ).filter(
        Attendance.student_id.in_(student_ids),
        Attendance.status == AttendanceStatus.PRESENT
    ).group_by(Attendance.student_id).all()
    
    attendance_counts = {row.student_id: row.count for row in attendance_data}
    
    result = []
    for student in students:
        balance_info = calculate_monthly_balance(student, db)
        attended_classes = attendance_counts.get(student.id, 0)
        
        # Active Freeze Info
        active_freeze_data = None
        if student.status == 'frozen' or student.is_frozen:
            active_freeze = db.query(FreezeRequest).filter(
                FreezeRequest.student_id == student.id,
                FreezeRequest.status == 'approved',
                FreezeRequest.end_date >= date.today()
            ).order_by(FreezeRequest.end_date.desc()).first()
            
            if active_freeze:
                active_freeze_data = {
                    "start_date": active_freeze.start_date,
                    "end_date": active_freeze.end_date,
                    "reason": active_freeze.reason
                }

        result.append({
            "id": student.id,
            "first_name": student.first_name,
            "last_name": student.last_name,
            "full_name": f"{student.first_name} {student.last_name}",
            "dob": str(student.dob) if student.dob else None,
            "parent_phone": student.parent_phone,
            "group_id": student.group_id,
            "group_name": student.group.name if student.group else None,
            "coach": {
                "id": student.group.coach.id,
                "full_name": student.group.coach.full_name
            } if student.group and student.group.coach else None,
            "status": student.status,
            "avatar_url": student.avatar_url,
            "notes": student.notes,
            "medical_info": student.medical_info,
            "allergies": student.allergies,
            "medical_certificate_expires": str(student.medical_certificate_expires) if student.medical_certificate_expires else None,
            "active_freeze": active_freeze_data,
            "attended_classes": attended_classes,
            "monthly_balance": balance_info["monthly_balance"],
            "balance_color": balance_info["balance_color"],
            "is_paid_this_month": balance_info["is_paid_this_month"],
            "monthly_fee": balance_info["monthly_fee"],
            "individual_fee": balance_info["individual_fee"],
            "guardians": [
                {
                    "id": g.id,
                    "user_id": g.user_id,
                    "full_name": g.user.full_name if g.user else None,
                    "phone": g.user.phone if g.user else None,
                    "relationship_type": g.relationship_type
                } for g in student.guardians
            ],
            "achievements": [
                {
                    "id": a.id,
                    "title": a.title,
                    "description": a.description,
                    "icon": a.icon,
                    "type": a.type,
                    "created_at": str(a.created_at)
                } for a in student.achievements
            ]
        })
    
    return {"data": result, "total": len(result), "skip": 0, "limit": 100, "pages": 1}


@router.get("/{student_id}/fee-info")
async def get_student_fee_info(
    student_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> dict:
    """
    💰 Получить информацию об оплате ученика.
    
    Возвращает:
    - Стандартную сумму группы
    - Индивидуальную сумму (если есть)
    - Причину скидки
    - Фактическую сумму к оплате
    - Размер скидки
    """
    student = db.query(Student).options(joinedload(Student.group)).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Ученик не найден")
    
    # Суммы
    group_fee = student.group.monthly_fee if student.group else 0.0
    individual_fee = student.individual_fee
    effective_fee = individual_fee if individual_fee is not None else group_fee
    
    # Расчёт скидки
    discount_amount = 0.0
    discount_percent = 0.0
    if individual_fee is not None and group_fee > 0:
        discount_amount = group_fee - individual_fee
        discount_percent = (discount_amount / group_fee) * 100
    
    balance_info = calculate_monthly_balance(student, db)
    
    return {
        "student_id": student.id,
        "student_name": f"{student.first_name} {student.last_name}",
        "group_name": student.group.name if student.group else None,
        "group_fee": group_fee,
        "individual_fee": individual_fee,
        "fee_discount_reason": student.fee_discount_reason,
        "effective_fee": effective_fee,
        "discount_amount": discount_amount,
        "discount_percent": round(discount_percent, 1),
        "has_discount": individual_fee is not None,
        "monthly_balance": balance_info["monthly_balance"],
        "is_paid_this_month": balance_info["is_paid_this_month"],
        "target_month": balance_info["target_month"],
        "balance_color": balance_info["balance_color"]
    }

@router.post("/{student_id}/transfer")
async def transfer_student(
    *,
    db: Session = Depends(get_db),
    student_id: int,
    new_group_id: int,
    current_user: User = Depends(get_current_user)
) -> dict:
    """
    Transfer student to another group and log history (admin only).
    Uses transaction to ensure data consistency.
    """
    if current_user.role.lower() not in ["super_admin", "admin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough permissions"
        )
    
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Student not found"
        )
    
    # Check if new group exists
    new_group = db.query(Group).filter(Group.id == new_group_id).first()
    if not new_group:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Group not found"
        )
    
    # TRANSACTION: Ensure both history log and group update succeed or fail together
    try:
        old_group_id = student.group_id
        old_group_name = None
        
        # Log current group to history if exists
        if old_group_id:
            old_group = db.query(Group).filter(Group.id == old_group_id).first()
            old_group_name = old_group.name if old_group else "Unknown"
            
            history = StudentGroupHistory(
                student_id=student.id,
                group_id=old_group_id,
                left_at=date.today()
            )
            db.add(history)
        
        # Update student group
        old_data = entity_to_dict(student)
        student.group_id = new_group_id
        
        # Log update
        log_update(db, "student", student, old_data, user=current_user)
        
        # Commit transaction
        db.commit()
        
        return {
            "message": f"Student transferred to group {new_group.name}",
            "old_group": old_group_name,
            "new_group": new_group.name
        }
        
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error transferring student: {str(e)}"
        )

@router.get("/{student_id}/history")
async def get_student_history(
    student_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> List[dict]:
    """
    Get student group history.
    """
    # Permissions check (same as get_student)
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
        
    # Check permissions logic (simplified for brevity, reuse from get_student)
    # ...
    
    history = db.query(StudentGroupHistory).options(joinedload(StudentGroupHistory.group))\
        .filter(StudentGroupHistory.student_id == student_id)\
        .order_by(StudentGroupHistory.joined_at.desc()).all()
        
    return [
        {
            "group_name": h.group.name if h.group else "Unknown",
            "joined_at": h.joined_at,
            "left_at": h.left_at
        }
        for h in history
    ]

@router.get("/{student_id}/subscription-status")
async def get_subscription_status(
    student_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> dict:
    """
    Get student subscription payment status for current/next month.
    Payment period: 25th-31st of current month for next month.
    
    Returns:
    - is_paid: bool - True if subscription for target month is paid
    - target_month: str - Month name for which payment is due (e.g., "Февраль 2026")
    - payment_period: str - When payment should be made ("25-31 Января")
    - days_until_due: int - Days until payment period starts (negative if overdue)
    - show_reminder: bool - True if today is 25th+ and not yet paid
    - status_text: str - Human-readable status
    - status_color: str - "green", "yellow", "red"
    """
    from datetime import datetime
    from calendar import month_name
    
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    
    # Permission check
    if current_user.role.lower() == 'parent':
        guardian = db.query(StudentGuardian).filter(
            StudentGuardian.student_id == student_id,
            StudentGuardian.user_id == current_user.id
        ).first()
        if not guardian:
            raise HTTPException(status_code=403, detail="Not authorized")
    
    today = date.today()
    current_day = today.day
    current_month = today.month
    current_year = today.year
    
    # Russian month names
    month_names_ru = {
        1: "Январь", 2: "Февраль", 3: "Март", 4: "Апрель",
        5: "Май", 6: "Июнь", 7: "Июль", 8: "Август",
        9: "Сентябрь", 10: "Октябрь", 11: "Ноябрь", 12: "Декабрь"
    }
    month_names_gen_ru = {
        1: "Января", 2: "Февраля", 3: "Марта", 4: "Апреля",
        5: "Мая", 6: "Июня", 7: "Июля", 8: "Августа",
        9: "Сентября", 10: "Октября", 11: "Ноября", 12: "Декабря"
    }
    
    # Determine target month (what we're paying for)
    # If today is 1-24: target = current month (should have been paid last month 25-31)
    # If today is 25-31: target = next month
    if current_day >= 25:
        # Payment period active: paying for NEXT month
        if current_month == 12:
            target_month = 1
            target_year = current_year + 1
        else:
            target_month = current_month + 1
            target_year = current_year
        payment_period_month = current_month
        payment_period_year = current_year
        days_until_due = 0  # Already in payment period
    else:
        # Not in payment period: should have paid for CURRENT month
        target_month = current_month
        target_year = current_year
        # Previous month was the payment period
        if current_month == 1:
            payment_period_month = 12
            payment_period_year = current_year - 1
        else:
            payment_period_month = current_month - 1
            payment_period_year = current_year
        days_until_due = 25 - current_day  # Days until next payment period
    
    # Create target date (first day of target month)
    target_date = date(target_year, target_month, 1)
    
    # Check if payment exists for target month
    payment = db.query(Payment).filter(
        Payment.student_id == student_id,
        Payment.status == 'completed',
        func.extract('month', Payment.payment_period) == target_month,
        func.extract('year', Payment.payment_period) == target_year
    ).first()
    
    is_paid = payment is not None

    # --- FREEZE CHECK ---
    # Если абонемент истекает ПОЗЖЕ чем начало следующего месяца -> значит оплачено (продлено)
    if not is_paid and student.subscription_expires:
         if student.subscription_expires >= target_date:
             is_paid = True
    
    # Determine status
    if is_paid:
        status_text = f"✅ Абонемент оплачен за {month_names_ru[target_month]}"
        status_color = "green"
        show_reminder = False
    elif current_day >= 25:
        # In payment period but not paid
        status_text = f"⏰ Оплатите абонемент за {month_names_ru[target_month]} (до 31 {month_names_gen_ru[current_month]})"
        status_color = "yellow"
        show_reminder = True
    else:
        # Past payment deadline
        status_text = f"❌ Долг за {month_names_ru[target_month]} {target_year}"
        status_color = "red"
        show_reminder = True
    
    return {
        "is_paid": is_paid,
        "target_month": f"{month_names_ru[target_month]} {target_year}",
        "target_month_number": target_month,
        "target_year": target_year,
        "payment_period": f"25-31 {month_names_gen_ru[payment_period_month]} {payment_period_year}",
        "days_until_due": days_until_due,
        "show_reminder": show_reminder,
        "status_text": status_text,
        "status_color": status_color,
        "subscription_expires": str(student.subscription_expires) if student.subscription_expires else None,
        "balance": student.balance or 0
    }

@router.get("/{student_id}/pending-invoices", response_model=StudentPendingInvoicesResponse)
async def get_student_pending_invoices(
    student_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> StudentPendingInvoicesResponse:
    """
    💰 Получить неоплаченные счета (pending invoices) для ученика.
    Включает детализацию по позициям (invoice_items).
    """
    # Проверка прав (родитель, админ, тренер)
    if current_user.role.lower() == 'parent':
        guardian = db.query(StudentGuardian).filter(
            StudentGuardian.student_id == student_id,
            StudentGuardian.user_id == current_user.id
        ).first()
        if not guardian:
            raise HTTPException(status_code=403, detail="Not authorized")
    elif current_user.role.lower() not in ['super_admin', 'admin', 'owner', 'coach']:
        raise HTTPException(status_code=403, detail="Not authorized")

    invoices = db.query(Payment).options(
        selectinload(Payment.invoice_items),
        joinedload(Payment.student)
    ).filter(
        Payment.student_id == student_id,
        Payment.status == "pending",
        Payment.deleted_at.is_(None)
    ).order_by(Payment.payment_period.desc()).all()
    
    total_amount = sum(inv.amount for inv in invoices)
    
    return {
        "invoices": invoices,
        "total_amount": total_amount
    }


# ==================== FREEZE REQUEST ENDPOINTS ====================

@router.post("/{student_id}/freeze-request")
async def create_freeze_request(
    student_id: int,
    freeze_request: FreezeRequestCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> dict:
    """
    Create a new freeze request for a student.
    
    Access: Parents (for their children), Admin, Coach, Owner.
    """
    # Check if student exists
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    
    # Check permissions
    if current_user.role.lower() == 'parent':
        guardian = db.query(StudentGuardian).filter(
            StudentGuardian.student_id == student_id,
            StudentGuardian.user_id == current_user.id
        ).first()
        if not guardian:
            raise HTTPException(status_code=403, detail="Not authorized - not a guardian of this student")
    elif current_user.role.lower() not in ['super_admin', 'admin', 'owner', 'coach']:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Check for duplicate pending requests
    existing_pending = db.query(FreezeRequest).filter(
        FreezeRequest.student_id == student_id,
        FreezeRequest.status == FreezeRequestStatus.PENDING
    ).first()
    
    if existing_pending:
        raise HTTPException(
            status_code=400, 
            detail="A freeze request is already pending for this student. Please wait for approval or contact administration."
        )

    # Validate end date (must be in the future)
    from datetime import date
    if freeze_request.end_date <= date.today():
        raise HTTPException(status_code=400, detail="End date must be in the future")
    
    # Create freeze request
    new_freeze_request = FreezeRequest(
        student_id=student_id,
        start_date=date.today(),  # Start from today
        end_date=freeze_request.end_date,
        reason=freeze_request.reason,
        file_url=freeze_request.file_url,
        requested_by_id=current_user.id,
        status=FreezeRequestStatus.PENDING
    )
    
    db.add(new_freeze_request)
    db.commit()
    db.refresh(new_freeze_request)
    
    # Send notification to admins
    try:
        from app.services.messenger import messenger_service
        
        # Get all admins
        admins = db.query(User).filter(
            User.role.in_(['super_admin', 'admin', 'owner'])
        ).all()
        
        # Send notification to each admin
        for admin in admins:
            message_text = f"📋 Новая заявка на заморозку от {student.first_name} {student.last_name} (до {freeze_request.end_date})"
            await messenger_service.notify_user(
                admin,
                message_text
            )
    except Exception as e:
        # Log error but don't fail the request
        logger.error(f"Failed to send freeze request notification: {e}")
    
    # Create notification message for the parent (current user)
    try:
        from app.models.message import Message, ChatType
        from datetime import datetime
        
        # Create notification message for the parent
        notification_message = Message(
            sender_id=current_user.id,  # Self-notification
            recipient_id=current_user.id,
            chat_type=ChatType.freeze_request,
            content=f"📋 Вы отправили заявку на заморозку для {student.first_name} {student.last_name} до {freeze_request.end_date}",
            is_read=False,
            created_at=datetime.utcnow()
        )
        
        db.add(notification_message)
        db.commit()
        
    except Exception as e:
        logger.error(f"Failed to create freeze request notification for parent: {e}")
    
    return {
        "message": "Freeze request created successfully",
        "request_id": new_freeze_request.id,
        "status": new_freeze_request.status
    }


@router.get("/{student_id}/freeze-request")
async def get_student_freeze_request(
    student_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> dict:
    """
    Get the latest freeze request for a student.
    
    Access: Parents (for their children), Admin, Coach, Owner.
    """
    # Check if student exists
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    
    # Permission check
    if current_user.role.lower() == 'parent':
        guardian = db.query(StudentGuardian).filter(
            StudentGuardian.student_id == student_id,
            StudentGuardian.user_id == current_user.id
        ).first()
        if not guardian:
            raise HTTPException(status_code=403, detail="Not authorized - not a guardian of this student")
    elif current_user.role.lower() not in ['super_admin', 'admin', 'owner', 'coach']:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Get the latest freeze request
    freeze_request = db.query(FreezeRequest).filter(
        FreezeRequest.student_id == student_id
    ).order_by(FreezeRequest.created_at.desc()).first()
    
    if not freeze_request:
        return {"message": "No freeze requests found"}
    
    return {
        "id": freeze_request.id,
        "student_id": freeze_request.student_id,
        "start_date": freeze_request.start_date,
        "end_date": freeze_request.end_date,
        "reason": freeze_request.reason,
        "file_url": freeze_request.file_url,
        "status": freeze_request.status,
        "requested_by": {
            "id": freeze_request.requested_by.id,
            "full_name": freeze_request.requested_by.full_name
        } if freeze_request.requested_by else None,
        "created_at": freeze_request.created_at
    }


@router.get("/freeze-requests/my")
async def get_my_freeze_requests(
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> dict:
    """
    Get freeze requests for the current user.
    
    For parents: returns freeze requests for their children.
    For admins/coaches: returns all freeze requests they have access to.
    """
    # Build query based on user role
    if current_user.role.lower() == 'parent':
        # Get parent's children
        children = db.query(Student).join(StudentGuardian).filter(
            StudentGuardian.user_id == current_user.id
        ).all()
        
        if not children:
            return {"requests": []}
        
        student_ids = [child.id for child in children]
        query = db.query(FreezeRequest).filter(FreezeRequest.student_id.in_(student_ids))
    else:
        # For admins and coaches, return all requests
        query = db.query(FreezeRequest)
    
    # Filter by status if provided
    if status:
        try:
            status_enum = FreezeRequestStatus(status.upper())
            query = query.filter(FreezeRequest.status == status_enum)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid status: {status}")
    
    # Get requests with student and requested_by info
    requests = query.options(
        joinedload(FreezeRequest.student),
        joinedload(FreezeRequest.requested_by)
    ).order_by(FreezeRequest.created_at.desc()).all()
    
    return {
        "requests": [
            {
                "id": req.id,
                "student_id": req.student_id,
                "student_name": f"{req.student.first_name} {req.student.last_name}" if req.student else None,
                "start_date": req.start_date,
                "end_date": req.end_date,
                "reason": req.reason,
                "file_url": req.file_url,
                "status": req.status,
                "requested_by": {
                    "id": req.requested_by.id,
                    "full_name": req.requested_by.full_name
                } if req.requested_by else None,
                "created_at": req.created_at
            }
            for req in requests
        ]
    }


@router.post("/{student_id}/approve-freeze/{request_id}")
async def approve_freeze_request(
    student_id: int,
    request_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> dict:
    """
    Approve a freeze request.
    
    Access: Admin, Coach, Owner only.
    """
    # Check permissions
    if current_user.role.lower() not in ['super_admin', 'admin', 'owner', 'coach']:
        raise HTTPException(status_code=403, detail="Not authorized to approve freeze requests")
    
    # Get the freeze request
    freeze_request = db.query(FreezeRequest).filter(
        FreezeRequest.id == request_id,
        FreezeRequest.student_id == student_id
    ).first()
    
    if not freeze_request:
        raise HTTPException(status_code=404, detail="Freeze request not found")
    
    if freeze_request.status != FreezeRequestStatus.PENDING:
        raise HTTPException(status_code=400, detail="Freeze request is not pending")
    
    # Update status
    freeze_request.status = FreezeRequestStatus.APPROVED
    freeze_request.approved_by_id = current_user.id
    freeze_request.approved_at = get_now()
    
    # Update student status and subscription
    student = db.query(Student).filter(Student.id == student_id).first()
    if student:
        student.is_frozen = True
        student.status = "frozen"
        student.freeze_until = freeze_request.end_date
        
        # Extend subscription if active
        if student.subscription_expires:
            # Calculate freeze duration
            days = (freeze_request.end_date - freeze_request.start_date).days
            if days > 0 and student.subscription_expires >= date.today():
                student.subscription_expires += timedelta(days=days)
    
    db.commit()
    db.refresh(freeze_request)
    
    # Send notification to the requester
    try:
        from app.services.messenger import messenger_service
        
        message_text = f"✅ Ваша заявка на заморозку для {freeze_request.student.first_name} {freeze_request.student.last_name} одобрена."
        messenger_service.send_message(
            sender_id=current_user.id,
            receiver_id=freeze_request.requested_by_id,
            content=message_text,
            message_type='freeze_request_approved',
            related_id=freeze_request.id
        )
    except Exception as e:
        logger.error(f"Failed to send freeze request approval notification: {e}")
    
    return {
        "message": "Freeze request approved successfully",
        "request_id": freeze_request.id,
        "status": freeze_request.status
    }


@router.delete("/{student_id}/freeze-request/{request_id}")
async def delete_freeze_request(
    student_id: int,
    request_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Delete a freeze request.
    
    Access:
    - Admin/Coach/Owner: Can delete any request.
    - Parent: Can delete only their OWN PENDING request.
    """
    # Get request
    request = db.query(FreezeRequest).filter(
        FreezeRequest.id == request_id,
        FreezeRequest.student_id == student_id
    ).first()
    
    if not request:
        raise HTTPException(status_code=404, detail="Freeze request not found")
        
    # Check permissions
    is_admin = current_user.role.lower() in ['super_admin', 'admin', 'owner', 'coach']
    is_owner = request.requested_by_id == current_user.id
    
    if not is_admin and not is_owner:
        raise HTTPException(status_code=403, detail="Not authorized")
        
    # Parents can only delete pending requests
    if not is_admin and request.status != FreezeRequestStatus.PENDING:
        raise HTTPException(status_code=400, detail="Cannot delete processed request")
        
    # Delete
    db.delete(request)
    db.commit()
    
    return {"message": "Freeze request deleted successfully"}



@router.post("/{student_id}/reject-freeze/{request_id}")
async def reject_freeze_request(
    student_id: int,
    request_id: int,
    reason: str = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> dict:
    """
    Reject a freeze request.
    
    Access: Admin, Coach, Owner only.
    """
    # Check permissions
    if current_user.role.lower() not in ['super_admin', 'admin', 'owner', 'coach']:
        raise HTTPException(status_code=403, detail="Not authorized to reject freeze requests")
    
    # Get the freeze request
    freeze_request = db.query(FreezeRequest).filter(
        FreezeRequest.id == request_id,
        FreezeRequest.student_id == student_id
    ).first()
    
    if not freeze_request:
        raise HTTPException(status_code=404, detail="Freeze request not found")
    
    if freeze_request.status != FreezeRequestStatus.PENDING:
        raise HTTPException(status_code=400, detail="Freeze request is not pending")
    
    # Update status
    freeze_request.status = FreezeRequestStatus.REJECTED
    freeze_request.rejected_by_id = current_user.id
    freeze_request.rejected_at = get_now()
    freeze_request.rejection_reason = reason
    
    db.commit()
    db.refresh(freeze_request)
    
    # Send notification to the requester
    try:
        from app.services.messenger import messenger_service
        
        message_text = f"❌ Ваша заявка на заморозку для {freeze_request.student.first_name} {freeze_request.student.last_name} отклонена."
        if reason:
            message_text += f" Причина: {reason}"
        
        messenger_service.send_message(
            sender_id=current_user.id,
            receiver_id=freeze_request.requested_by_id,
            content=message_text,
            message_type='freeze_request_rejected',
            related_id=freeze_request.id
        )
    except Exception as e:
        logger.error(f"Failed to send freeze request rejection notification: {e}")
    
    return {
        "message": "Freeze request rejected successfully",
        "request_id": freeze_request.id,
        "status": freeze_request.status
    }


@router.post("/{student_id}/unfreeze")
async def unfreeze_student(
    student_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> dict:
    """
    Unfreeze a student (end their freeze period early).
    
    Access: Admin, Coach, Owner only.
    """
    # Check permissions
    if current_user.role.lower() not in ['super_admin', 'admin', 'owner', 'coach']:
        raise HTTPException(status_code=403, detail="Not authorized to unfreeze students")
    
    # Get the latest approved freeze request
    freeze_request = db.query(FreezeRequest).filter(
        FreezeRequest.student_id == student_id,
        FreezeRequest.status == FreezeRequestStatus.APPROVED,
        FreezeRequest.end_date >= date.today()
    ).order_by(FreezeRequest.created_at.desc()).first()
    
    if not freeze_request:
        raise HTTPException(status_code=404, detail="No active freeze request found")
    
    # Update freeze request to end today
    freeze_request.end_date = date.today()
    freeze_request.status = FreezeRequestStatus.COMPLETED
    
    db.commit()
    db.refresh(freeze_request)
    
    # Send notification to the requester
    try:
        from app.services.messenger import messenger_service
        
        message_text = f"🔓 {freeze_request.student.first_name} {freeze_request.student.last_name} разморожен досрочно."
        messenger_service.send_message(
            sender_id=current_user.id,
            receiver_id=freeze_request.requested_by_id,
            content=message_text,
            message_type='student_unfrozen',
            related_id=freeze_request.id
        )
    except Exception as e:
        logger.error(f"Failed to send student unfrozen notification: {e}")
    
    return {
        "message": "Student unfrozen successfully",
        "request_id": freeze_request.id,
        "end_date": freeze_request.end_date
    }


@router.patch("/freeze-requests/{request_id}/file")
async def update_freeze_request_file(
    request_id: int,
    file_update: FreezeRequestFileUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> dict:
    """
    Update the file URL for a freeze request.
    
    Access: Admin, Coach, Owner only.
    """
    # Check permissions
    if current_user.role.lower() not in ['super_admin', 'admin', 'owner', 'coach']:
        raise HTTPException(status_code=403, detail="Not authorized to update freeze request files")
    
    # Get the freeze request
    freeze_request = db.query(FreezeRequest).filter(
        FreezeRequest.id == request_id
    ).first()
    
    if not freeze_request:
        raise HTTPException(status_code=404, detail="Freeze request not found")
    
    # Update the file URL
    freeze_request.file_url = file_update.file_url
    
    db.commit()
    db.refresh(freeze_request)
    
    return {
        "message": "Freeze request file updated successfully",
        "request_id": freeze_request.id,
        "file_url": freeze_request.file_url
    }
