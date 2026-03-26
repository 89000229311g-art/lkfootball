from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query, BackgroundTasks, UploadFile, File, Form
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, extract, and_, or_
from datetime import date, datetime
from dateutil.relativedelta import relativedelta
from pathlib import Path
import shutil
import uuid
import logging

logger = logging.getLogger(__name__)

from app.core.deps import get_db, get_current_user
from app.core.timezone import now_naive, today as get_today, now as get_now  # Moldova timezone
from app.core.audit_service import log_create, log_update, log_delete, entity_to_dict
from app.core.localization import get_month_name_ru
from app.models import User, Payment, Student, StudentGuardian, Group, Message, ChatType, InvoiceItem
from app.schemas.payment import (
    PaymentCreate,
    PaymentUpdate,
    PaymentResponse,
    PaymentWithDetails,
    PaymentPagination,
    StudentBalance,
    PaymentSummary,
    InvoiceGroupRequest,
    InvoiceStudentRequest,
    PaymentConfirm,
    ParentPaymentStatus,
    ChildPaymentStatus,
    InvoiceResult,
    ManualInvoiceCreate,
    ManualInvoiceResponse,
    InvoiceItemCreate,
    InvoiceItemResponse
)
from app.core.sms_service import sms_service, SMSTemplates as SMSTextTemplates
from app.core.background_tasks import notify_payment_confirmed, send_payment_notification
from app.services.payment_service import recalculate_student_balance



def get_month_range(d: date):
    import calendar
    first_day = d.replace(day=1)
    last_day_num = calendar.monthrange(d.year, d.month)[1]
    last_day = d.replace(day=last_day_num)
    return first_day, last_day

router = APIRouter()

# Directory for receipts
RECEIPTS_DIR = Path("uploads/receipts")
RECEIPTS_DIR.mkdir(parents=True, exist_ok=True)
ALLOWED_RECEIPT_EXTENSIONS = {".jpg", ".jpeg", ".png", ".pdf"}

def save_receipt_file(file: UploadFile) -> str:
    """Save uploaded receipt and return URL."""
    file_ext = Path(file.filename).suffix.lower()
    if file_ext not in ALLOWED_RECEIPT_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"File type not allowed. Allowed: {', '.join(ALLOWED_RECEIPT_EXTENSIONS)}"
        )
    
    timestamp = get_now().strftime("%Y%m%d_%H%M%S")
    unique_id = uuid.uuid4().hex[:8]
    filename = f"receipt_{timestamp}_{unique_id}{file_ext}"
    filepath = RECEIPTS_DIR / filename
    
    try:
        with filepath.open("wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save file: {str(e)}")
        
    return f"/uploads/receipts/{filename}"

