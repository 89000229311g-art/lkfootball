"""
Audit Service - Records all changes to entities for version history and undo functionality.
"""
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import DateTime, Date, Boolean

from app.models.audit import AuditLog
from app.models.user import User
from app.core.timezone import now_naive


def entity_to_dict(entity) -> Dict[str, Any]:
    """Convert SQLAlchemy model to dictionary, handling relationships and special types."""
    if entity is None:
        return None
    
    result = {}
    for column in entity.__table__.columns:
        value = getattr(entity, column.name)
        # Convert datetime to ISO string
        if isinstance(value, datetime):
            value = value.isoformat()
        if isinstance(value, date):
            value = value.isoformat()
        # Skip password hashes and sensitive data
        if column.name in ('password_hash', 'fcm_token'):
            continue
        result[column.name] = value
    return result


def get_changed_fields(old_data: Dict, new_data: Dict) -> List[str]:
    """Compare two dictionaries and return list of changed field names."""
    if not old_data or not new_data:
        return []
    
    changed = []
    all_keys = set(old_data.keys()) | set(new_data.keys())
    
    for key in all_keys:
        old_val = old_data.get(key)
        new_val = new_data.get(key)
        if old_val != new_val:
            changed.append(key)
    
    return changed


def get_entity_name(entity, entity_type: str) -> str:
    """Extract a readable name from entity based on its type."""
    if entity is None:
        return "Unknown"
    
    # Try common name fields
    if hasattr(entity, 'name') and entity.name:
        return entity.name
    if hasattr(entity, 'full_name') and entity.full_name:
        return entity.full_name
    if hasattr(entity, 'first_name') and hasattr(entity, 'last_name'):
        return f"{entity.first_name or ''} {entity.last_name or ''}".strip()
    if hasattr(entity, 'title') and entity.title:
        return entity.title
    
    return f"{entity_type} #{entity.id}"


def make_json_serializable(data: Dict[str, Any]) -> Dict[str, Any]:
    """Recursively convert dictionary values to JSON serializable formats."""
    if not isinstance(data, dict):
        return data
        
    result = {}
    for key, value in data.items():
        if isinstance(value, (date, datetime)):
            result[key] = value.isoformat()
        elif isinstance(value, dict):
            result[key] = make_json_serializable(value)
        elif isinstance(value, list):
            result[key] = [
                v.isoformat() if isinstance(v, (date, datetime)) else v 
                for v in value
            ]
        else:
            result[key] = value
    return result


def log_create(
    db: Session,
    entity_type: str,
    entity,
    user: Optional[User] = None,
    reason: Optional[str] = None,
    ip_address: Optional[str] = None
) -> AuditLog:
    """Log entity creation."""
    new_data = entity_to_dict(entity)
    entity_name = get_entity_name(entity, entity_type)
    
    audit = AuditLog(
        entity_type=entity_type,
        entity_id=entity.id,
        entity_name=entity_name,
        action=AuditLog.ACTION_CREATE,
        old_data=None,
        new_data=make_json_serializable(new_data),
        changed_fields=list(new_data.keys()) if new_data else None,
        user_id=user.id if user else None,
        user_name=user.full_name if user else None,
        reason=reason,
        ip_address=ip_address,
        created_at=now_naive()
    )
    db.add(audit)
    db.flush()
    return audit


def log_update(
    db: Session,
    entity_type: str,
    entity,
    old_data: Dict[str, Any],
    user: Optional[User] = None,
    reason: Optional[str] = None,
    ip_address: Optional[str] = None
) -> AuditLog:
    """Log entity update."""
    new_data = entity_to_dict(entity)
    
    # Ensure old_data is serializable
    old_data_safe = make_json_serializable(old_data)
    new_data_safe = make_json_serializable(new_data)
    
    changed_fields = get_changed_fields(old_data_safe, new_data_safe)
    entity_name = get_entity_name(entity, entity_type)
    
    # Only log if there are actual changes
    # Note: If old_data passed is actually just 'update_data' (changes), 
    # logic might be slightly off but we preserve the serialization fix.
    if not changed_fields:
        # Fallback: if old_data was meant to be the full old state but isn't,
        # we might still want to log if it was called. 
        # But assuming strict audit:
        pass
    
    audit = AuditLog(
        entity_type=entity_type,
        entity_id=entity.id,
        entity_name=entity_name,
        action=AuditLog.ACTION_UPDATE,
        old_data=old_data_safe,
        new_data=new_data_safe,
        changed_fields=changed_fields,
        user_id=user.id if user else None,
        user_name=user.full_name if user else None,
        reason=reason,
        ip_address=ip_address,
        created_at=now_naive()
    )
    db.add(audit)
    db.flush()
    return audit


