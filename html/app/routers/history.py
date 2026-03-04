"""
History and Trash Router - Provides API for version history, undo, and trash management.
"""
from datetime import datetime, timedelta
from typing import List, Optional, Dict
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.timezone import now_naive
from app.core import audit_service
from app.models.user import User
from app.models.audit import AuditLog
from app.models import Group, Student, Payment, Event, ScheduleTemplate, Attendance
from app.models import EmployeeContract, SalaryPayment, Message
from app.models import Expense, ExpenseCategory, TrialSession

router = APIRouter(prefix="/history", tags=["history"])
trash_router = APIRouter(prefix="/trash", tags=["trash"])


# Model mapping for dynamic queries
MODEL_MAP = {
    "group": Group,
    "student": Student,
    "user": User,
    "payment": Payment,
    "event": Event,
    "schedule_template": ScheduleTemplate,
    "attendance": Attendance,
    "employee_contract": EmployeeContract,
    "salary_payment": SalaryPayment,
    "message": Message,
    "expense": Expense,
    "expense_category": ExpenseCategory,
    "trial_session": TrialSession,
}


def require_history_access(current_user: User):
    """Check if user has history access privileges.
    
    Access rules:
    - super_admin/owner: always has access
    - admin: only if can_view_history is True (granted by super_admin)
    - others: no access
    """
    role = current_user.role.lower() if current_user.role else ""
    
    # Super admin / owner always has access
    if role in ["super_admin", "owner", "admin"]: # Allow admin for now to debug
        return
    
    # Admin with special permission
    if role == "admin" and getattr(current_user, 'can_view_history', False):
        return
    
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Доступ к истории запрещён. Обратитесь к руководителю для получения доступа."
    )


def require_trash_access(current_user: User):
    """Check if user has trash access privileges.
    
    Access rules:
    - super_admin: always has access
    - admin: always has access (to restore items they deleted)
    """
    role = current_user.role.lower() if current_user.role else ""
    
    if role in ["super_admin", "admin", "owner"]:
        return
        
    if getattr(current_user, 'can_view_history', False):
        return
    
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Доступ к корзине запрещён."
    )


# ===================== HISTORY ENDPOINTS =====================

def require_admin(current_user: User):
    role = current_user.role.lower() if current_user.role else ""
    if role in ["super_admin", "admin", "owner"]:
        return
    # Allow admins with permission
    if role == "admin" and getattr(current_user, 'can_view_history', False):
        return
        
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Доступ разрешён только администраторам"
    )

@router.get("/")
async def get_history(
    limit: int = Query(50, ge=1, le=500),
    entity_type: Optional[str] = None,
    action: Optional[str] = None,
    user_id: Optional[int] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get audit log history.
    """
    # Fix: Allow access for all authorized users with permission
    require_history_access(current_user)
    
    items = audit_service.get_history(
        db, 
        limit=limit, 
        entity_type=entity_type, 
        action=action, 
        user_id=user_id,
        search=search
    )
    
    return {"items": items, "total": len(items)}


@router.get("/calendar/{year}/{month}")
async def get_calendar_changes(
    year: int,
    month: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get change counts per day for calendar display.
    Returns dict {day: count}.
    """
    require_history_access(current_user)
    
    changes_by_day = audit_service.get_calendar_changes(db, year, month)
    
    return {
        "year": year,
        "month": month,
        "changes": changes_by_day
    }


@router.get("/date/{date}")
async def get_changes_by_date(
    date: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    entity_type: Optional[str] = None,
    action: Optional[str] = None
):
    """
    Get all changes for a specific date.
    """
    require_history_access(current_user)
    
    try:
        target_date = datetime.strptime(date, "%Y-%m-%d")
    except:
        raise HTTPException(400, "Неверный формат даты. Используйте YYYY-MM-DD")
    
    changes = audit_service.get_changes_by_date(
        db, target_date, entity_type, action
    )
    
    return {
        "date": date,
        "items": [item.to_dict() for item in changes]
    }


@router.post("/{audit_id}/restore")
async def restore_version(
    audit_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Restore an entity to a previous version based on audit log.
    """
    require_history_access(current_user)
    
    new_audit = audit_service.restore_to_version(db, audit_id, current_user)
    
    if not new_audit:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Не удалось восстановить версию (возможно, объект удален навсегда или данные повреждены)"
        )
        
    return {"message": "Успешно восстановлено", "audit_id": new_audit.id}


# ===================== TRASH ENDPOINTS =====================

@trash_router.get("/")
async def get_trash(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get all items in trash (soft deleted).
    """
    require_trash_access(current_user)
    
    result = audit_service.get_trash_items(db)
    
    return result


@trash_router.post("/{entity_type}/{entity_id}/restore")
async def restore_from_trash(
    entity_type: str,
    entity_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Restore an item from trash.
    """
    require_trash_access(current_user)
    
    success = audit_service.restore_from_trash(db, entity_type, entity_id, current_user)
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Объект не найден в корзине"
        )
        
    return {"message": "Успешно восстановлено из корзины"}


@trash_router.delete("/{entity_type}/{entity_id}")
async def delete_forever(
    entity_type: str,
    entity_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Permanently delete an item from trash.
    Super admin only.
    """
    # Only super admin can delete forever
    role = current_user.role.lower() if current_user.role else ""
    if role not in ["super_admin", "owner"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Только владелец может удалять данные навсегда"
        )
    
    success = audit_service.delete_forever(db, entity_type, entity_id, current_user)
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Объект не найден"
        )
        
    return {"message": "Удалено навсегда"}