@router.post("/receipt", response_model=PaymentResponse)
async def upload_receipt(
    student_id: int = Form(...),
    amount: float = Form(...),
    period: str = Form(...),  # YYYY-MM
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Upload a payment receipt.
    Creates a PENDING payment and notifies admins.
    """
    # 1. Save file
    file_url = save_receipt_file(file)
    
    # 2. Find student
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
        
    # 3. Create Pending Payment
    # Parse period (YYYY-MM) -> Date (YYYY-MM-01)
    try:
        year, month = map(int, period.split('-'))
        payment_period = date(year, month, 1)
    except:
        payment_period = get_today().replace(day=1)

    payment = Payment(
        student_id=student_id,
        amount=amount,
        payment_date=get_today(),
        payment_period=payment_period,
        method="bank_transfer",
        status="pending",
        description=f"Чек загружен пользователем. URL: {file_url}",
        reference_id=file_url  # Store URL in reference_id too for easier access
    )
    db.add(payment)
    db.flush()
    
    log_create(db, "payment", payment, user=current_user, reason="Загружен чек об оплате")
    
    # 4. Create Notification for Admins
    # Find all admins and owners
    admins = db.query(User).filter(
        User.role.in_(["admin", "super_admin", "owner"]), 
        User.is_active == True
    ).all()
    
    msg_content = (
        f"📸 ЗАГРУЖЕН ЧЕК\n"
        f"Ученик: {student.first_name} {student.last_name}\n"
        f"Сумма: {amount} MDL\n"
        f"Период: {payment_period.strftime('%m.%Y')}\n"
        f"Родитель: {current_user.full_name}\n"
        f"Ссылка: {file_url}"
    )
    
    # Send system notification (Message) to each admin? 
    # Or just one system message? 
    # Usually better to create individual messages or use a shared channel.
    # Since we don't have a shared admin channel easily, I'll create a message for each admin.
    
    for admin in admins:
        msg = Message(
            sender_id=current_user.id,
            recipient_id=admin.id,
            chat_type=ChatType.system,
            content=msg_content,
            is_read=False,
            created_at=now_naive()
        )
        db.add(msg)
    
    db.commit()
    db.refresh(payment)
    
    return payment


# ==================== ОПТИМИЗАЦИЯ: Функция обновления кэша ====================
def update_student_payment_cache(student: Student, db: Session):
    """
    Обновляет кэшированную сумму всех платежей ученика.
    Вызывать после создания/обновления/удаления платежа.
    """
    total = db.query(func.sum(Payment.amount)).filter(
        Payment.student_id == student.id,
        Payment.status == 'completed',
        Payment.deleted_at.is_(None)
    ).scalar() or 0.0
    
    student.total_paid_cache = float(total)
    student.cache_updated_at = now_naive()  # Moldova timezone
    db.add(student)

@router.post("/", response_model=PaymentResponse)
async def record_payment(
    *,
    db: Session = Depends(get_db),
    payment_in: PaymentCreate,
    current_user: User = Depends(get_current_user),
    background_tasks: BackgroundTasks  # ОПТИМИЗАЦИЯ: Background tasks
) -> Payment:
    """
    Record a payment for a student (admin only).
    Automatically updates student balance.
    """
    if current_user.role not in ["super_admin", "admin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough permissions"
        )
    
    # Validate student exists
    from sqlalchemy.orm import joinedload
    student = db.query(Student).options(
        joinedload(Student.guardians).joinedload(StudentGuardian.user)
    ).filter(Student.id == payment_in.student_id).first()
    if not student:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Student not found"
        )
    
    # Normalize payment_period to 1st of month if provided
    if payment_in.payment_period:
        payment_in.payment_period = payment_in.payment_period.replace(day=1)
        period_start, period_end = get_month_range(payment_in.payment_period)
    else:
        period_start, period_end = None, None

    # Check for existing COMPLETED payment in this period
    # LOGIC UPDATE: Allow multiple payments (split payments).
    # We only warn if it looks like a duplicate (exact same amount and date), but for now let's allow it.
    # existing_payment = db.query(Payment).filter(...)
    # if existing_payment: raise ... -> REMOVED to support partial payments

    # CHECK FOR EXISTING PENDING PAYMENT (INVOICE)
    # If we are creating a COMPLETED payment for a period that already has a PENDING payment,
    # we handle it as a payment against that invoice.
    if payment_in.status == 'completed' and period_start:
        existing_pending = db.query(Payment).options(joinedload(Payment.student)).filter(
            Payment.student_id == payment_in.student_id,
            Payment.payment_period >= period_start,
            Payment.payment_period <= period_end,
            Payment.status == 'pending',
            Payment.deleted_at.is_(None)
        ).first()

        if existing_pending:
            # PARTIAL PAYMENT LOGIC
            # If paying LESS than the invoice amount, we split the invoice.
            if payment_in.amount < existing_pending.amount:
                # 1. Deduct from pending invoice (it remains pending with lower amount)
                old_pending_amount = existing_pending.amount
                existing_pending.amount -= payment_in.amount
                
                # Log the reduction of debt
                log_update(db, "payment", existing_pending, {"amount": old_pending_amount}, user=current_user)
                
                # 2. Create NEW completed payment record
                # We proceed to the standard "Create payment record" block below, 
                # effectively treating this as a new independent payment.
                # The 'existing_pending' object is updated in DB but we don't return it immediately.
                db.add(existing_pending)
                
                # NOTE: The balance logic below will handle adding the paid amount.
                # The reduction of pending invoice amount effectively "reduces debt" but doesn't change balance 
                # (balance = total_paid - total_invoiced?? No, balance is simple ledger).
                # Wait, our balance logic is: 
                #   - Invoice created: balance -= amount (debt increases)
                #   - Payment completed: balance += amount (debt decreases)
                
                # If we reduce invoice amount, we should technically INCREASE balance back?
                # Example:
                # Start: Balance 0.
                # Invoice 1000 created. Balance = -1000.
                # User pays 400.
                # 
                # Approach A (Update Invoice):
                # Invoice becomes 600. Balance should be -600.
                # Payment 400 created (completed). Balance += 400.
                # Result: Balance = -1000 + 400 = -600. Correct.
                #
                # Wait, if we change Invoice amount in DB from 1000 to 600, that action itself doesn't auto-update balance.
                # We manually updated balance when creating invoice.
                # So if we reduce invoice amount, we must manually adjust balance?
                #
                # Actually, `student.balance` is a simple counter.
                # Invoice creation: `student.balance -= 1000`.
                # We modify Invoice to 600. `student.balance` is still -1000 (reflecting the original charge).
                # We create Payment 400. `student.balance += 400` -> -600.
                # This matches the "Remaining Debt" of 600.
                #
                # So: We DON'T need to adjust balance when shrinking the invoice, 
                # BECAUSE the "Payment" we are about to create will credit the balance.
                #
                # Verification:
                # Initial: Debt 1000. Balance -1000.
                # Action: Pay 400.
                # Result needed: Debt 600. Balance -600.
                # 
                # Steps:
                # 1. Modify Invoice: 1000 -> 600. (Visual change only, debt record reduced).
                # 2. Create Payment: 400.
                # 3. Logic below adds 400 to balance.
                # End Balance: -1000 + 400 = -600. Correct.
                
                pass # Fall through to create new payment
                
            else:
                # FULL PAYMENT (or Overpayment)
                # Update the existing pending payment to completed
                old_amount = existing_pending.amount
                
                existing_pending.status = 'completed'
                existing_pending.amount = payment_in.amount
                existing_pending.payment_date = payment_in.payment_date
                existing_pending.method = payment_in.method
                existing_pending.description = payment_in.description or existing_pending.description
                existing_pending.reference_id = payment_in.reference_id
                existing_pending.payment_period = payment_in.payment_period
                
                # Update expiration if needed
                new_expiry = period_end
                if not student.subscription_expires or new_expiry > student.subscription_expires:
                    student.subscription_expires = new_expiry
                
                db.add(student)
                db.add(existing_pending)
                
                # Flush changes to DB so recalculation sees them
                db.flush()
                
                # RECALCULATE BALANCE
                recalculate_student_balance(db, student.id)
                
                db.commit()
                db.refresh(existing_pending)
                update_student_payment_cache(student, db)
                log_update(db, "payment", existing_pending, {"status": "pending", "amount": old_amount}, user=current_user)
                
                # Trigger notifications for this update
                if payment_in.status == 'completed':
                     parent_user_id = None
                     parent_lang = "ro"
                     if student.guardians:
                         parent_user_id = student.guardians[0].user_id
                         if student.guardians[0].user:
                             parent_lang = getattr(student.guardians[0].user, 'preferred_language', 'ro')
                     
                     if parent_user_id:
                         # Create system message for payment confirmation
                         msg_content = (
                             f"✅ Оплата подтверждена\n"
                             f"Ученик: {student.first_name} {student.last_name}\n"
                             f"Сумма: {payment_in.amount} MDL\n"
                             f"Дата: {payment_in.payment_date}"
                         )
                         
                         msg = Message(
                             sender_id=current_user.id,
                             recipient_id=parent_user_id,
                             chat_type=ChatType.system,
                             content=msg_content,
                             is_read=False,
                             created_at=now_naive()
                         )
                         db.add(msg)
                     
                return existing_pending

    # Create payment record
    # Check if we are creating a duplicate PENDING payment (Invoice)
    if payment_in.status == 'pending' and period_start:
        # Check for existing PENDING or COMPLETED
        existing_any = db.query(Payment).filter(
            Payment.student_id == payment_in.student_id,
            Payment.payment_period >= period_start,
            Payment.payment_period <= period_end,
            Payment.deleted_at.is_(None)
        ).first()
        
        if existing_any:
            status_msg = "оплачен" if existing_any.status == 'completed' else "выставлен"
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Счет за этот месяц уже {status_msg}. Если это ошибка, удалите существующий платеж или счет."
            )

    payment = Payment(
        student_id=payment_in.student_id,
        amount=payment_in.amount,
        payment_date=payment_in.payment_date,
        payment_period=payment_in.payment_period,
        method=payment_in.method,
        status=payment_in.status or "completed",
        description=payment_in.description,
        reference_id=payment_in.reference_id
    )
    db.add(payment)
    
    # Update balance based on status
    if payment.status == 'completed':
        # Logic: If paying for a period, extend subscription
        if payment_in.payment_period:
            # period_end is already calculated at the top of the function
            new_expiry = period_end
            
            # If current expiry is later, keep it (unless we want to stack months, but simpler is replace if newer)
            if not student.subscription_expires or new_expiry > student.subscription_expires:
                student.subscription_expires = new_expiry

    elif payment.status == 'pending':
        # Send invoice notification if creating manually
        from app.core.background_tasks import notify_new_invoice
        
        # Find parent
        parent_user_id = None
        parent_lang = "ro"
        if student.guardians:
            parent_user_id = student.guardians[0].user_id
            if student.guardians[0].user:
                parent_lang = getattr(student.guardians[0].user, 'preferred_language', 'ro')
        
        if parent_user_id and payment_in.payment_period:
            month_name = get_month_name_ru(payment_in.payment_period.month)
            background_tasks.add_task(
                notify_new_invoice,
                student_id=student.id,
                amount=payment_in.amount,
                month_name=month_name,
                user_id=parent_user_id,
                lang=parent_lang
            )

    db.add(student)
    
    db.flush()
    db.refresh(payment)
    
    # RECALCULATE BALANCE
    recalculate_student_balance(db, student.id)
    
    # ОПТИМИЗАЦИЯ: Обновляем кэш платежей
    # Кэш обновляется после flush, чтобы учитывать новый платеж в сумме
    update_student_payment_cache(student, db)
    
    # Log creation in audit
    log_create(db, "payment", payment, user=current_user)
    
    # Create system message for completed payments (before commit)
    if payment.status == 'completed':
        parent_user_id = None
        if student.guardians:
            parent_user_id = student.guardians[0].user_id
        
        if parent_user_id:
            msg_content = (
                f"✅ Оплата подтверждена\n"
                f"Ученик: {student.first_name} {student.last_name}\n"
                f"Сумма: {payment.amount} MDL\n"
                f"Дата: {payment.payment_date}"
            )
            msg = Message(
                sender_id=current_user.id,
                recipient_id=parent_user_id,
                chat_type=ChatType.system,
                content=msg_content,
                is_read=False,
                created_at=now_naive()
            )
            db.add(msg)
    
    db.commit()
    
    # ФАЗА 5: Background Tasks - отправка уведомлений асинхронно
    if payment.status == 'completed':
        # Находим телефон родителя
        parent_phone = student.parent_phone
        parent_language = "ro"  # По умолчанию
        
        if not parent_phone and student.guardians:
            guardian = student.guardians[0]
            if guardian.user:
                parent_phone = guardian.user.phone
                parent_language = getattr(guardian.user, 'preferred_language', 'ro')
        
        # 🔔 Push Notification
        from app.core.background_tasks import (
            notify_payment_confirmed,
            send_payment_notification,
            sync_to_google_sheets
        )

        if parent_phone:
            # Запускаем в фоне - не блокирует ответ API
            background_tasks.add_task(
                send_payment_notification,
                student.id,
                parent_phone,
                payment.amount,
                str(payment.payment_date),
                parent_language  # Передаём язык
            )
            
            # Get parent user_id
            parent_user_id = None
            if student.guardians:
                parent_user_id = student.guardians[0].user_id
            
            if parent_user_id:
                # Send FCM notification in background
                background_tasks.add_task(
                    notify_payment_confirmed,
                    student_id=student.id,
                    amount=payment.amount,
                    user_id=parent_user_id,
                    lang=parent_language
                )
        
        # Синхронизация с Google Sheets в фоне
        payment_data = {
            "id": payment.id,
            "student_id": student.id,
            "student_name": f"{student.first_name} {student.last_name}",
            "amount": payment.amount,
            "payment_date": str(payment.payment_date),
            "payment_period": str(payment.payment_period),
            "status": payment.status,
            "notes": payment.description or ""
        }
        
        background_tasks.add_task(
            sync_to_google_sheets,
            "payment",
            payment.id,
            "create",
            payment_data  # Передаём данные
        )
    
    return payment

@router.get("/", response_model=PaymentPagination)
async def get_payments(
    skip: int = 0,
    limit: int = 10000,  # Без ограничений для масштабирования
    student_id: Optional[int] = Query(None, description="Filter by student ID"),
    payment_period: Optional[date] = Query(None, description="Filter by payment period"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> dict:
    """
    Retrieve payments with optional filters and pagination (optimized for 1000+ students).
    Parents can only see payments for their children.
    Coaches can only see payments for students in their groups.
    
    Returns: {"data": [...], "total": count, "skip": int, "limit": int}
    """
    try:
        query = db.query(Payment).options(
            joinedload(Payment.student),
            joinedload(Payment.invoice_items)
        ).filter(
            Payment.deleted_at.is_(None)  # Exclude soft-deleted
        )
        
        # Apply role-based filtering
        user_role = current_user.role.lower() if current_user.role else ""
        if user_role == "parent":
            # Get students linked to this parent
            guardian_relations = db.query(StudentGuardian).filter(
                StudentGuardian.user_id == current_user.id
            ).all()
            student_ids = [rel.student_id for rel in guardian_relations]
            query = query.filter(Payment.student_id.in_(student_ids))
            
            # Fix for duplicate/ghost debts:
            # If a completed payment exists for a month, exclude any pending payment for that same month
            # This is complex in SQL, so we might need to do it in application logic or use a subquery.
            # However, for main list, we show everything.
        
        # Тренеры НЕ имеют доступа к платежам
        elif user_role == "coach":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Тренеры не имеют доступа к платежам"
            )
        
        # Apply filters
        if student_id:
            # Check permissions for parents
            if user_role == "parent":
                guardian = db.query(StudentGuardian).filter(
                    StudentGuardian.student_id == student_id,
                    StudentGuardian.user_id == current_user.id
                ).first()
                if not guardian:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="Not enough permissions"
                    )
            query = query.filter(Payment.student_id == student_id)
        
        if payment_period:
            query = query.filter(Payment.payment_period == payment_period)
        
        # Подсчёт total
        total = query.count()
        
        # Пагинация с сортировкой
        payments = query.order_by(Payment.payment_date.desc()).offset(skip).limit(limit).all()
        
        return {
            "data": payments,
            "total": total,
            "skip": skip,
            "limit": limit,
            "pages": (total + limit - 1) // limit
        }
    except Exception as e:
        import traceback
        print(f"ERROR in get_payments: {e}")
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal Server Error: {str(e)}"
        )


@router.get("/my", response_model=PaymentPagination)
async def get_my_payments(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> dict:
    """
    💳 Получить все платежи для детей текущего родителя.
    Эндпоинт для мобильного приложения.
    """
    guardian_relations = db.query(StudentGuardian).filter(
        StudentGuardian.user_id == current_user.id
    ).all()
    student_ids = [rel.student_id for rel in guardian_relations]
    
    if not student_ids:
        return {"data": [], "total": 0, "skip": skip, "limit": limit, "pages": 0}
    
    query = db.query(Payment).options(
        joinedload(Payment.student).joinedload(Student.group),
        joinedload(Payment.invoice_items)
    ).filter(Payment.student_id.in_(student_ids))
    
    total = query.count()
    payments = query.order_by(Payment.payment_date.desc()).offset(skip).limit(limit).all()
    
    result = []
    for p in payments:
        result.append({
            "id": p.id,
            "student_id": p.student_id,
            "student_name": f"{p.student.first_name} {p.student.last_name}" if p.student else None,
            "group_name": p.student.group.name if p.student and p.student.group else None,
            "amount": p.amount,
            "payment_date": str(p.payment_date) if p.payment_date else None,
            "payment_period": str(p.payment_period) if p.payment_period else None,
            "method": p.method,
            "status": p.status,
            "description": p.description,
            "reference_id": p.reference_id,
            "invoice_items": [
                {
                    "id": item.id, 
                    "description": item.description, 
                    "item_type": item.item_type, 
                    "unit_price": item.unit_price, 
                    "quantity": item.quantity,
                    "total_price": item.total_price
                } 
                for item in p.invoice_items
            ]
        })
    
    return {"data": result, "total": total, "skip": skip, "limit": limit, "pages": (total + limit - 1) // limit if total > 0 else 0}


# ==================== ВАЖНО: Статические маршруты ПЕРЕД динамическими ====================

@router.get("/my-debts", response_model=list[PaymentResponse])
async def get_my_debts(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> list[Payment]:
    """
    💳 Получить долги (pending платежи) для детей текущего родителя.
    
    Доступ: parent, admin, super_admin
    """
    user_role = current_user.role.lower() if current_user.role else ""
    if user_role == "parent":
        # Получаем детей родителя
        guardian_relations = db.query(StudentGuardian).filter(
            StudentGuardian.user_id == current_user.id
        ).all()
        student_ids = [rel.student_id for rel in guardian_relations]
        
        # Get all pending payments
        pending_payments = db.query(Payment).options(
            joinedload(Payment.student),
            joinedload(Payment.invoice_items)
        ).filter(
            Payment.student_id.in_(student_ids),
            Payment.status == "pending",
            Payment.deleted_at.is_(None)
        ).order_by(Payment.payment_period.desc()).all()
        
        # Filter out "ghost" debts (if completed payment exists for same month)
        valid_debts = []
        for debt in pending_payments:
            if not debt.payment_period:
                valid_debts.append(debt)
                continue
                
            period_start, period_end = get_month_range(debt.payment_period)
            
            # Check if completed payment exists with SAME AMOUNT (to avoid hiding valid different invoices)
            completed_exists = db.query(Payment).filter(
                Payment.student_id == debt.student_id,
                Payment.payment_period >= period_start,
                Payment.payment_period <= period_end,
                Payment.status == 'completed',
                Payment.amount == debt.amount,  # Only filter if amount matches
                Payment.deleted_at.is_(None)
            ).first()
            
            if not completed_exists:
                valid_debts.append(debt)
                
        return valid_debts
    else:
        # Админы видят все pending
        payments = db.query(Payment).options(
            joinedload(Payment.student),
            joinedload(Payment.invoice_items)
        ).filter(
            Payment.status == "pending",
            Payment.deleted_at.is_(None)
        ).order_by(Payment.payment_period.desc()).all()
        
        return payments


@router.get("/status", response_model=ParentPaymentStatus)
async def get_payment_status(
    period: Optional[str] = Query(None, description="Период в формате YYYY-MM"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> ParentPaymentStatus:
    """
    📊 Получить статус оплаты для родителя.
    
    Возвращает:
    - has_debt: есть ли долг
    - total_pending: общая сумма долга
    - children: список детей со статусами
    
    Доступ: все авторизованные
    """
    children_status = []
    total_pending = 0.0
    
    # Определяем период
    if period:
        try:
            year, month = map(int, period.split("-"))
            target_period = date(year, month, 1)
        except:
            target_period = date.today().replace(day=1)
    else:
        # Текущий или следующий месяц (если >= 25)
        today = date.today()
        if today.day >= 25:
            target_period = (today.replace(day=1) + relativedelta(months=1))
        else:
            target_period = today.replace(day=1)
    
    period_label = f"{get_month_name_ru(target_period.month)} {target_period.year}"
    
    # Получаем детей
    user_role = current_user.role.lower() if current_user.role else ""
    if user_role == "parent":
        guardian_relations = db.query(StudentGuardian).filter(
            StudentGuardian.user_id == current_user.id
        ).all()
        student_ids = [rel.student_id for rel in guardian_relations]
        students = db.query(Student).filter(Student.id.in_(student_ids)).all()
    else:
        # Админы видят всех с pending
        students = db.query(Student).filter(Student.is_debtor == True).all()
        student_ids = [s.id for s in students]
    
    if not students:
         return ParentPaymentStatus(
            has_debt=False,
            total_pending=0.0,
            children=[]
        )

    # ОПТИМИЗАЦИЯ: Получаем все платежи за период одним запросом
    period_start, period_end = get_month_range(target_period)
    
    all_payments = db.query(Payment).filter(
        Payment.student_id.in_(student_ids),
        Payment.payment_period >= period_start,
        Payment.payment_period <= period_end,
        Payment.deleted_at.is_(None)
    ).all()
    
    # Группируем по студентам
    payments_map = {}
    for p in all_payments:
        if p.student_id not in payments_map:
            payments_map[p.student_id] = []
        payments_map[p.student_id].append(p)
    
    for student in students:
        payments_in_period = payments_map.get(student.id, [])
        
        # Logic: If ANY completed payment exists, show completed. 
        # If no completed, but pending exists, show pending.
        # Else no invoice.
        
        completed_payment = next((p for p in payments_in_period if p.status == 'completed'), None)
        pending_payment = next((p for p in payments_in_period if p.status == 'pending'), None)
        
        if completed_payment:
            status_str = "completed"
            amount = completed_payment.amount
            payment_id = completed_payment.id
        elif pending_payment:
            status_str = "pending"
            amount = pending_payment.amount
            payment_id = pending_payment.id
        else:
            # Нет счета - нет долга пока
            status_str = "no_invoice"
            amount = 0.0
            payment_id = None
        
        if status_str == "pending":
            total_pending += amount
        
        group_name = student.group.name if student.group else None
        
        children_status.append(ChildPaymentStatus(
            student_id=student.id,
            student_name=f"{student.first_name} {student.last_name}",
            group_name=group_name,
            amount=amount,
            status=status_str,
            period=period_label,
            payment_id=payment_id
        ))
    
    return ParentPaymentStatus(
        has_debt=total_pending > 0,
        total_pending=total_pending,
        children=children_status
    )


@router.get("/pending", response_model=PaymentPagination)
async def get_pending_payments(
    skip: int = 0,
    limit: int = 100,
    group_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> dict:
    """
    💳 Получить все ожидающие оплаты платежи (pending).
    
    Доступ: super_admin, admin
    """
    user_role = current_user.role.lower() if current_user.role else ""
    if user_role not in ["super_admin", "admin", "owner"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Недостаточно прав"
        )
    
    query = db.query(Payment).options(joinedload(Payment.student)).filter(
        Payment.status == "pending",
        Payment.deleted_at.is_(None)
    )
    
    if group_id:
        query = query.join(Student).filter(Student.group_id == group_id)
    
    total = query.count()
    payments = query.order_by(Payment.payment_period.desc()).offset(skip).limit(limit).all()
    
    return {
        "data": payments,
        "total": total,
        "skip": skip,
        "limit": limit,
        "pages": (total + limit - 1) // limit
    }


@router.get("/matrix", response_model=dict)
async def get_payment_matrix(
    year: int = Query(..., description="Год для отчета"),
    group_id: Optional[int] = Query(None, description="Фильтр по группе"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    📊 Сводная таблица оплат (Matrix View).
    Возвращает список студентов и их оплаты по месяцам выбранного года.
    
    Структура ответа:
    {
        "students": [
            {
                "id": 1,
                "name": "Иванов Иван",
                "group_name": "Группа А",
                "monthly_fee": 1200,
                "payments": {
                    "1": {"amount": 1200, "status": "completed", "date": "2026-01-15"},
                    "2": {"amount": 0, "status": "pending", "debt": 1200},
                    ...
                },
                "total_paid": 12000,
                "total_debt": 2400
            }
        ],
        "months": [1, 2, ..., 12]
    }
    """
    user_role = current_user.role.lower() if current_user.role else ""
    if user_role not in ["super_admin", "owner"]:
        raise HTTPException(status_code=403, detail="Not authorized")
        
    # 1. Получаем все платежи за этот год (для определения списка студентов)
    start_date = date(year, 1, 1)
    end_date = date(year, 12, 31)
    
    payments = db.query(Payment).options(joinedload(Payment.invoice_items)).filter(
        Payment.deleted_at.is_(None),
        Payment.payment_period >= start_date,
        Payment.payment_period <= end_date
    ).all()
    
    payment_student_ids = list(set(p.student_id for p in payments))

    # 2. Получаем студентов (активных или с оплатами)
    students_query = db.query(Student).options(joinedload(Student.group))
    
    if group_id:
        students_query = students_query.filter(Student.group_id == group_id)
        
    if payment_student_ids:
        students = students_query.filter(
            or_(
                Student.status == 'active',
                Student.id.in_(payment_student_ids)
            )
        ).order_by(Student.last_name).all()
    else:
        students = students_query.filter(Student.status == 'active').order_by(Student.last_name).all()
    
    # Группируем платежи: student_id -> month -> payment info
    payments_map = {}
    
    # Pre-fetch all payments
    for p in payments:
        if p.student_id not in payments_map:
            payments_map[p.student_id] = {}
            
        month = p.payment_period.month
        
        if month not in payments_map[p.student_id]:
            payments_map[p.student_id][month] = {
                "amount": 0,          # Total Paid
                "invoiced": 0,        # Total Invoiced (Pending + Completed)
                "status": "pending",  # Calculated status
                "ids": [],
                "items": []
            }
            
        current_data = payments_map[p.student_id][month]
        current_data["ids"].append(p.id)
        
        # Add items details
        if p.invoice_items:
             for item in p.invoice_items:
                 current_data["items"].append({
                     "type": item.item_type,
                     "desc": item.description,
                     "price": item.total_price
                 })
        else:
             current_data["items"].append({
                 "type": "membership",
                 "desc": p.description or "Subscription",
                 "price": p.amount
             })

        # LOGIC UPDATE: Separate "Invoiced" (Debt) from "Paid" (Asset)
        # Any non-cancelled payment counts as an Invoice (obligation)
        if p.status != 'cancelled':
            current_data["invoiced"] += p.amount
            
        # Only completed payments count as Paid
        # Normalize status check
        p_status = str(p.status).lower().strip() if p.status else ""
        if p_status == 'completed':
            current_data["amount"] += p.amount
        
        # Status Logic:
        # If Paid >= Invoiced -> Completed (Green)
        # If Paid > 0 but < Invoiced -> Partial (Yellow/Orange)
        # If Paid == 0 -> Pending (Red)
        if current_data["amount"] >= current_data["invoiced"] and current_data["invoiced"] > 0:
            current_data["status"] = 'completed'
        elif current_data["amount"] > 0:
            current_data["status"] = 'partial'
        else:
            current_data["status"] = 'pending'
             
    # 3. Формируем итоговый список
    result = []
    
    for s in students:
        s_payments = payments_map.get(s.id, {})
        monthly_data = {}
        
        total_paid_year = 0
        total_debt_year = 0
        
        for m in range(1, 13):
            data = s_payments.get(m)
            
            if data:
                # Calculate remaining debt for this month
                debt = max(0, data["invoiced"] - data["amount"])
                
                monthly_data[str(m)] = {
                    "amount": data["amount"],      # Paid Amount
                    "invoiced": data["invoiced"],  # Total Invoiced
                    "debt": debt,                  # Remaining Debt
                    "status": data["status"],
                    "ids": data["ids"],
                    "items": data["items"]
                }
                
                total_paid_year += data["amount"]
                total_debt_year += debt
            else:
                monthly_data[str(m)] = None
                
        result.append({
            "id": s.id,
            "name": f"{s.last_name} {s.first_name}",
            "group_name": s.group.name if s.group else "Без группы",
            "monthly_fee": s.group.monthly_fee if s.group else 0,
            "payments": monthly_data,
            "total_paid": total_paid_year,
            "total_debt": total_debt_year
        })
        
    return {
        "year": year,
        "students": result
    }


# ==================== MANUAL INVOICE CREATION ====================

@router.post("/manual-invoice", response_model=ManualInvoiceResponse)
async def create_manual_invoice(
    invoice_data: ManualInvoiceCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> ManualInvoiceResponse:
    """
    📝 Создание счета вручную с детализацией по позициям.
    
    Позволяет выставить счет за разные услуги:
    - Абонементы (membership)
    - Экипировка (equipment) 
    - Индивидуальные тренировки (individual_training)
    - Групповые тренировки (group_training)
    - Прочее (other)
    
    Доступ: super_admin, admin
    """
    user_role = current_user.role.lower() if current_user.role else ""
    if user_role not in ["super_admin", "admin", "owner"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Недостаточно прав для создания счетов"
        )
    
    # Проверяем студента
    student = db.query(Student).filter(Student.id == invoice_data.student_id).first()
    if not student:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Ученик не найден"
        )
    
    # Create manual invoice logic wrapped in try/except
    try:
        # Создаем основной платеж (счет) со статусом pending
        total_amount = invoice_data.total_amount
        payment = Payment(
            student_id=invoice_data.student_id,
            amount=total_amount,
            payment_date=date.today(),
            payment_period=invoice_data.payment_period or date.today().replace(day=1),
            method=None,  # Метод будет выбран при оплате
            status="pending",
            description=invoice_data.notes or f"Счет на {total_amount} MDL",
            reference_id=None
        )
        db.add(payment)
        db.flush()  # Чтобы получить payment.id
        
        # Создаем детализацию по позициям
        invoice_items = []
        
        # Ensure service_date is datetime if column is DateTime
        service_dt = invoice_data.payment_period or date.today()
        if isinstance(service_dt, date) and not isinstance(service_dt, datetime):
            # Convert date to datetime at midnight
            from datetime import time as time_cls
            service_dt = datetime.combine(service_dt, time_cls.min)

        for item_data in invoice_data.invoice_items:
            invoice_item = InvoiceItem(
                payment_id=payment.id,
                item_type=item_data.item_type,
                description=item_data.description,
                quantity=item_data.quantity,
                unit_price=item_data.unit_price,
                total_price=item_data.total_price,
                service_date=service_dt
            )
            db.add(invoice_item)
            invoice_items.append(invoice_item)
        
        # Обновляем баланс студента (уменьшаем на сумму счета)
        if student.balance is None:
            student.balance = 0.0
        student.balance -= total_amount
        student.is_debtor = True
        db.add(student)
        
        # Логируем создание
        log_create(db, "payment", payment, user=current_user)
        
        db.commit()
        db.refresh(payment)
    except Exception as e:
        db.rollback()
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error creating invoice: {str(e)}")
    
    # Формируем ответ с детализацией
    return ManualInvoiceResponse(
        id=payment.id,
        student_id=payment.student_id,
        amount=payment.amount,
        payment_date=payment.payment_date,
        payment_period=payment.payment_period,
        method=payment.method,
        status=payment.status,
        description=payment.description,
        reference_id=payment.reference_id,
        student_name=f"{student.first_name} {student.last_name}",
        invoice_items=[
            InvoiceItemResponse(
                id=item.id,
                item_type=item.item_type,
                description=item.description,
                quantity=item.quantity,
                unit_price=item.unit_price,
                total_price=item.total_price,
                service_date=item.service_date
            ) for item in invoice_items
        ],
        total_amount=total_amount,
        due_date=invoice_data.due_date,
        notes=invoice_data.notes
    )


@router.get("/manual-invoice/{student_id}/pending", response_model=list[ManualInvoiceResponse])
async def get_student_pending_invoices(
    student_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> list[ManualInvoiceResponse]:
    """
    📋 Получить все открытые счета студента (pending payments) с детализацией.
    
    Доступ: super_admin, admin, тренер, родитель (свои дети)
    """
    user_role = current_user.role.lower() if current_user.role else ""
    
    # Проверка прав доступа
    if user_role in ["super_admin", "admin"]:
        pass  # Полный доступ
    elif user_role == "coach":
        # Тренер может видеть счета своих учеников
        coach_groups = [g.id for g in current_user.coached_groups]
        student = db.query(Student).filter(Student.id == student_id).first()
        if not student or student.group_id not in coach_groups:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Нет доступа к счетам этого ученика"
            )
    elif user_role == "parent":
        # Родитель может видеть счета только своих детей
        guardian = db.query(StudentGuardian).filter(
            StudentGuardian.user_id == current_user.id,
            StudentGuardian.student_id == student_id
        ).first()
        if not guardian:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Нет доступа к счетам этого ученика"
            )
    else:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Недостаточно прав"
        )
    
    # Получаем pending счета с детализацией
    pending_payments = db.query(Payment).options(
        joinedload(Payment.invoice_items),
        joinedload(Payment.student)
    ).filter(
        Payment.student_id == student_id,
        Payment.status == "pending",
        Payment.deleted_at.is_(None)
    ).order_by(Payment.payment_date.desc()).all()
    
    result = []
    for payment in pending_payments:
        result.append(ManualInvoiceResponse(
            id=payment.id,
            student_id=payment.student_id,
            amount=payment.amount,
            payment_date=payment.payment_date,
            payment_period=payment.payment_period,
            method=payment.method,
            status=payment.status,
            description=payment.description,
            reference_id=payment.reference_id,
            student_name=f"{payment.student.first_name} {payment.student.last_name}",
            invoice_items=[
                InvoiceItemResponse(
                    id=item.id,
                    item_type=item.item_type,
                    description=item.description,
                    quantity=item.quantity,
                    unit_price=item.unit_price,
                    total_price=item.total_price,
                    service_date=item.service_date
                ) for item in payment.invoice_items
            ],
            total_amount=payment.amount,
            due_date=None,  # Можно добавить в модель позже
            notes=payment.description
        ))
    
    return result