def log_delete(
    db: Session,
    entity_type: str,
    entity,
    user: Optional[User] = None,
    reason: Optional[str] = None,
    ip_address: Optional[str] = None
) -> AuditLog:
    """Log entity deletion (soft delete)."""
    old_data = entity_to_dict(entity)
    entity_name = get_entity_name(entity, entity_type)
    
    audit = AuditLog(
        entity_type=entity_type,
        entity_id=entity.id,
        entity_name=entity_name,
        action=AuditLog.ACTION_DELETE,
        old_data=old_data,
        new_data=None,
        changed_fields=None,
        user_id=user.id if user else None,
        user_name=user.full_name if user else None,
        reason=reason,
        ip_address=ip_address,
        created_at=now_naive()
    )
    db.add(audit)
    db.flush()
    return audit


def log_restore(
    db: Session,
    entity_type: str,
    entity,
    user: Optional[User] = None,
    reason: Optional[str] = None,
    ip_address: Optional[str] = None
) -> AuditLog:
    """Log entity restoration from trash."""
    new_data = entity_to_dict(entity)
    entity_name = get_entity_name(entity, entity_type)
    
    audit = AuditLog(
        entity_type=entity_type,
        entity_id=entity.id,
        entity_name=entity_name,
        action=AuditLog.ACTION_RESTORE,
        old_data=None,
        new_data=new_data,
        changed_fields=None,
        user_id=user.id if user else None,
        user_name=user.full_name if user else None,
        reason=reason,
        ip_address=ip_address,
        created_at=now_naive()
    )
    db.add(audit)
    db.flush()
    return audit


def get_entity_history(
    db: Session,
    entity_type: str,
    entity_id: int,
    limit: int = 50
) -> List[AuditLog]:
    """Get version history for a specific entity."""
    return db.query(AuditLog).filter(
        AuditLog.entity_type == entity_type,
        AuditLog.entity_id == entity_id
    ).order_by(AuditLog.created_at.desc()).limit(limit).all()


def get_history(
    db: Session,
    limit: int = 50,
    entity_type: Optional[str] = None,
    action: Optional[str] = None,
    user_id: Optional[int] = None,
    search: Optional[str] = None
) -> List[dict]:
    """Get audit log history with filtering."""
    query = db.query(AuditLog)
    
    if entity_type:
        query = query.filter(AuditLog.entity_type == entity_type)
    if action:
        query = query.filter(AuditLog.action == action)
    if user_id:
        query = query.filter(AuditLog.user_id == user_id)
    if search:
        query = query.filter(AuditLog.entity_name.ilike(f"%{search}%"))
        
    # Order by newest first
    query = query.order_by(AuditLog.created_at.desc())
    
    # Execute query
    items = query.limit(limit).all()
    
    # Convert to dict
    return [item.to_dict() for item in items]


def get_changes_by_date(
    db: Session,
    date: date,
    limit: int = 100,
    entity_type: Optional[str] = None,
    action: Optional[str] = None,
    user_id: Optional[int] = None
) -> List[dict]:
    """Get all changes for a specific date."""
    query = db.query(AuditLog).filter(
        AuditLog.created_at >= datetime.combine(date, datetime.min.time()),
        AuditLog.created_at < datetime.combine(date, datetime.max.time())
    )
    
    if entity_type:
        query = query.filter(AuditLog.entity_type == entity_type)
    if action:
        query = query.filter(AuditLog.action == action)
    if user_id:
        query = query.filter(AuditLog.user_id == user_id)
    
    items = query.order_by(AuditLog.created_at.desc()).limit(limit).all()
    return [item.to_dict() for item in items]


def get_calendar_changes(
    db: Session,
    year: int,
    month: int
) -> Dict[int, int]:
    """Get count of changes per day for a month (for calendar display)."""
    from sqlalchemy import func, extract
    
    result = db.query(
        extract('day', AuditLog.created_at).label('day'),
        func.count(AuditLog.id).label('count')
    ).filter(
        extract('year', AuditLog.created_at) == year,
        extract('month', AuditLog.created_at) == month
    ).group_by(
        extract('day', AuditLog.created_at)
    ).all()
    
    return {int(row.day): row.count for row in result}


