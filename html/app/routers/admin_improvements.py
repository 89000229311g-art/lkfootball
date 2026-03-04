"""
Admin Improvements Router:
- Debtors list with contacts
- Bulk operations (mass group change, status change)
- Excel/PDF export
- Business analytics
- Group capacity tracking
"""

from typing import List, Optional
from datetime import date, datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, status, Query, BackgroundTasks
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, extract, and_, or_
import io
import os
import glob
import psutil
import time
from sqlalchemy import text
from app.core.deps import get_db, get_current_user
from app.core.audit_service import log_create, log_update, entity_to_dict
from app.core.background_tasks import send_debt_reminder
from app.models import (
    User, Student, Group, Payment, Attendance, AttendanceStatus,
    StudentGuardian, TrialSession, Expense, ExpenseCategory, FreezeRequest, FreezeRequestStatus,
    Event, ScheduleTemplate, EmployeeContract, SalaryPayment, Message, AuditLog
)
from app.models.user_activity import UserActivityLog
from app.core.cache import cache_manager

router = APIRouter()


# ==================== SYSTEM HEALTH & CLEANUP ====================

@router.get("/system/stats")
async def get_system_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get system health statistics (DB size, cache, logs, trash).
    Super Admin / Owner only.
    """
    if current_user.role.lower() not in ["super_admin", "owner"]:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    
    stats = {
        "database": {},
        "files": {},
        "cache": {},
        "trash": {}
    }
    
    # 1. Database Stats
    # Count rows in key tables
    stats["database"]["audit_logs"] = db.query(AuditLog).count()
    stats["database"]["messages"] = db.query(Message).count()
    stats["database"]["students"] = db.query(Student).count()
    stats["database"]["payments"] = db.query(Payment).count()
    
    # DB Size (Postgres)
    try:
        db_size_query = text("SELECT pg_size_pretty(pg_database_size(current_database()));")
        result = db.execute(db_size_query).scalar()
        stats["database"]["size"] = result
    except Exception:
        stats["database"]["size"] = "N/A"
        
    # 2. Trash Stats (Soft Deleted)
    trash_count = 0
    models_with_soft_delete = [
        Student, Group, User, Payment, Event, ScheduleTemplate, 
        Attendance, EmployeeContract, SalaryPayment, Message, 
        Expense, TrialSession
    ]
    
    trash_details = {}
    for model in models_with_soft_delete:
        try:
            if hasattr(model, 'deleted_at'):
                count = db.query(model).filter(model.deleted_at.isnot(None)).count()
                if count > 0:
                    trash_details[model.__tablename__] = count
                    trash_count += count
        except:
            pass
            
    stats["trash"]["total_items"] = trash_count
    stats["trash"]["details"] = trash_details
    
    # 3. File Stats
    # Logs
    log_dir = os.path.join(os.getcwd(), "logs")
    log_size = 0
    if os.path.exists(log_dir):
        for f in glob.glob(os.path.join(log_dir, "*.log")):
            log_size += os.path.getsize(f)
    stats["files"]["logs_size_mb"] = round(log_size / (1024 * 1024), 2)
    
    # Uploads
    uploads_dir = os.path.join(os.getcwd(), "uploads")
    uploads_size = 0
    if os.path.exists(uploads_dir):
        for root, dirs, files in os.walk(uploads_dir):
            for f in files:
                uploads_size += os.path.getsize(os.path.join(root, f))
    stats["files"]["uploads_size_mb"] = round(uploads_size / (1024 * 1024), 2)
    
    # 4. Cache Stats
    if cache_manager.enabled:
        try:
            info = cache_manager.redis.info()
            stats["cache"]["used_memory_human"] = info.get("used_memory_human", "N/A")
            stats["cache"]["connected_clients"] = info.get("connected_clients", 0)
            stats["cache"]["status"] = "connected"
        except:
             stats["cache"]["status"] = "error"
    else:
        stats["cache"]["status"] = "disabled"
        
    # 5. System Health (Sensor)
    health = {
        "score": 100,
        "status": "healthy", # healthy, warning, critical
        "cpu_percent": 0,
        "ram_percent": 0,
        "process_rss_mb": 0,
        "db_latency_ms": 0,
        "warnings": []
    }
    
    # CPU
    try:
        health["cpu_percent"] = psutil.cpu_percent(interval=0.1)
        if health["cpu_percent"] > 80:
            health["warnings"].append("Высокая нагрузка CPU")
            health["score"] -= 20
        elif health["cpu_percent"] > 60:
            health["score"] -= 10
    except:
        health["cpu_percent"] = -1
        
    # RAM
    try:
        mem = psutil.virtual_memory()
        health["ram_percent"] = mem.percent
        if mem.percent > 90:
            health["warnings"].append("Критическая нехватка памяти")
            health["score"] -= 30
        elif mem.percent > 75:
            health["warnings"].append("Память заканчивается")
            health["score"] -= 15
    except:
        health["ram_percent"] = -1
    
    # Process RSS (Python worker memory)
    try:
        proc = psutil.Process(os.getpid())
        rss = getattr(proc, "memory_info")().rss
        health["process_rss_mb"] = round(rss / (1024 * 1024), 1)
        # Extra warning if a single worker grows too large
        if health["process_rss_mb"] > 1024:
            health["warnings"].append("Один из процессов потребляет >1 ГБ RAM")
            health["score"] -= 10
    except:
        pass
        
    # DB Latency
    try:
        start_time = time.time()
        db.execute(text("SELECT 1"))
        latency = (time.time() - start_time) * 1000 # ms
        health["db_latency_ms"] = round(latency, 2)
        
        if latency > 500:
            health["warnings"].append("Медленный отклик БД")
            health["score"] -= 20
        elif latency > 100:
            health["score"] -= 5
    except Exception as e:
        health["db_latency_ms"] = -1
        health["warnings"].append("Ошибка подключения к БД")
        health["score"] -= 50
        
    # Logs (Errors)
    try:
        if os.path.exists(log_dir):
            frontend_log = os.path.join(log_dir, "frontend_errors.log")
            if os.path.exists(frontend_log):
                # Count errors in last 100 lines roughly
                with open(frontend_log, 'r') as f:
                    lines = f.readlines()[-100:]
                    error_count = sum(1 for line in lines if "ERROR" in line or "Exception" in line)
                    if error_count > 10:
                        health["warnings"].append(f"Много ошибок в логах ({error_count}+)")
                        health["score"] -= 10
    except:
        pass
        
    # Normalize Score
    health["score"] = max(0, min(100, health["score"]))
    
    if health["score"] < 50:
        health["status"] = "critical"
    elif health["score"] < 80:
        health["status"] = "warning"
        
    stats["health"] = health
        
    return stats


@router.get("/system/activity-stats")
async def get_activity_stats(
    days: int = Query(30, description="Number of days to analyze"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    📊 Get user activity statistics.
    - Daily Active Users (DAU)
    - Device distribution
    - User role distribution
    - Recent logins
    """
    if current_user.role.lower() not in ["super_admin", "owner", "admin"]:
        raise HTTPException(status_code=403, detail="Not enough permissions")
        
    start_date = datetime.utcnow() - timedelta(days=days)
    
    # 1. Daily Logins
    daily_stats = db.query(
        func.date(UserActivityLog.login_time).label('date'),
        func.count(UserActivityLog.id).label('count'),
        func.count(func.distinct(UserActivityLog.user_id)).label('unique_users')
    ).filter(
        UserActivityLog.login_time >= start_date
    ).group_by(
        func.date(UserActivityLog.login_time)
    ).order_by(
        func.date(UserActivityLog.login_time)
    ).all()
    
    daily_data = [
        {"date": str(d.date), "logins": d.count, "users": d.unique_users} 
        for d in daily_stats
    ]
    
    # 2. Device Distribution
    devices = db.query(
        UserActivityLog.device_type,
        func.count(UserActivityLog.id)
    ).filter(
        UserActivityLog.login_time >= start_date
    ).group_by(
        UserActivityLog.device_type
    ).all()
    
    device_data = [{"device_type": d[0] or "unknown", "count": d[1]} for d in devices]
    
    # 3. Recent Logins (Last 20)
    recent_logins = db.query(UserActivityLog).options(
        joinedload(UserActivityLog.user)
    ).order_by(
        UserActivityLog.login_time.desc()
    ).limit(20).all()
    
    recent_data = []
    for log in recent_logins:
        if log.user:
            recent_data.append({
                "id": log.id,
                "user_name": log.user.full_name,
                "user_role": log.user.role,
                "login_time": log.login_time,
                "device": log.device_type,
                "platform": log.platform,
                "ip": log.ip_address
            })
            
    # 4. Role Distribution (Active Users in period)
    roles = db.query(
        User.role,
        func.count(func.distinct(UserActivityLog.user_id))
    ).join(
        UserActivityLog, User.id == UserActivityLog.user_id
    ).filter(
        UserActivityLog.login_time >= start_date
    ).group_by(
        User.role
    ).all()
    
    role_data = [{"role": r[0], "count": r[1]} for r in roles if r[0]]
    
    # 5. Platform Distribution
    platforms = db.query(
        UserActivityLog.platform,
        func.count(UserActivityLog.id)
    ).filter(
        UserActivityLog.login_time >= start_date
    ).group_by(
        UserActivityLog.platform
    ).all()
    
    platform_data = [{"platform": p[0] or "Unknown", "count": p[1]} for p in platforms]

    # 6. User Stats (Top active users)
    user_activity = db.query(
        UserActivityLog.user_id,
        func.count(UserActivityLog.id).label('login_count'),
        func.max(UserActivityLog.login_time).label('last_login')
    ).filter(
        UserActivityLog.login_time >= start_date
    ).group_by(
        UserActivityLog.user_id
    ).order_by(
        func.count(UserActivityLog.id).desc()
    ).limit(50).all()
    
    # Fetch user details manually or via join (optimization: join in the query above)
    # Re-writing query to include user details
    user_stats_query = db.query(
        User.id,
        User.full_name,
        User.role,
        func.count(UserActivityLog.id).label('login_count'),
        func.max(UserActivityLog.login_time).label('last_login')
    ).join(
        UserActivityLog, User.id == UserActivityLog.user_id
    ).filter(
        UserActivityLog.login_time >= start_date
    ).group_by(
        User.id, User.full_name, User.role
    ).order_by(
        func.count(UserActivityLog.id).desc()
    ).limit(50).all()
    
    user_stats_data = [
        {
            "user_id": u.id,
            "name": u.full_name,
            "role": u.role,
            "login_count": u.login_count,
            "last_login": u.last_login
        }
        for u in user_stats_query
    ]

    return {
        "daily_stats": daily_data,
        "device_stats": device_data,
        "platform_stats": platform_data,
        "recent_logins": recent_data,
        "role_stats": role_data,
        "user_stats": user_stats_data,
        "total_logins_period": sum(d['logins'] for d in daily_data)
    }