# ==================== Динамические маршруты с {payment_id} ====================

@router.get("/{payment_id}", response_model=PaymentWithDetails)
async def get_payment(
    payment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Payment:
    """
    Get payment by ID with details.
    """
    payment = db.query(Payment).filter(Payment.id == payment_id).first()
    if not payment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Payment not found"
        )
    
    # Check permissions for parents
    user_role = current_user.role.lower() if current_user.role else ""
    if user_role == "parent":
        guardian = db.query(StudentGuardian).filter(
            StudentGuardian.student_id == payment.student_id,
            StudentGuardian.user_id == current_user.id
        ).first()
        if not guardian:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not enough permissions"
            )
    
    return payment

@router.get("/student/{student_id}", response_model=List[PaymentResponse])
async def get_student_payments(
    student_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> List[Payment]:
    """
    Get payment history for a specific student.
    Parents can only view their own children's payments.
    """
    # Validate student exists
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Student not found"
        )
    
    # Check permissions for parents
    user_role = current_user.role.lower() if current_user.role else ""
    if user_role == "parent":
        guardian = db.query(StudentGuardian).filter(
            StudentGuardian.student_id == student_id,
            StudentGuardian.user_id == current_user.id
        ).first()
        if not guardian:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not enough permissions"
            )
    
    payments = db.query(Payment).options(joinedload(Payment.student)).filter(Payment.student_id == student_id).order_by(Payment.payment_date.desc()).all()
    return payments