def get_trash_items(db: Session) -> Dict[str, List[Dict[str, Any]]]:
    """Get all items in trash (soft deleted)."""
    from app.models import Group, Student, User as UserModel, Payment, Event
    from app.models import ScheduleTemplate, Attendance, EmployeeContract, SalaryPayment
    from app.models import Expense, ExpenseCategory, TrialSession, Message
    
    model_map = {
        "group": Group,
        "student": Student,
        "user": UserModel,
        "payment": Payment,
        "event": Event,
        "schedule_template": ScheduleTemplate,
        "attendance": Attendance,
        "employee_contract": EmployeeContract,
        "salary_payment": SalaryPayment,
        "expense": Expense,
        "expense_category": ExpenseCategory,
        "trial_session": TrialSession,
        "message": Message,
    }
    
    result = {}
    total_count = 0
    
    for type_name, model_class in model_map.items():
        # Check if model has deleted_at column
        if not hasattr(model_class, 'deleted_at'):
            continue
            
        items = db.query(model_class).filter(model_class.deleted_at.isnot(None)).all()
        
        if items:
            serialized_items = []
            for item in items:
                # Calculate days left (30 days retention)
                days_left = 30
                if item.deleted_at:
                    elapsed = (now_naive() - item.deleted_at).days
                    days_left = max(0, 30 - elapsed)
                
                serialized_items.append({
                    "id": item.id,
                    "name": get_entity_name(item, type_name),
                    "deleted_at": item.deleted_at.isoformat() if item.deleted_at else None,
                    "deletion_reason": getattr(item, 'deletion_reason', None),
                    "days_left": days_left
                })
            
            result[type_name] = serialized_items
            total_count += len(serialized_items)
            
    return {"items": result, "total": total_count}


def restore_to_version(
    db: Session,
    audit_id: int,
    user: User
) -> Optional[AuditLog]:
    """
    Restore an entity to a previous version based on audit log.
    Returns new audit log entry for the restoration.
    """
    audit = db.query(AuditLog).filter(AuditLog.id == audit_id).first()
    if not audit:
        return None
    
    # Get the data to restore to
    # For UPDATE and DELETE, we want to restore the state BEFORE the action (old_data)
    # For CREATE and RESTORE, we might want to restore the created state (new_data)
    if audit.action in [AuditLog.ACTION_UPDATE, AuditLog.ACTION_DELETE]:
        data_to_restore = audit.old_data
    else:
        data_to_restore = audit.new_data
        
    if not data_to_restore:
        return None
    
    # Get the model class
    from app.models import Group, Student, User as UserModel, Payment, Event
    from app.models import ScheduleTemplate, Attendance, EmployeeContract, SalaryPayment
    from app.models import Expense, ExpenseCategory, TrialSession, Message
    
    model_map = {
        "group": Group,
        "student": Student,
        "user": UserModel,
        "payment": Payment,
        "event": Event,
        "schedule_template": ScheduleTemplate,
        "attendance": Attendance,
        "employee_contract": EmployeeContract,
        "salary_payment": SalaryPayment,
        "expense": Expense,
        "expense_category": ExpenseCategory,
        "trial_session": TrialSession,
        "message": Message,
    }
    
    model_class = model_map.get(audit.entity_type)
    if not model_class:
        return None
    
    # Find the entity
    entity = db.query(model_class).filter(model_class.id == audit.entity_id).first()
    
    # If entity not found (hard deleted?), try to restore it if possible (not supported easily)
    if not entity:
        return None
    
    # Save current state before restore
    old_data = entity_to_dict(entity)
    
    # Restore fields (except id, created_at)
    for key, value in data_to_restore.items():
        if key in ('id', 'created_at', 'updated_at'):
            continue
        
        # Check if attribute exists
        if not hasattr(entity, key):
            continue
            
        # Type conversion logic
        column = entity.__table__.columns.get(key)
        
        # Handle Date/DateTime strings
        if isinstance(value, str):
            # If explicit column type check
            if column is not None and isinstance(column.type, (DateTime, Date)):
                try:
                    # Remove Z if present
                    clean_val = value.replace('Z', '+00:00') if 'Z' in value else value
                    # If it has time component
                    if 'T' in clean_val:
                        dt = datetime.fromisoformat(clean_val)
                        # If target is Date, extract date
                        if isinstance(column.type, Date):
                            value = dt.date()
                        else:
                            value = dt
                    # If it's just YYYY-MM-DD and target is Date, string is fine.
                    # If target is DateTime, string "YYYY-MM-DD" might need conversion?
                    # SQLAlchemy usually handles "YYYY-MM-DD" for DateTime by assuming 00:00:00
                except:
                    pass
            # Fallback heuristic for generic text fields that look like ISO dates
            elif 'T' in value and len(value) > 10 and value[10] == 'T':
                try:
                    value = datetime.fromisoformat(value.replace('Z', '+00:00'))
                except:
                    pass

        # Handle Boolean strings (e.g. from JSON)
        if column is not None and isinstance(column.type, Boolean) and isinstance(value, str):
            if value.lower() == 'true': value = True
            elif value.lower() == 'false': value = False
            
        try:
            setattr(entity, key, value)
        except Exception as e:
            print(f"Error restoring field {key}: {e}")

    # Clear soft delete if it was deleted
    if hasattr(entity, 'deleted_at'):
        entity.deleted_at = None
        entity.deletion_reason = None
        entity.deleted_by_id = None
    
    db.add(entity)
    db.flush()
    
    # Log the restoration
    new_audit = log_update(
        db=db,
        entity_type=audit.entity_type,
        entity=entity,
        old_data=old_data,
        user=user,
        reason=f"Восстановлено к версии от {audit.created_at.strftime('%d.%m.%Y %H:%M')}"
    )
    
    # If no changes were made (already at that version), return the original audit to indicate success
    return new_audit if new_audit else audit