@router.post("/system/cleanup")
async def cleanup_system(
    action: str = Query(..., description="Action to perform: clear_cache, clear_logs, empty_trash, prune_messages"),
    types: Optional[str] = Query(None, description="Comma-separated list of entity types to delete (for empty_trash)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Perform system cleanup actions.
    Super Admin / Owner only.
    """
    if current_user.role.lower() not in ["super_admin", "owner"]:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    
    result = {"success": True, "message": ""}
    
    if action == "clear_cache":
        if cache_manager.enabled:
            # Use safe clear_all instead of flushdb to avoid clearing shared Redis data
            cache_manager.clear_all()
            result["message"] = "Кэш приложения успешно очищен"
        else:
            result["message"] = "Кэш отключен или недоступен"
            
    elif action == "clear_logs":
        log_dir = os.path.join(os.getcwd(), "logs")
        deleted_files = 0
        if os.path.exists(log_dir):
            # 1. Truncate current logs
            for f in glob.glob(os.path.join(log_dir, "*.log")):
                try:
                    with open(f, 'w') as log_file:
                        log_file.truncate(0)
                except:
                    pass
            
            # 2. Delete old rotated logs (e.g. *.log.1, *.log.2023-*)
            for f in glob.glob(os.path.join(log_dir, "*.log.*")):
                try:
                    os.remove(f)
                    deleted_files += 1
                except:
                    pass
                    
        result["message"] = f"Логи очищены. Удалено старых файлов: {deleted_files}"
        
    elif action == "empty_trash":
        models_with_soft_delete = [
            Student, Group, User, Payment, Event, ScheduleTemplate, 
            Attendance, EmployeeContract, SalaryPayment, Message, 
            Expense, TrialSession
        ]
        
        target_types = types.split(',') if types else None
        
        deleted_count = 0
        for model in models_with_soft_delete:
            try:
                # Check if this model should be processed
                if target_types and model.__tablename__ not in target_types:
                    continue
                    
                if hasattr(model, 'deleted_at'):
                    # Hard delete
                    count = db.query(model).filter(model.deleted_at.isnot(None)).delete(synchronize_session=False)
                    deleted_count += count
            except:
                pass
        db.commit()
        result["message"] = f"Корзина очищена. Удалено объектов: {deleted_count}"
        
    elif action == "prune_messages":
        # Delete messages older than 365 days (policy)
        cutoff = datetime.utcnow() - timedelta(days=365)
        count = db.query(Message).filter(Message.created_at < cutoff).delete(synchronize_session=False)
        db.commit()
        result["message"] = f"Удалено старых сообщений: {count}"
        
    elif action in ["gc_collect", "clear_memory"]:
        # Force garbage collection and cleanup caches
        import gc
        before = 0
        try:
            proc = psutil.Process(os.getpid())
            before = getattr(proc, "memory_info")().rss
        except:
            pass
            
        # Clear application cache safely
        if cache_manager.enabled:
            try:
                cache_manager.clear_all()
            except:
                pass
                
        collected = gc.collect()
        after = before
        try:
            after = psutil.Process(os.getpid()).memory_info().rss
        except:
            pass
        freed_mb = round(max(0, before - after) / (1024 * 1024), 1) if before and after else 0
        result["message"] = f"GC выполнен, собрано объектов: {collected}, освобождено ~{freed_mb} МБ"
        
    else:
        raise HTTPException(status_code=400, detail="Unknown action")
        
    return result


# ==================== DEBTORS LIST ====================

@router.get("/freeze-requests/pending")
async def get_pending_freeze_requests(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> List[dict]:
    """
    Get all pending freeze requests (for admin dashboard).
    """
    if current_user.role.lower() not in ["super_admin", "admin", "owner"]:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    
    requests = db.query(FreezeRequest).options(
        joinedload(FreezeRequest.student).joinedload(Student.group),
        joinedload(FreezeRequest.requested_by)
    ).filter(
        FreezeRequest.status == FreezeRequestStatus.PENDING
    ).order_by(FreezeRequest.created_at.desc()).all()
    
    return [
        {
            "id": r.id,
            "student_id": r.student_id,
            "student": {
                "first_name": r.student.first_name,
                "last_name": r.student.last_name,
                "group_name": r.student.group.name if r.student and r.student.group else "No Group"
            } if r.student else None,
            "start_date": r.start_date,
            "end_date": r.end_date,
            "reason": r.reason,
            "file_url": r.file_url,
            "status": r.status,
            "requested_by": {
                "id": r.requested_by.id,
                "full_name": r.requested_by.full_name
            } if r.requested_by else None,
            "created_at": r.created_at
        }
        for r in requests
    ]

@router.get("/debtors")
async def get_debtors_list(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    min_debt_days: int = Query(0, description="Minimum days overdue"),
    group_id: Optional[int] = Query(None, description="Filter by group")
) -> dict:
    """
    Get list of students with overdue payments.
    Includes parent contacts for easy follow-up.
    Admin/Owner only.
    """
    if current_user.role.lower() not in ["super_admin", "admin"]:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    
    today = date.today()
    current_month = today.replace(day=1)
    
    # Get all active students
    query = db.query(Student).options(
        joinedload(Student.group).joinedload(Group.coach),
        joinedload(Student.guardians).joinedload(StudentGuardian.user),
        joinedload(Student.payments)
    ).filter(Student.status == "active")
    
    if group_id:
        query = query.filter(Student.group_id == group_id)
    
    students = query.all()
    
    debtors = []
    for student in students:
        # Check if payment exists for current month
        current_month_payment = None
        for p in student.payments:
            if p.status == 'completed' and p.payment_period:
                if p.payment_period.year == current_month.year and p.payment_period.month == current_month.month:
                    current_month_payment = p
                    break
        
        if current_month_payment is None:
            # Calculate days overdue (from 1st of month)
            days_overdue = (today - current_month).days
            
            if days_overdue >= min_debt_days:
                # Get guardian contacts
                guardians_info = []
                for g in student.guardians:
                    if g.user:
                        guardians_info.append({
                            "name": g.user.full_name,
                            "phone": g.user.phone,
                            "relationship": g.relationship_type
                        })
                
                # Calculate total debt (unpaid months)
                months_unpaid = 1  # At least current month
                check_month = current_month - timedelta(days=32)
                while check_month >= date(2024, 1, 1):  # Check back to start of 2024
                    month_paid = False
                    for p in student.payments:
                        if p.status == 'completed' and p.payment_period:
                            if p.payment_period.year == check_month.year and p.payment_period.month == check_month.month:
                                month_paid = True
                                break
                    if not month_paid:
                        months_unpaid += 1
                        check_month = check_month.replace(day=1) - timedelta(days=1)
                        check_month = check_month.replace(day=1)
                    else:
                        break
                
                monthly_fee = student.group.monthly_fee if student.group else 0
                
                # Use stored balance (negative means debt) which is accurate after fix
                total_debt = abs(student.balance) if student.balance < -1.0 else 0
                
                # If no real debt, skip even if logic above thought there was absence of payment
                if total_debt == 0:
                    continue

                debtors.append({
                    "student_id": student.id,
                    "student_name": f"{student.first_name} {student.last_name}",
                    "group_name": student.group.name if student.group else "No group",
                    "coach_name": student.group.coach.full_name if student.group and student.group.coach else None,
                    "days_overdue": days_overdue,
                    "months_unpaid": months_unpaid,
                    "monthly_fee": monthly_fee,
                    "total_debt": total_debt,
                    "parent_phone": student.parent_phone,
                    "guardians": guardians_info,
                    "last_payment_date": max([p.created_at for p in student.payments if p.status == 'completed'], default=None)
                })
    
    # Sort by days overdue (most overdue first)
    debtors.sort(key=lambda x: x["days_overdue"], reverse=True)
    
    return {
        "total_debtors": len(debtors),
        "total_debt_amount": sum(d["total_debt"] for d in debtors),
        "debtors": debtors
    }


@router.post("/debtors/remind-all")
async def remind_all_debtors(
    background_tasks: BackgroundTasks,
    min_debt_days: int = Query(0, description="Minimum days overdue to send reminder"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> dict:
    """
    Send SMS/WhatsApp reminders to ALL debtors.
    Admin/Owner only.
    """
    if current_user.role.lower() not in ["super_admin", "admin"]:
        raise HTTPException(status_code=403, detail="Not enough permissions")

    # Reuse logic to find debtors
    # Ideally we should refactor get_debtors_list logic into a helper function
    # For now, we'll duplicate the core logic for safety/speed
    
    today = date.today()
    current_month = today.replace(day=1)
    
    # Get all active students
    students = db.query(Student).options(
        joinedload(Student.group),
        joinedload(Student.guardians).joinedload(StudentGuardian.user),
        joinedload(Student.payments)
    ).filter(Student.status == "active").all()
    
    reminders_sent = 0
    
    for student in students:
        # Check if payment exists for current month
        current_month_payment = None
        for p in student.payments:
            if p.status == 'completed' and p.payment_period:
                if p.payment_period.year == current_month.year and p.payment_period.month == current_month.month:
                    current_month_payment = p
                    break
        
        if current_month_payment is None:
            # Calculate days overdue
            days_overdue = (today - current_month).days
            
            if days_overdue >= min_debt_days:
                # Calculate amount
                monthly_fee = student.individual_fee if student.individual_fee is not None else (student.group.monthly_fee if student.group else 0)
                
                if monthly_fee > 0:
                    # Find parent phone
                    parent_phone = student.parent_phone
                    parent_lang = "ro"
                    
                    if not parent_phone and student.guardians:
                        for g in student.guardians:
                            if g.user:
                                parent_phone = g.user.phone
                                parent_lang = getattr(g.user, 'preferred_language', 'ro')
                                break
                    
                    if parent_phone:
                        # Queue background task
                        background_tasks.add_task(
                            send_debt_reminder,
                            student_id=student.id,
                            parent_phone=parent_phone,
                            debt_amount=monthly_fee,
                            language=parent_lang
                        )
                        reminders_sent += 1

    return {
        "message": f"Queued {reminders_sent} reminders",
        "count": reminders_sent
    }

# ==================== BULK OPERATIONS ====================

@router.post("/bulk/change-group")
async def bulk_change_group(
    student_ids: List[int],
    new_group_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> dict:
    """
    Mass transfer students to another group.
    Admin only.
    """
    if current_user.role.lower() not in ["super_admin", "admin"]:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    
    # Verify new group exists
    new_group = db.query(Group).filter(Group.id == new_group_id).first()
    if not new_group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    # Get current student count in target group
    current_count = db.query(Student).filter(
        Student.group_id == new_group_id,
        Student.status == "active"
    ).count()
    
    if current_count + len(student_ids) > (new_group.max_capacity or 20):
        raise HTTPException(
            status_code=400, 
            detail=f"Group capacity exceeded. Max: {new_group.max_capacity}, Current: {current_count}, Requested: {len(student_ids)}"
        )
    
    # Update students
    updated = 0
    errors = []
    for student_id in student_ids:
        student = db.query(Student).filter(Student.id == student_id).first()
        if student:
            old_data = entity_to_dict(student)
            student.group_id = new_group_id
            
            log_update(
                db=db,
                entity_type="student",
                entity=student,
                old_data=old_data,
                user=current_user,
                reason=f"Bulk group change to {new_group.name}"
            )
            
            updated += 1
        else:
            errors.append(f"Student {student_id} not found")
    
    db.commit()
    
    return {
        "message": f"Successfully transferred {updated} students to {new_group.name}",
        "updated": updated,
        "errors": errors
    }


@router.post("/bulk/change-status")
async def bulk_change_status(
    student_ids: List[int],
    new_status: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> dict:
    """
    Mass change student status (active, frozen, archived).
    Admin only.
    """
    if current_user.role.lower() not in ["super_admin", "admin"]:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    
    if new_status not in ["active", "frozen", "archived"]:
        raise HTTPException(status_code=400, detail="Invalid status")
    
    students = db.query(Student).filter(Student.id.in_(student_ids)).all()
    updated = 0
    
    for student in students:
        old_data = entity_to_dict(student)
        student.status = new_status
        
        log_update(
            db=db,
            entity_type="student",
            entity=student,
            old_data=old_data,
            user=current_user,
            reason=f"Bulk status change to {new_status}"
        )
        updated += 1
        
    db.commit()
    
    return {
        "message": f"Successfully updated {updated} students to status '{new_status}'",
        "updated": updated
    }


# ==================== EXPORT FUNCTIONS ====================

@router.get("/export/students")
async def export_students_excel(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    group_id: Optional[int] = None,
    status: Optional[str] = None
):
    """
    Export students to CSV format (Excel compatible).
    Admin only.
    """
    if current_user.role.lower() not in ["super_admin", "admin"]:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    
    query = db.query(Student).options(
        joinedload(Student.group).joinedload(Group.coach),
        joinedload(Student.guardians).joinedload(StudentGuardian.user)
    )
    
    if group_id:
        query = query.filter(Student.group_id == group_id)
    if status:
        query = query.filter(Student.status == status)
    
    students = query.all()
    
    # Create CSV content
    output = io.StringIO()
    # Write BOM for Excel UTF-8 compatibility
    output.write('\ufeff')
    
    # Header row
    headers = [
        "ID", "Имя", "Фамилия", "Дата рождения", "Возраст", "Группа", "Тренер",
        "Статус", "Телефон родителя", "Баланс", "Группа крови", "Аллергии",
        "Экстренный контакт", "Телефон экстр. контакта"
    ]
    output.write(";".join(headers) + "\n")
    
    for student in students:
        age = (date.today().year - student.dob.year) if student.dob else ""
        guardian_phones = ", ".join([g.user.phone for g in student.guardians if g.user])
        
        row = [
            str(student.id),
            student.first_name or "",
            student.last_name or "",
            str(student.dob) if student.dob else "",
            str(age),
            student.group.name if student.group else "",
            student.group.coach.full_name if student.group and student.group.coach else "",
            student.status or "",
            guardian_phones or student.parent_phone or "",
            str(student.balance or 0),
            getattr(student, 'blood_type', '') or "",
            getattr(student, 'allergies', '') or "",
            getattr(student, 'emergency_contact', '') or "",
            getattr(student, 'emergency_phone', '') or ""
        ]
        output.write(";".join(row) + "\n")
    
    output.seek(0)
    
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename=students_{date.today()}.csv"
        }
    )


@router.get("/export/payments")
async def export_payments_excel(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    month: Optional[int] = None,
    year: Optional[int] = None
):
    """
    Export payments to CSV format.
    Admin only.
    """
    if current_user.role.lower() not in ["super_admin", "admin"]:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    
    query = db.query(Payment).options(
        joinedload(Payment.student).joinedload(Student.group)
    )
    
    if month and year:
        query = query.filter(
            extract('month', Payment.payment_period) == month,
            extract('year', Payment.payment_period) == year
        )
    
    payments = query.order_by(Payment.created_at.desc()).all()
    
    output = io.StringIO()
    output.write('\ufeff')
    
    headers = ["ID", "Ученик", "Группа", "Сумма", "Период", "Статус", "Способ оплаты", "Дата"]
    output.write(";".join(headers) + "\n")
    
    for payment in payments:
        row = [
            str(payment.id),
            f"{payment.student.first_name} {payment.student.last_name}" if payment.student else "",
            payment.student.group.name if payment.student and payment.student.group else "",
            str(payment.amount),
            str(payment.payment_period) if payment.payment_period else "",
            payment.status or "",
            payment.payment_method or "",
            str(payment.created_at) if payment.created_at else ""
        ]
        output.write(";".join(row) + "\n")
    
    output.seek(0)
    
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename=payments_{date.today()}.csv"
        }
    )


@router.get("/export/debtors")
async def export_debtors_excel(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Export debtors list to CSV format.
    Admin only.
    """
    if current_user.role.lower() not in ["super_admin", "admin"]:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    
    # Get debtors data
    debtors_response = await get_debtors_list(db=db, current_user=current_user)
    debtors = debtors_response["debtors"]
    
    output = io.StringIO()
    output.write('\ufeff')
    
    headers = ["Ученик", "Группа", "Тренер", "Дней просрочки", "Месяцев не оплачено", "Сумма долга", "Телефон родителя"]
    output.write(";".join(headers) + "\n")
    
    for debtor in debtors:
        guardian_phones = ", ".join([g["phone"] for g in debtor.get("guardians", [])])
        row = [
            debtor["student_name"],
            debtor["group_name"],
            debtor.get("coach_name") or "",
            str(debtor["days_overdue"]),
            str(debtor["months_unpaid"]),
            str(debtor["total_debt"]),
            guardian_phones or debtor.get("parent_phone") or ""
        ]
        output.write(";".join(row) + "\n")
    
    output.seek(0)
    
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename=debtors_{date.today()}.csv"
        }
    )