@router.get("/student/{student_id}/balance", response_model=StudentBalance)
async def get_student_balance(
    student_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> StudentBalance:
    """
    Get student's current balance and payment summary.
    Parents can only view their own children's balance.
    """
    # Validate student exists
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Student not found"
        )
    
    # Check permissions for parents
    user_role = current_user.role.lower() if current_user.role else ""
    if user_role == "parent":
        guardian = db.query(StudentGuardian).filter(
            StudentGuardian.student_id == student_id,
            StudentGuardian.user_id == current_user.id
        ).first()
        if not guardian:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not enough permissions"
            )
    
    # Calculate payment summary
    payment_stats = db.query(
        func.sum(Payment.amount).label("total_paid"),
        func.count(Payment.id).label("payment_count")
    ).filter(Payment.student_id == student_id).first()
    
    total_paid = payment_stats.total_paid or 0.0
    payment_count = payment_stats.payment_count or 0
    
    return StudentBalance(
        student_id=student_id,
        balance=student.balance,
        total_paid=total_paid,
        payment_count=payment_count
    )

@router.put("/{payment_id}", response_model=PaymentResponse)
async def update_payment(
    *,
    db: Session = Depends(get_db),
    payment_id: int,
    payment_in: PaymentUpdate,
    current_user: User = Depends(get_current_user),
    background_tasks: BackgroundTasks
) -> Payment:
    """
    Update payment information (admin only).
    Note: Updating amount will adjust student balance accordingly.
    """
    user_role = current_user.role.lower() if current_user.role else ""
    if user_role not in ["super_admin", "admin", "owner"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough permissions"
        )
    
    payment = db.query(Payment).filter(Payment.id == payment_id).first()
    if not payment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Payment not found"
        )
    
    # Save old data for audit
    old_data = entity_to_dict(payment)
    
    # If payment details affecting balance are changed
    old_amount = payment.amount
    old_status = payment.status
    
    # Update fields
    update_data = payment_in.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(payment, field, value)
        
    # Synchronize invoice items to match the new amount if it was changed
    if "amount" in update_data and payment.amount != old_amount:
        if len(payment.invoice_items) == 1:
            item = payment.invoice_items[0]
            item.unit_price = float(payment.amount)
            item.total_price = float(payment.amount)
            db.add(item)
        elif len(payment.invoice_items) > 1:
            # Add the difference to the first invoice item
            diff = float(payment.amount) - float(old_amount)
            item = payment.invoice_items[0]
            item.total_price = float(item.total_price) + diff
            if item.quantity and item.quantity > 0:
                item.unit_price = float(item.total_price) / float(item.quantity)
            db.add(item)
    
    # Recalculate balance if needed
    student = db.query(Student).filter(Student.id == payment.student_id).first()
    if student:
        # Initialize balance if None
        if student.balance is None:
            student.balance = 0.0
            
        # Revert old impact
        if old_status == 'completed':
            student.balance -= old_amount
        elif old_status == 'pending':
            student.balance += old_amount
            
        # Apply new impact
        if payment.status == 'completed':
            student.balance += payment.amount
        elif payment.status == 'pending':
            student.balance -= payment.amount
            
        # Check debt status if pending payments exist
        pending_count = db.query(Payment).filter(
            Payment.student_id == student.id,
            Payment.status == "pending",
            Payment.id != payment.id # Exclude current if it's no longer pending (handled above) or if it IS pending (counted)
        ).count()
        
        # Correction: if current is pending, it's already in DB? No, we haven't committed yet but we updated the object.
        # But filter by ID works on DB state.
        # Simplest: Just check if balance < 0 or if any pending payments exist.
        # Actually, let's stick to the pending count logic.
        
        if payment.status == 'pending':
            student.is_debtor = True
        elif pending_count == 0:
             student.is_debtor = False
             
        db.add(student)
        
        # Update payment cache
        update_student_payment_cache(student, db)
    
    db.add(payment)
    db.commit()
    db.refresh(payment)
    
    # Log update in audit
    log_update(db, "payment", payment, old_data, user=current_user)
    db.commit()
    
    # Send notification if status changed to completed
    if old_status != 'completed' and payment.status == 'completed' and student:
        from app.core.background_tasks import notify_payment_confirmed, send_payment_notification
        
        # Find parent phone/user
        parent_phone = student.parent_phone
        parent_lang = "ro"
        parent_user_id = None
        
        if student.guardians:
            guardian = student.guardians[0]
            parent_user_id = guardian.user_id
            if guardian.user:
                if not parent_phone:
                    parent_phone = guardian.user.phone
                parent_lang = getattr(guardian.user, 'preferred_language', 'ro')
        
        if parent_phone:
                background_tasks.add_task(
                send_payment_notification,
                student.id,
                parent_phone,
                payment.amount,
                str(payment.payment_date),
                parent_lang
            )
        
        if parent_user_id:
            background_tasks.add_task(
                notify_payment_confirmed,
                student_id=student.id,
                amount=payment.amount,
                user_id=parent_user_id,
                lang=parent_lang
            )
    
    return payment