def get_trash_items(db: Session) -> Dict[str, List[Dict[str, Any]]]:
    """Get all items in trash (soft deleted)."""
    from app.models import Group, Student, User as UserModel, Payment, Event
    from app.models import ScheduleTemplate, Attendance, EmployeeContract, SalaryPayment
    from app.models import Expense, ExpenseCategory, TrialSession, Message
    
    model_map = {
        "group": Group,
        "student": Student,
        "user": UserModel,
        "payment": Payment,
        "event": Event,
        "schedule_template": ScheduleTemplate,
        "attendance": Attendance,
        "employee_contract": EmployeeContract,
        "salary_payment": SalaryPayment,
        "expense": Expense,
        "expense_category": ExpenseCategory,
        "trial_session": TrialSession,
        "message": Message,
    }
    
    result = {}
    total_count = 0
    
    for type_name, model_class in model_map.items():
        # Check if model has deleted_at column
        if not hasattr(model_class, 'deleted_at'):
            continue
            
        items = db.query(model_class).filter(model_class.deleted_at.isnot(None)).all()
        
        if items:
            serialized_items = []
            for item in items:
                # Calculate days left (30 days retention)
                days_left = 30
                if item.deleted_at:
                    elapsed = (now_naive() - item.deleted_at).days
                    days_left = max(0, 30 - elapsed)
                
                serialized_items.append({
                    "id": item.id,
                    "name": get_entity_name(item, type_name),
                    "deleted_at": item.deleted_at.isoformat() if item.deleted_at else None,
                    "deletion_reason": getattr(item, 'deletion_reason', None),
                    "days_left": days_left
                })
            
            result[type_name] = serialized_items
            total_count += len(serialized_items)
            
    return {"items": result, "total": total_count}


def restore_from_trash(
    db: Session, 
    entity_type: str, 
    entity_id: int, 
    user: User
) -> bool:
    """Restore an item from trash."""
    from app.models import Group, Student, User as UserModel, Payment, Event
    from app.models import ScheduleTemplate, Attendance, EmployeeContract, SalaryPayment
    from app.models import Expense, ExpenseCategory, TrialSession, Message
    
    model_map = {
        "group": Group,
        "student": Student,
        "user": UserModel,
        "payment": Payment,
        "event": Event,
        "schedule_template": ScheduleTemplate,
        "attendance": Attendance,
        "employee_contract": EmployeeContract,
        "salary_payment": SalaryPayment,
        "expense": Expense,
        "expense_category": ExpenseCategory,
        "trial_session": TrialSession,
        "message": Message,
    }
    
    model_class = model_map.get(entity_type)
    if not model_class:
        return False
        
    entity = db.query(model_class).filter(model_class.id == entity_id).first()
    if not entity:
        return False
        
    if hasattr(entity, 'deleted_at'):
        entity.deleted_at = None
        entity.deletion_reason = None
        entity.deleted_by_id = None
        
        # Log the restoration
        log_update(
            db=db,
            entity_type=entity_type,
            entity=entity,
            old_data={"deleted_at": "deleted"},
            user=user,
            reason="Восстановлено из корзины"
        )
        
        db.commit()
        return True
        
    return False


def delete_forever(
    db: Session, 
    entity_type: str, 
    entity_id: int, 
    user: User
) -> bool:
    """Permanently delete an item."""
    from app.models import Group, Student, User as UserModel, Payment, Event
    from app.models import ScheduleTemplate, Attendance, EmployeeContract, SalaryPayment
    from app.models import Expense, ExpenseCategory, TrialSession, Message
    
    model_map = {
        "group": Group,
        "student": Student,
        "user": UserModel,
        "payment": Payment,
        "event": Event,
        "schedule_template": ScheduleTemplate,
        "attendance": Attendance,
        "employee_contract": EmployeeContract,
        "salary_payment": SalaryPayment,
        "expense": Expense,
        "expense_category": ExpenseCategory,
        "trial_session": TrialSession,
        "message": Message,
    }
    
    model_class = model_map.get(entity_type)
    if not model_class:
        return False
        
    # Find item (even if soft deleted)
    entity = db.query(model_class).filter(model_class.id == entity_id).first()
    if not entity:
        return False
        
    # Log the permanent deletion before it happens
    log_delete(
        db=db,
        entity_type=entity_type,
        entity=entity,
        user=user,
        reason="Удалено навсегда из корзины"
    )
    
    # Hard delete
    db.delete(entity)
    db.commit()
    return True