# ==================== GROUP CAPACITY ====================

@router.get("/groups/capacity")
async def get_groups_capacity(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> List[dict]:
    """
    Get all groups with capacity information.
    Shows current students count vs max capacity.
    """
    if current_user.role.lower() not in ["super_admin", "admin", "coach"]:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    
    groups = db.query(Group).options(
        joinedload(Group.coach),
        joinedload(Group.students)
    ).all()
    
    result = []
    for group in groups:
        active_students = [s for s in group.students if s.status == "active"]
        max_cap = group.max_capacity or 20
        
        result.append({
            "id": group.id,
            "name": group.name,
            "coach_name": group.coach.full_name if group.coach else None,
            "current_count": len(active_students),
            "max_capacity": max_cap,
            "available_spots": max_cap - len(active_students),
            "fill_percentage": round((len(active_students) / max_cap) * 100, 1) if max_cap > 0 else 0,
            "is_full": len(active_students) >= max_cap,
            "monthly_fee": group.monthly_fee
        })
    
    # Sort by fill percentage (most full first)
    result.sort(key=lambda x: x["fill_percentage"], reverse=True)
    
    return result


# ==================== BUSINESS ANALYTICS ====================

@router.get("/analytics/revenue-forecast")
async def get_revenue_forecast(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    months_ahead: int = Query(3, ge=1, le=12)
) -> dict:
    """
    Forecast revenue for upcoming months based on current students.
    Owner only.
    """
    if current_user.role.lower() not in ["super_admin"]:
        raise HTTPException(status_code=403, detail="Only owner can view revenue forecast")
    
    # Get all active students with their groups
    students = db.query(Student).options(
        joinedload(Student.group)
    ).filter(Student.status == "active").all()
    
    today = date.today()
    forecast = []
    
    for i in range(months_ahead):
        forecast_month = today.replace(day=1) + timedelta(days=32 * i)
        forecast_month = forecast_month.replace(day=1)
        
        expected_revenue = sum(
            (s.group.monthly_fee if s.group and s.group.monthly_fee else 0)
            for s in students
        )
        
        forecast.append({
            "month": forecast_month.strftime("%Y-%m"),
            "month_name": forecast_month.strftime("%B %Y"),
            "expected_revenue": expected_revenue,
            "active_students": len(students)
        })
    
    return {
        "forecast": forecast,
        "total_expected": sum(f["expected_revenue"] for f in forecast)
    }


@router.get("/analytics/churn")
async def get_churn_analysis(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    months: int = Query(6, ge=1, le=24)
) -> dict:
    """
    Analyze student churn (students who left) over time.
    Owner only.
    """
    if current_user.role.lower() not in ["super_admin"]:
        raise HTTPException(status_code=403, detail="Only owner can view churn analysis")
    
    today = date.today()
    
    # Get archived/inactive students count by month (approximation)
    archived_students = db.query(Student).filter(Student.status == "archived").all()
    frozen_students = db.query(Student).filter(Student.status == "frozen").all()
    active_students = db.query(Student).filter(Student.status == "active").count()
    
    total_students = active_students + len(archived_students) + len(frozen_students)
    
    return {
        "summary": {
            "total_ever": total_students,
            "currently_active": active_students,
            "currently_frozen": len(frozen_students),
            "total_churned": len(archived_students),
            "churn_rate": round((len(archived_students) / total_students * 100), 1) if total_students > 0 else 0
        },
        "by_status": {
            "active": active_students,
            "frozen": len(frozen_students),
            "archived": len(archived_students)
        }
    }


@router.get("/analytics/ltv")
async def get_customer_ltv(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> dict:
    """
    Calculate average Lifetime Value (LTV) of students.
    Owner only.
    """
    if current_user.role.lower() not in ["super_admin"]:
        raise HTTPException(status_code=403, detail="Only owner can view LTV analysis")
    
    # Get total payments per student
    student_payments = db.query(
        Student.id,
        Student.first_name,
        Student.last_name,
        func.sum(Payment.amount).label('total_paid'),
        func.count(Payment.id).label('payment_count')
    ).join(Payment, Payment.student_id == Student.id).filter(
        Payment.status == 'completed'
    ).group_by(Student.id).all()
    
    if not student_payments:
        return {
            "average_ltv": 0,
            "total_revenue": 0,
            "total_students_with_payments": 0,
            "top_students": []
        }
    
    total_revenue = sum(sp.total_paid or 0 for sp in student_payments)
    average_ltv = total_revenue / len(student_payments) if student_payments else 0
    
    # Top 10 students by LTV
    top_students = sorted(student_payments, key=lambda x: x.total_paid or 0, reverse=True)[:10]
    
    return {
        "average_ltv": round(average_ltv, 2),
        "total_revenue": total_revenue,
        "total_students_with_payments": len(student_payments),
        "top_students": [
            {
                "id": sp.id,
                "name": f"{sp.first_name} {sp.last_name}",
                "total_paid": sp.total_paid,
                "payment_count": sp.payment_count
            }
            for sp in top_students
        ]
    }


# ==================== FUNNEL TRACKING ====================

@router.get("/funnel/overview")
async def get_funnel_overview(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    days: int = Query(30, ge=7, le=365)
) -> dict:
    """
    Get conversion funnel: trials -> conversions.
    Owner only.
    """
    if current_user.role.lower() not in ["super_admin", "admin"]:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    
    cutoff_date = date.today() - timedelta(days=days)
    
    # Get trial sessions
    trials = db.query(TrialSession).filter(
        TrialSession.trial_date >= cutoff_date
    ).all()
    
    total_trials = len(trials)
    by_status = {
        "scheduled": len([t for t in trials if t.status == "scheduled"]),
        "completed": len([t for t in trials if t.status == "completed"]),
        "no_show": len([t for t in trials if t.status == "no_show"]),
        "converted": len([t for t in trials if t.status == "converted"]),
        "rejected": len([t for t in trials if t.status == "rejected"])
    }
    
    by_source = {}
    for trial in trials:
        source = trial.source or "unknown"
        by_source[source] = by_source.get(source, 0) + 1
    
    conversion_rate = (by_status["converted"] / total_trials * 100) if total_trials > 0 else 0
    
    return {
        "period_days": days,
        "total_trials": total_trials,
        "by_status": by_status,
        "by_source": by_source,
        "conversion_rate": round(conversion_rate, 1),
        "show_rate": round(((by_status["completed"] + by_status["converted"]) / total_trials * 100), 1) if total_trials > 0 else 0
    }


@router.post("/funnel/trial")
async def create_trial_session(
    student_name: str,
    parent_phone: str,
    trial_date: date,
    parent_name: Optional[str] = None,
    parent_email: Optional[str] = None,
    age: Optional[int] = None,
    preferred_group_id: Optional[int] = None,
    source: Optional[str] = None,
    notes: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> dict:
    """
    Create a new trial session request.
    Admin only.
    """
    if current_user.role.lower() not in ["super_admin", "admin"]:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    
    trial = TrialSession(
        student_name=student_name,
        parent_name=parent_name,
        parent_phone=parent_phone,
        parent_email=parent_email,
        age=age,
        preferred_group_id=preferred_group_id,
        trial_date=trial_date,
        source=source,
        notes=notes
    )
    
    db.add(trial)
    db.commit()
    db.refresh(trial)
    
    log_create(
        db=db,
        entity_type="trial_session",
        entity=trial,
        user=current_user,
        reason="Trial session created"
    )
    
    return {
        "id": trial.id,
        "message": "Trial session created successfully",
        "trial_date": str(trial.trial_date)
    }


@router.put("/funnel/trial/{trial_id}/status")
async def update_trial_status(
    trial_id: int,
    new_status: str,
    converted_student_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> dict:
    """
    Update trial session status.
    Admin only.
    """
    if current_user.role.lower() not in ["super_admin", "admin"]:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    
    if new_status not in ["scheduled", "completed", "no_show", "converted", "rejected"]:
        raise HTTPException(status_code=400, detail="Invalid status")
    
    trial = db.query(TrialSession).filter(TrialSession.id == trial_id).first()
    if not trial:
        raise HTTPException(status_code=404, detail="Trial session not found")
    
    old_data = entity_to_dict(trial)
    trial.status = new_status
    if new_status == "converted" and converted_student_id:
        trial.converted_student_id = converted_student_id
    
    log_update(
        db=db,
        entity_type="trial_session",
        entity=trial,
        old_data=old_data,
        user=current_user,
        reason=f"Trial status updated to {new_status}"
    )
    
    db.commit()
    
    return {"message": f"Trial status updated to '{new_status}'"}


# ==================== P&L REPORT ====================

@router.get("/analytics/pnl")
async def get_pnl_report(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    year: int = Query(None),
    month: int = Query(None)
) -> dict:
    """
    Get Profit & Loss report.
    Shows income vs expenses by category.
    Owner only.
    """
    if current_user.role.lower() not in ["super_admin"]:
        raise HTTPException(status_code=403, detail="Only owner can view P&L report")
    
    from datetime import date
    from sqlalchemy import or_
    today = date.today()
    year = year or today.year
    month = month or today.month
    
    # Get income (payments) for the period - используем payment_date и payment_period
    income_query = db.query(func.sum(Payment.amount)).filter(
        Payment.status == 'completed',
        or_(
            func.extract('year', Payment.payment_date) == year,
            func.extract('year', Payment.payment_period) == year
        ),
        or_(
            func.extract('month', Payment.payment_date) == month,
            func.extract('month', Payment.payment_period) == month
        )
    )
    total_income = income_query.scalar() or 0
    
    # Get expenses for the period
    expenses = db.query(
        ExpenseCategory.name,
        ExpenseCategory.color,
        func.sum(Expense.amount).label('total')
    ).join(Expense, Expense.category_id == ExpenseCategory.id).filter(
        extract('year', Expense.expense_date) == year,
        extract('month', Expense.expense_date) == month
    ).group_by(ExpenseCategory.id).all()
    
    total_expenses = sum(e.total or 0 for e in expenses)
    net_profit = total_income - total_expenses
    
    # Get payment count
    payment_count = db.query(Payment).filter(
        Payment.status == 'completed',
        or_(
            func.extract('year', Payment.payment_date) == year,
            func.extract('year', Payment.payment_period) == year
        ),
        or_(
            func.extract('month', Payment.payment_date) == month,
            func.extract('month', Payment.payment_period) == month
        )
    ).count()
    
    return {
        "period": f"{year}-{month:02d}",
        "total_income": float(total_income),
        "total_expenses": float(total_expenses),
        "net_profit": float(net_profit),
        "income": {
            "total": float(total_income),
            "payment_count": payment_count,
            "average_payment": round(total_income / payment_count, 2) if payment_count > 0 else 0
        },
        "expenses": {
            "total": float(total_expenses),
            "by_category": [
                {
                    "category": e.name,
                    "amount": float(e.total),
                    "color": e.color,
                    "percentage": round((e.total / total_expenses * 100), 1) if total_expenses > 0 else 0
                }
                for e in expenses
            ]
        },
        "profit_margin": round((net_profit / total_income * 100), 1) if total_income > 0 else 0
    }


@router.get("/analytics/pnl/yearly")
async def get_yearly_pnl(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    year: int = Query(None)
) -> dict:
    """
    Get yearly P&L breakdown by month.
    Owner only.
    """
    if current_user.role.lower() not in ["super_admin"]:
        raise HTTPException(status_code=403, detail="Only owner can view P&L report")
    
    from datetime import date
    year = year or date.today().year
    
    monthly_data = []
    
    for month in range(1, 13):
        # Income
        income = db.query(func.sum(Payment.amount)).filter(
            Payment.status == 'completed',
            extract('year', Payment.created_at) == year,
            extract('month', Payment.created_at) == month
        ).scalar() or 0
        
        # Expenses
        expenses = db.query(func.sum(Expense.amount)).filter(
            extract('year', Expense.expense_date) == year,
            extract('month', Expense.expense_date) == month
        ).scalar() or 0
        
        monthly_data.append({
            "month": month,
            "month_name": ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][month],
            "income": income,
            "expenses": expenses,
            "profit": income - expenses
        })
    
    total_income = sum(m["income"] for m in monthly_data)
    total_expenses = sum(m["expenses"] for m in monthly_data)
    
    return {
        "year": year,
        "monthly_breakdown": monthly_data,
        "totals": {
            "income": total_income,
            "expenses": total_expenses,
            "profit": total_income - total_expenses
        }
    }


# ==================== EXPENSE MANAGEMENT ====================

@router.get("/expenses/categories")
async def get_expense_categories(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> List[dict]:
    """Get all expense categories."""
    if current_user.role.lower() not in ["super_admin", "admin"]:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    
    categories = db.query(ExpenseCategory).filter(ExpenseCategory.is_active == True).all()
    return [
        {
            "id": c.id,
            "name": c.name,
            "description": c.description,
            "color": c.color
        }
        for c in categories
    ]


@router.post("/expenses/categories")
async def create_expense_category(
    name: str,
    description: Optional[str] = None,
    color: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> dict:
    """Create expense category. Owner only."""
    if current_user.role.lower() not in ["super_admin"]:
        raise HTTPException(status_code=403, detail="Only owner can manage categories")
    
    category = ExpenseCategory(name=name, description=description, color=color)
    db.add(category)
    db.commit()
    db.refresh(category)
    
    log_create(
        db=db,
        entity_type="expense_category",
        entity=category,
        user=current_user,
        reason="Expense category created"
    )
    
    return {"id": category.id, "message": "Category created"}


@router.post("/expenses")
async def create_expense(
    category_id: int,
    amount: float,
    expense_date: date,
    description: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> dict:
    """Record an expense."""
    if current_user.role.lower() not in ["super_admin", "admin"]:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    
    expense = Expense(
        category_id=category_id,
        amount=amount,
        expense_date=expense_date,
        description=description,
        created_by=current_user.id
    )
    db.add(expense)
    db.commit()
    db.refresh(expense)
    
    log_create(
        db=db,
        entity_type="expense",
        entity=expense,
        user=current_user,
        reason="Expense recorded"
    )
    
    return {"id": expense.id, "message": "Expense recorded"}


@router.get("/expenses")
async def get_expenses(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    year: Optional[int] = None,
    month: Optional[int] = None,
    category_id: Optional[int] = None
) -> List[dict]:
    """Get expenses with filters."""
    if current_user.role.lower() not in ["super_admin", "admin"]:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    
    query = db.query(Expense).options(joinedload(Expense.category))
    
    if year:
        query = query.filter(extract('year', Expense.expense_date) == year)
    if month:
        query = query.filter(extract('month', Expense.expense_date) == month)
    if category_id:
        query = query.filter(Expense.category_id == category_id)
    
    expenses = query.order_by(Expense.expense_date.desc()).limit(100).all()
    
    return [
        {
            "id": e.id,
            "category": e.category.name if e.category else None,
            "amount": e.amount,
            "description": e.description,
            "expense_date": str(e.expense_date),
            "receipt_url": e.receipt_url
        }
        for e in expenses
    ]


# ==================== COACH RATING ====================

@router.get("/analytics/coach-rating")
async def get_coach_ratings(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> List[dict]:
    """
    Get coach ratings based on:
    - Attendance rate of their groups
    - Student retention
    - Group fill rate
    Owner only.
    """
    if current_user.role.lower() not in ["super_admin"]:
        raise HTTPException(status_code=403, detail="Only owner can view coach ratings")
    
    # Get all coaches
    coaches = db.query(User).filter(User.role == "coach").all()
    
    ratings = []
    for coach in coaches:
        # Get coach's groups
        groups = db.query(Group).filter(Group.coach_id == coach.id).all()
        
        if not groups:
            continue
        
        total_students = 0
        total_capacity = 0
        total_attendance_rate = 0
        groups_with_attendance = 0
        
        for group in groups:
            students = db.query(Student).filter(
                Student.group_id == group.id,
                Student.status == "active"
            ).all()
            
            total_students += len(students)
            total_capacity += group.max_capacity or 20
            
            # Calculate attendance rate for this group (last 30 days)
            from datetime import timedelta
            cutoff = date.today() - timedelta(days=30)
            
            total_records = db.query(Attendance).filter(
                Attendance.student_id.in_([s.id for s in students]),
                Attendance.date >= cutoff
            ).count()
            
            present_records = db.query(Attendance).filter(
                Attendance.student_id.in_([s.id for s in students]),
                Attendance.date >= cutoff,
                Attendance.status == AttendanceStatus.PRESENT
            ).count()
            
            if total_records > 0:
                total_attendance_rate += (present_records / total_records * 100)
                groups_with_attendance += 1
        
        avg_attendance = total_attendance_rate / groups_with_attendance if groups_with_attendance > 0 else 0
        fill_rate = (total_students / total_capacity * 100) if total_capacity > 0 else 0
        
        # Calculate overall score (weighted average)
        overall_score = (avg_attendance * 0.6 + fill_rate * 0.4)
        
        ratings.append({
            "coach_id": coach.id,
            "coach_name": coach.full_name,
            "groups_count": len(groups),
            "total_students": total_students,
            "total_capacity": total_capacity,
            "fill_rate": round(fill_rate, 1),
            "attendance_rate": round(avg_attendance, 1),
            "overall_score": round(overall_score, 1)
        })
    
    # Sort by overall score
    ratings.sort(key=lambda x: x["overall_score"], reverse=True)
    
    return ratings


# ==================== QUICK ACTIONS ====================

@router.post("/quick/add-student")
async def quick_add_student(
    first_name: str,
    last_name: str,
    group_id: int,
    parent_phone: Optional[str] = None,
    dob: Optional[date] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> dict:
    """
    Quick action to add a new student with minimal info.
    Admin only.
    """
    if current_user.role.lower() not in ["super_admin", "admin"]:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    
    # Verify group exists
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    # Check group capacity
    current_count = db.query(Student).filter(
        Student.group_id == group_id,
        Student.status == "active"
    ).count()
    
    if current_count >= (group.max_capacity or 20):
        raise HTTPException(status_code=400, detail="Group is at full capacity")
    
    # Create student
    student = Student(
        first_name=first_name,
        last_name=last_name,
        group_id=group_id,
        parent_phone=parent_phone,
        dob=dob,
        status="active",
        enrollment_date=date.today()
    )
    db.add(student)
    db.commit()
    db.refresh(student)
    
    return {
        "success": True,
        "student_id": student.id,
        "student_name": f"{student.first_name} {student.last_name}",
        "group_name": group.name,
        "message": "Ученик успешно добавлен"
    }


@router.post("/quick/record-payment")
async def quick_record_payment(
    student_id: int,
    amount: float,
    payment_month: int,
    payment_year: int,
    payment_type: str = "subscription",
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> dict:
    """
    Quick action to record a payment.
    Admin only.
    """
    if current_user.role.lower() not in ["super_admin", "admin"]:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    
    # Verify student exists
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    
    # Check if payment for this period already exists
    existing = db.query(Payment).filter(
        Payment.student_id == student_id,
        Payment.status == "completed",
        extract('month', Payment.payment_period) == payment_month,
        extract('year', Payment.payment_period) == payment_year
    ).first()
    
    if existing:
        return {
            "success": False,
            "message": f"Платёж за {payment_month}/{payment_year} уже существует",
            "existing_payment_id": existing.id
        }
    
    # Create payment
    payment_period = date(payment_year, payment_month, 1)
    payment = Payment(
        student_id=student_id,
        amount=amount,
        payment_period=payment_period,
        payment_type=payment_type,
        status="completed",
        received_by_id=current_user.id
    )
    db.add(payment)
    
    # Update debtor status
    student.is_debtor = False
    
    db.commit()
    db.refresh(payment)
    
    return {
        "success": True,
        "payment_id": payment.id,
        "student_name": f"{student.first_name} {student.last_name}",
        "amount": amount,
        "period": f"{payment_month}/{payment_year}",
        "message": "Платёж успешно записан"
    }


@router.get("/quick/search-students")
async def quick_search_students(
    query: str = Query(..., min_length=2),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> List[dict]:
    """
    Quick search for students by name.
    Returns minimal info for quick actions.
    """
    if current_user.role.lower() not in ["super_admin", "admin", "coach"]:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    
    students = db.query(Student).filter(
        or_(
            Student.first_name.ilike(f"%{query}%"),
            Student.last_name.ilike(f"%{query}%")
        ),
        Student.status == "active"
    ).options(joinedload(Student.group)).limit(10).all()
    
    return [
        {
            "id": s.id,
            "name": f"{s.first_name} {s.last_name}",
            "group_name": s.group.name if s.group else None,
            "is_debtor": s.is_debtor
        }
        for s in students
    ]


@router.get("/quick/dashboard-stats")
async def quick_dashboard_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> dict:
    """
    Quick dashboard stats for admin panel.
    Returns key metrics at a glance.
    """
    if current_user.role.lower() not in ["super_admin", "admin"]:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    
    from sqlalchemy import func
    from app.models.history import StudentGroupHistory
    
    today = date.today()
    current_month_start = today.replace(day=1)
    
    # Total active students
    total_students = db.query(Student).filter(Student.status == "active").count()
    
    # Total debtors
    debtors_count = db.query(Student).filter(
        Student.status == "active",
        Student.is_debtor == True
    ).count()
    
    # Revenue this month
    monthly_revenue = db.query(func.sum(Payment.amount)).filter(
        Payment.status == "completed",
        extract('month', Payment.created_at) == today.month,
        extract('year', Payment.created_at) == today.year
    ).scalar() or 0
    
    # Payments this month
    payments_count = db.query(Payment).filter(
        Payment.status == "completed",
        extract('month', Payment.created_at) == today.month,
        extract('year', Payment.created_at) == today.year
    ).count()
    
    # New students this month (based on first group join date)
    # Find students who joined their first group this month
    first_join_subq = db.query(
        StudentGroupHistory.student_id,
        func.min(StudentGroupHistory.joined_at).label('first_joined')
    ).group_by(StudentGroupHistory.student_id).subquery()
    
    new_students = db.query(first_join_subq).filter(
        extract('month', first_join_subq.c.first_joined) == today.month,
        extract('year', first_join_subq.c.first_joined) == today.year
    ).count()
    
    # Pending trial sessions
    try:
        pending_trials = db.query(TrialSession).filter(
            TrialSession.status == "scheduled"
        ).count()
    except Exception:
        pending_trials = 0
    
    # Groups fill rate
    groups = db.query(Group).all()
    total_capacity = sum(g.max_capacity or 20 for g in groups)
    fill_rate = (total_students / total_capacity * 100) if total_capacity > 0 else 0
    
    return {
        "total_students": total_students,
        "debtors_count": debtors_count,
        "monthly_revenue": monthly_revenue,
        "payments_count": payments_count,
        "new_students_this_month": new_students,
        "pending_trials": pending_trials,
        "groups_count": len(groups),
        "overall_fill_rate": round(fill_rate, 1),
        "period": f"{today.month}/{today.year}"
    }