@router.delete("/{payment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_payment(
    *,
    db: Session = Depends(get_db),
    payment_id: int,
    current_user: User = Depends(get_current_user)
):
    """
    Soft-delete a payment (admin only).
    Automatically adjusts student balance.
    Payment can be restored from trash.
    """
    user_role = current_user.role.lower() if current_user.role else ""
    if user_role not in ["super_admin", "admin", "owner"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough permissions"
        )
    
    payment = db.query(Payment).filter(Payment.id == payment_id).first()
    if not payment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Payment not found"
        )
    
    # Get student info before deletion
    student = db.query(Student).filter(Student.id == payment.student_id).first()
    
    # Save student name for restoration
    if student:
        payment.last_student_name = f"{student.first_name} {student.last_name}"
    
    # Soft delete
    payment.deleted_at = now_naive()
    payment.deleted_by_id = current_user.id
    payment.deletion_reason = "Удалено администратором"
    
    # Log deletion in audit
    log_delete(db, "payment", payment, user=current_user)
    
    # Adjust student balance (subtract payment amount)
    if student:
        if student.balance is None:
            student.balance = 0.0
            
        if payment.status == 'completed':
            student.balance -= payment.amount
        elif payment.status == 'pending':
            # Если удаляем счет (pending), нужно ВЕРНУТЬ деньги на баланс (отменить списание)
            student.balance += payment.amount
            
            # Проверяем, есть ли другие долги
            pending_count = db.query(Payment).filter(
                Payment.student_id == student.id,
                Payment.status == "pending",
                Payment.id != payment.id,
                Payment.deleted_at.is_(None)
            ).count()
            if pending_count == 0:
                student.is_debtor = False
                
        db.add(student)
    
    db.add(payment)
    
    # OPTIMIZATION: Update payment cache after deletion
    if student:
        update_student_payment_cache(student, db)
    
    db.commit()

@router.get("/summary/all", response_model=PaymentSummary)
async def get_payment_summary(
    start_date: Optional[date] = Query(None, description="Start date for summary"),
    end_date: Optional[date] = Query(None, description="End date for summary"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> PaymentSummary:
    """
    Get payment summary statistics (admin only).
    """
    user_role = current_user.role.lower() if current_user.role else ""
    if user_role not in ["super_admin", "admin", "owner"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough permissions"
        )
    
    query = db.query(Payment)
    
    if start_date:
        query = query.filter(Payment.payment_date >= start_date)
    
    if end_date:
        query = query.filter(Payment.payment_date <= end_date)
    
    payments = query.all()
    
    total_payments = len(payments)
    total_amount = sum(p.amount for p in payments)
    
    # Group by payment method
    by_method = {}
    for payment in payments:
        method = payment.method.value if hasattr(payment.method, 'value') else str(payment.method)
        by_method[method] = by_method.get(method, 0) + payment.amount
    
    return PaymentSummary(
        total_payments=total_payments,
        total_amount=total_amount,
        by_method=by_method
    )

@router.get("/summary/periods")
async def get_payment_periods_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> dict:
    """
    📊 Получить детальную статистику платежей по периодам:
    - Текущий месяц
    - Прошлый месяц
    - Текущий год
    - Весь период
    
    Только для администраторов.
    """
    user_role = current_user.role.lower() if current_user.role else ""
    if user_role not in ["super_admin", "admin", "owner"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough permissions"
        )
    
    from datetime import datetime, timedelta
    from dateutil.relativedelta import relativedelta
    
    today = date.today()
    
    # Текущий месяц
    current_month_start = today.replace(day=1)
    current_month_end = (current_month_start + relativedelta(months=1)) - timedelta(days=1)
    
    # Прошлый месяц
    last_month_start = (current_month_start - relativedelta(months=1))
    last_month_end = current_month_start - timedelta(days=1)
    
    # Текущий год
    current_year_start = today.replace(month=1, day=1)
    current_year_end = today.replace(month=12, day=31)
    
    # Функция подсчёта
    def calculate_period(start_date, end_date):
        payments = db.query(Payment).filter(
            Payment.payment_date >= start_date,
            Payment.payment_date <= end_date,
            Payment.status == 'completed',
            Payment.deleted_at.is_(None)
        ).all()
        
        total_amount = sum(p.amount for p in payments)
        total_count = len(payments)
        unique_students = len(set(p.student_id for p in payments))
        
        # По методам оплаты
        by_method = {}
        for p in payments:
            method = p.method.value if hasattr(p.method, 'value') else str(p.method)
            by_method[method] = by_method.get(method, 0.0) + float(p.amount)
        
        return {
            "total_amount": float(total_amount),
            "total_count": total_count,
            "unique_students": unique_students,
            "by_method": by_method,
            "average_payment": float(total_amount / total_count) if total_count > 0 else 0.0
        }
    
    # Весь период
    all_payments = db.query(Payment).filter(
        Payment.status == 'completed',
        Payment.deleted_at.is_(None)
    ).all()
    all_total = sum(p.amount for p in all_payments)
    all_count = len(all_payments)
    
    return {
        "current_month": {
            "period": f"{current_month_start.strftime('%Y-%m-%d')} - {current_month_end.strftime('%Y-%m-%d')}",
            "label": current_month_start.strftime("%B %Y"),
            **calculate_period(current_month_start, current_month_end)
        },
        "last_month": {
            "period": f"{last_month_start.strftime('%Y-%m-%d')} - {last_month_end.strftime('%Y-%m-%d')}",
            "label": last_month_start.strftime("%B %Y"),
            **calculate_period(last_month_start, last_month_end)
        },
        "current_year": {
            "period": f"{current_year_start.strftime('%Y-%m-%d')} - {current_year_end.strftime('%Y-%m-%d')}",
            "label": str(today.year),
            **calculate_period(current_year_start, current_year_end)
        },
        "all_time": {
            "total_amount": float(all_total),
            "total_count": all_count,
            "label": "Весь период"
        },
        "generated_at": now_naive().isoformat()  # Moldova timezone
    }


# ==================== INVOICE SYSTEM ====================

@router.post("/invoice/group/{group_id}", response_model=InvoiceResult)
async def invoice_group(
    group_id: int,
    invoice_data: InvoiceGroupRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> InvoiceResult:
    """
    📝 Массовое выставление счетов всем ученикам группы (Вариант А).
    
    Создает pending платежи для всех активных учеников группы.
    Сумма берется из Group.monthly_fee или Student.individual_fee.
    
    Доступ: super_admin, admin
    """
    user_role = current_user.role.lower() if current_user.role else ""
    if user_role not in ["super_admin", "admin", "owner"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Недостаточно прав"
        )
    
    # Проверяем группу
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Группа не найдена"
        )
    
    # Получаем активных учеников группы
    # OPTIMIZATION: Include all non-archived students to cover "new" or "trial" statuses
    students = db.query(Student).filter(
        Student.group_id == group_id,
        Student.status != "archived",
        Student.deleted_at.is_(None)
    ).all()
    
    if not students:
        return InvoiceResult(
            success=False,
            created_count=0,
            skipped_count=0,
            message="В группе нет подходящих учеников",
            payments=[]
        )
    
    created_payments = []
    updated_payments = []
    skipped_count = 0
    
    # OPTIMIZATION: Batch fetch existing payments to avoid N+1
    invoice_period = invoice_data.payment_period.replace(day=1)
    period_start, period_end = get_month_range(invoice_period)
    student_ids = [s.id for s in students]
    
    requested_item_type = invoice_data.item_type or "membership"

    existing_payments = db.query(Payment).options(joinedload(Payment.invoice_items)).filter(
        Payment.student_id.in_(student_ids),
        Payment.payment_period >= period_start,
        Payment.payment_period <= period_end,
        Payment.deleted_at.is_(None),
    ).all()
    
    existing_by_student: dict[int, Payment] = {}
    for p in existing_payments:
        if p.invoice_items:
            if not (len(p.invoice_items) == 1 and p.invoice_items[0].item_type == requested_item_type):
                continue
        else:
            if requested_item_type != "membership":
                continue

        existing = existing_by_student.get(p.student_id)
        if not existing:
            existing_by_student[p.student_id] = p
            continue
        existing_status = str(existing.status).lower().strip() if existing.status else ""
        p_status = str(p.status).lower().strip() if p.status else ""
        if existing_status != "pending" and p_status == "pending":
            existing_by_student[p.student_id] = p

    existing_student_ids = set(existing_by_student.keys())

    print(f"DEBUG: Processing group {group_id}, students found: {len(students)}")

    try:
        for student in students:
            try:
                # Определяем сумму: custom > individual_fee > group.monthly_fee
                if invoice_data.custom_amount:
                    amount = invoice_data.custom_amount
                elif student.individual_fee:
                    amount = student.individual_fee
                else:
                    amount = group.monthly_fee or 0.0

                if amount <= 0:
                    skipped_count += 1
                    continue

                description = invoice_data.description or f"Счет за {get_month_name_ru(invoice_period.month)} {invoice_period.year}"

                if student.id in existing_student_ids:
                    existing_payment = existing_by_student.get(student.id)
                    if not existing_payment:
                        skipped_count += 1
                        continue

                    existing_status = str(existing_payment.status).lower().strip() if existing_payment.status else ""
                    if existing_status != "pending":
                        skipped_count += 1
                        continue

                    old_data = entity_to_dict(existing_payment)
                    existing_payment.amount = amount
                    existing_payment.description = description
                    existing_payment.payment_period = invoice_period
                    db.add(existing_payment)

                    if existing_payment.invoice_items:
                        for item in existing_payment.invoice_items:
                            if item.item_type == (invoice_data.item_type or "membership"):
                                item.description = description
                                item.quantity = 1
                                item.unit_price = amount
                                item.total_price = amount
                                item.service_date = invoice_period
                                db.add(item)
                    else:
                        item = InvoiceItem(
                            payment_id=existing_payment.id,
                            item_type=invoice_data.item_type or "membership",
                            description=description,
                            quantity=1,
                            unit_price=amount,
                            total_price=amount,
                            service_date=invoice_period
                        )
                        db.add(item)

                    db.flush()
                    recalculate_student_balance(db, student.id)

                    try:
                        log_update(db, "payment", existing_payment, old_data, user=current_user)
                    except Exception as audit_e:
                        print(f"Audit log error: {audit_e}")

                    updated_payments.append(existing_payment)
                    continue

                # Создаем pending платеж
                
                payment = Payment(
                    student_id=student.id,
                    amount=amount,
                    payment_date=date.today(),
                    payment_period=invoice_period,
                    method=None,  # Метод будет установлен при подтверждении
                    status="pending",
                    description=description
                )
                db.add(payment)
                db.flush() # Получаем payment.id для привязки invoice_items
                
                # Создаем InvoiceItem
                item = InvoiceItem(
                    payment_id=payment.id,
                    item_type=invoice_data.item_type or "membership",
                    description=description,
                    quantity=1,
                    unit_price=amount,
                    total_price=amount,
                    service_date=invoice_period
                )
                db.add(item)
                
                created_payments.append(payment)

                # Отмечаем ученика как должника и ОБНОВЛЯЕМ БАЛАНС (списываем сумму)
                student.is_debtor = True
                if student.balance is None:
                    student.balance = 0.0
                student.balance -= amount
                db.add(student)

                # 🔔 Push Notification
                try:
                    from app.core.background_tasks import notify_new_invoice
                    
                    # Use direct query to avoid lazy loading issues
                    guardian = db.query(StudentGuardian).filter(StudentGuardian.student_id == student.id).first()
                    
                    parent_user_id = None
                    parent_lang = "ro"
                    
                    if guardian:
                            parent_user_id = guardian.user_id
                            parent_user = db.query(User).filter(User.id == guardian.user_id).first()
                            if parent_user:
                                parent_lang = getattr(parent_user, 'preferred_language', 'ro')

                    if parent_user_id:
                        month_name = get_month_name_ru(invoice_data.payment_period.month)
                        background_tasks.add_task(
                            notify_new_invoice,
                            student_id=student.id,
                            amount=amount,
                            month_name=month_name,
                            user_id=parent_user_id,
                            lang=parent_lang
                        )
                except Exception as e:
                    # Log error but continue
                    print(f"Error queuing notification for student {student.id}: {e}")
            except Exception as inner_e:
                print(f"Error processing student {student.id}: {inner_e}")
                continue

        # Log creation in audit
        if created_payments:
            try:
                for p in created_payments:
                    db.flush()
                    log_create(db, "payment", p, user=current_user)
            except Exception as audit_e:
                print(f"Audit log error: {audit_e}")
                # Continue without audit log if it fails (e.g. missing table)

        db.commit()

        # Обновляем платежи для возврата
        for p in created_payments:
            db.refresh(p)
        for p in updated_payments:
            db.refresh(p)
            
    except Exception as e:
        print(f"CRITICAL ERROR in invoice_group: {e}")
        import traceback
        traceback.print_exc()
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal Server Error: {str(e)}"
        )
    
    except Exception as e:
        print(f"CRITICAL ERROR in invoice_group: {e}")
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Internal Server Error: {str(e)}"
        )
    finally:
        # Ensure db session is closed or handled if not using dependency injection (which handles it)
        pass

    return InvoiceResult(
        success=True,
        created_count=len(created_payments),
        skipped_count=skipped_count,
        message=f"Выставлено {len(created_payments)} счетов, обновлено {len(updated_payments)}, пропущено {skipped_count}",
        payments=[*created_payments, *updated_payments]
    )


@router.post("/invoice/student/{student_id}", response_model=PaymentResponse)
async def invoice_student(
    student_id: int,
    invoice_data: InvoiceStudentRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Payment:
    """
    📝 Индивидуальное выставление счета ученику (Вариант Б).
    
    Создает pending платеж для конкретного ученика.
    
    Доступ: super_admin, admin
    """
    user_role = current_user.role.lower() if current_user.role else ""
    if user_role not in ["super_admin", "admin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Недостаточно прав"
        )
    
    # Eager load guardians to prevent N+1 and handle notifications efficiently
    student = db.query(Student).options(
        joinedload(Student.guardians).joinedload(StudentGuardian.user)
    ).filter(Student.id == student_id).first()
    
    if not student:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Ученик не найден"
        )
    
    # Проверяем, нет ли уже счета (по всему месяцу)
    try:
        period_start, period_end = get_month_range(invoice_data.payment_period)
    except Exception as e:
        # Fallback if date logic fails
        period_start = invoice_data.payment_period.replace(day=1)
        import calendar
        last_day = calendar.monthrange(period_start.year, period_start.month)[1]
        period_end = period_start.replace(day=last_day)
    
    existing = db.query(Payment).filter(
        Payment.student_id == student_id,
        Payment.payment_period >= period_start,
        Payment.payment_period <= period_end,
        Payment.deleted_at.is_(None)
    ).first()
    
    if existing:
        status_msg = "оплачен" if existing.status == 'completed' else "выставлен"
        month_name = get_month_name_ru(invoice_data.payment_period.month)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Счет за {month_name} {invoice_data.payment_period.year} уже {status_msg}"
        )
    
    try:
        month_name = get_month_name_ru(invoice_data.payment_period.month)
        description = invoice_data.description or f"Счет за {month_name} {invoice_data.payment_period.year}"
    except:
        description = invoice_data.description or f"Счет за {invoice_data.payment_period.strftime('%Y-%m')}"

    payment = Payment(
        student_id=student_id,
        amount=invoice_data.amount,
        payment_date=date.today(),
        payment_period=invoice_data.payment_period,
        method=None,  # Метод будет установлен при подтверждении
        status="pending",
        description=description
    )
    db.add(payment)
    
    student.is_debtor = True
    # Ensure balance is not None before subtracting
    current_balance = student.balance or 0.0
    student.balance = current_balance - invoice_data.amount
    db.add(student)
    
    # 🔔 Push Notification (Wrapped in try-except for safety)
    try:
        from app.core.background_tasks import notify_new_invoice
        
        # Find parent
        parent_user_id = None
        parent_lang = "ro"
        
        if student.guardians:
            # Check if user exists
            guardian = student.guardians[0]
            if guardian and guardian.user:
                parent_user_id = guardian.user_id
                parent_lang = getattr(guardian.user, 'preferred_language', 'ro')
        
        if parent_user_id:
            month_name = get_month_name_ru(invoice_data.payment_period.month)
            background_tasks.add_task(
                notify_new_invoice,
                student_id=student.id,
                amount=invoice_data.amount,
                month_name=month_name,
                user_id=parent_user_id,
                lang=parent_lang
            )
    except Exception as e:
        print(f"Error queuing notification for invoice: {e}")
        # Do not fail the request if notification fails
    
    # Log creation in audit
    try:
        db.flush()
        db.refresh(payment)
        log_create(db, "payment", payment, user=current_user)
    except Exception as e:
        print(f"Audit log failed: {e}")

    db.commit()
    
    return payment


@router.put("/{payment_id}/confirm", response_model=PaymentResponse)
async def confirm_payment(
    payment_id: int,
    confirm_data: PaymentConfirm,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Payment:
    """
    ✅ Подтверждение оплаты администратором.
    
    Меняет статус pending -> completed.
    Обновляет баланс ученика и снимает флаг должника.
    
    Доступ: super_admin, admin
    """
    user_role = current_user.role.lower() if current_user.role else ""
    if user_role not in ["super_admin", "admin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Недостаточно прав"
        )
    
    payment = db.query(Payment).filter(Payment.id == payment_id).first()
    if not payment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Платеж не найден"
        )
    
    if payment.status == "completed":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Платеж уже подтвержден"
        )
    
    # Save old data for audit
    old_data = entity_to_dict(payment)

    # Обновляем платеж
    payment.status = "completed"
    payment.method = confirm_data.method
    payment.reference_id = confirm_data.reference_id
    payment.payment_date = date.today()
    db.add(payment)
    
    # Обновляем ученика
    student = db.query(Student).filter(Student.id == payment.student_id).first()
    if student:
        if student.balance is None:
            student.balance = 0.0
        student.balance += payment.amount
        
        # Проверяем, есть ли еще pending платежи
        pending_count = db.query(Payment).filter(
            Payment.student_id == student.id,
            Payment.status == "pending"
        ).count()
        
        if pending_count == 0:
            student.is_debtor = False
        
        # Обновляем subscription_expires
        if payment.payment_period:
            import calendar
            last_day = calendar.monthrange(payment.payment_period.year, payment.payment_period.month)[1]
            new_expiry = payment.payment_period.replace(day=last_day)
            if not student.subscription_expires or new_expiry > student.subscription_expires:
                student.subscription_expires = new_expiry
        
        # 🔔 Push Notification for parent
        
        # Find parent
        parent_user_id = None
        parent_lang = "ro"
        
        if student.guardians:
            parent_user_id = student.guardians[0].user_id
            if student.guardians[0].user:
                parent_lang = getattr(student.guardians[0].user, 'preferred_language', 'ro')
        
        if parent_user_id:
            background_tasks.add_task(
                notify_payment_confirmed,
                student_id=student.id,
                amount=payment.amount,
                user_id=parent_user_id,
                lang=parent_lang
            )
        
        db.add(student)
        update_student_payment_cache(student, db)
        
        # Отправляем уведомление
        parent_phone = student.parent_phone
        if not parent_phone and student.guardians:
            guardian = student.guardians[0]
            if guardian.user:
                parent_phone = guardian.user.phone
        
        if parent_phone:
            background_tasks.add_task(
                send_payment_notification,
                student.id,
                parent_phone,
                payment.amount,
                str(payment.payment_date),
                "ru"
            )
    
    # Log update in audit
    log_update(db, "payment", payment, old_data, user=current_user)

    db.commit()
    db.refresh(payment)
    
    return payment
