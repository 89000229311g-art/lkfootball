from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query, Body
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, extract
from datetime import datetime, date, timedelta
from calendar import monthrange

from app.core.deps import get_db, get_current_user
from app.models import User, Attendance, Event, Student, Group, StudentGuardian, SchoolSettings, Achievement, Message
from app.schemas.attendance import (
    AttendanceCreate,
    AttendanceUpdate,
    AttendanceResponse,
    AttendanceWithDetails,
    BulkAttendanceCreate,
    AttendanceStats
)

router = APIRouter()

@router.get("/", response_model=List[AttendanceWithDetails])
async def get_attendance(
    skip: int = 0,
    limit: int = 10000,
    event_id: int = None,
    student_id: int = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> List[Attendance]:
    """
    Get all attendance records (admin and coach only).
    """
    if current_user.role not in ["super_admin", "admin", "coach", "owner"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough permissions"
        )
    
    query = db.query(Attendance)
    
    if event_id:
        query = query.filter(Attendance.event_id == event_id)
    
    if student_id:
        query = query.filter(Attendance.student_id == student_id)
        
    # Coach restriction: can only see attendance for their groups
    if current_user.role == "coach":
        # Get coach's groups (either primary coach or in secondary coaches list)
        from app.models.group import group_coaches
        coach_groups = db.query(Group).filter(
            (Group.coach_id == current_user.id) | 
            (Group.coaches.any(id=current_user.id))
        ).all()
        coach_group_ids = [g.id for g in coach_groups]
        
        # Filter attendance by events in these groups
        query = query.join(Event).filter(Event.group_id.in_(coach_group_ids))

    return query.offset(skip).limit(limit).all()

@router.put("/{attendance_id}", response_model=AttendanceResponse)
async def update_attendance(
    attendance_id: int,
    attendance_in: AttendanceUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Attendance:
    """
    Update an existing attendance record (admin and coach only).
    """
    if current_user.role not in ["super_admin", "admin", "coach", "owner"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough permissions"
        )
    
    attendance = db.query(Attendance).filter(Attendance.id == attendance_id).first()
    if not attendance:
        raise HTTPException(status_code=404, detail="Attendance record not found")
        
    # Coach restriction: can only update attendance for their groups
    if current_user.role == "coach":
        event = db.query(Event).filter(Event.id == attendance.event_id).first()
        if not event:
             raise HTTPException(status_code=404, detail="Event not found")
             
        group = db.query(Group).filter(Group.id == event.group_id).first()
        is_coach = False
        if group:
            if group.coach_id == current_user.id or any(c.id == current_user.id for c in group.coaches):
                is_coach = True
        
        if not is_coach:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Coaches can only update attendance for their own groups"
            )

    # Check Medical Certificate Blocking Rule (if changing to present/late)
    if attendance_in.status in ["present", "late"] and attendance.status not in ["present", "late"]:
        block_setting = db.query(SchoolSettings).filter(SchoolSettings.key == "features_block_no_medical_certificate").first()
        if block_setting and block_setting.value == "true":
            student = db.query(Student).filter(Student.id == attendance.student_id).first()
            if student:
                is_valid = student.medical_certificate_expires and student.medical_certificate_expires >= date.today()
                if not is_valid:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Cannot mark present: Student has no valid medical certificate."
                    )
        
        # Achievement Logic: Increment Streak on update to present
        student = db.query(Student).filter(Student.id == attendance.student_id).first()
        if student:
            student.attendance_streak = (student.attendance_streak or 0) + 1
            if student.attendance_streak >= 10:
                student.stars = (student.stars or 0) + 1
                student.attendance_streak = 0
                
                # Create Achievement record
                achievement = Achievement(
                    student_id=student.id,
                    title="10 тренировок подряд!",
                    description="Отличная дисциплина! Ты посетил 10 тренировок без пропусков.",
                    icon="⭐",
                    type="attendance_streak",
                    created_at=datetime.now()
                )
                db.add(achievement)

    elif attendance_in.status == "absent" and attendance.status != "absent":
        # Reset streak if changed to absent
        student = db.query(Student).filter(Student.id == attendance.student_id).first()
        if student:
            student.attendance_streak = 0

    # Update fields
    if attendance_in.status:
        attendance.status = attendance_in.status
    if attendance_in.mark is not None:
        attendance.mark = attendance_in.mark
        
    db.commit()
    db.refresh(attendance)
    return attendance

@router.put("/{attendance_id}/rate")
async def rate_attendance(
    attendance_id: int,
    rating: int = Body(..., ge=1, le=5),
    feedback: Optional[str] = Body(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Rate a training session (Parent only).
    """
    attendance = db.query(Attendance).filter(Attendance.id == attendance_id).first()
    if not attendance:
        raise HTTPException(status_code=404, detail="Attendance record not found")
        
    # Check permissions (must be guardian of the student)
    if current_user.role == "parent":
        guardian = db.query(StudentGuardian).filter(
            StudentGuardian.student_id == attendance.student_id,
            StudentGuardian.user_id == current_user.id
        ).first()
        if not guardian:
            raise HTTPException(status_code=403, detail="Not authorized for this student")
    elif current_user.role not in ["super_admin", "admin"]:
        raise HTTPException(status_code=403, detail="Not enough permissions")

    attendance.parent_rating = rating
    attendance.parent_feedback = feedback
    db.commit()
    
    return {"message": "Rating submitted successfully"}

@router.post("/", response_model=AttendanceResponse)
async def mark_attendance(
    *,
    db: Session = Depends(get_db),
    attendance_in: AttendanceCreate,
    current_user: User = Depends(get_current_user)
) -> Attendance:
    """
    Mark attendance for a student at an event (admin and coach only).
    Coaches can only mark attendance for events in their groups.
    """
    if current_user.role not in ["super_admin", "admin", "coach", "owner"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough permissions"
        )
    
    # Validate event exists
    event = db.query(Event).filter(Event.id == attendance_in.event_id).first()
    if not event:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Event not found"
        )
    
    # Validate student exists
    student = db.query(Student).filter(Student.id == attendance_in.student_id).first()
    if not student:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Student not found"
        )

    # Check Medical Certificate Blocking Rule
    if attendance_in.status in ["present", "late"]:
        block_setting = db.query(SchoolSettings).filter(SchoolSettings.key == "features_block_no_medical_certificate").first()
        if block_setting and block_setting.value == "true":
            is_valid = student.medical_certificate_expires and student.medical_certificate_expires >= date.today()
            if not is_valid:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Cannot mark present: Student has no valid medical certificate."
                )
        

            
    elif attendance_in.status == "absent":
        # Reset streak on absence
        student.attendance_streak = 0
    
    # Check if coach is marking attendance for their own group
    user_role = current_user.role.lower() if current_user.role else ""
    if user_role == "coach":
        group = db.query(Group).filter(Group.id == event.group_id).first()
        is_coach = False
        if group:
            if group.coach_id == current_user.id or any(c.id == current_user.id for c in group.coaches):
                is_coach = True
        
        if not is_coach:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Coaches can only mark attendance for their own groups"
            )
    
    # Check for duplicate attendance
    existing = db.query(Attendance).filter(
        Attendance.event_id == attendance_in.event_id,
        Attendance.student_id == attendance_in.student_id
    ).first()
    
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Attendance already marked for this student at this event"
        )
    
    attendance = Attendance(
        event_id=attendance_in.event_id,
        student_id=attendance_in.student_id,
        status=attendance_in.status,
        mark=attendance_in.mark
    )
    db.add(attendance)

    # BALANCE UPDATE & STREAK LOGIC
    # Re-fetch student to ensure it's attached to session
    student = db.query(Student).filter(Student.id == attendance_in.student_id).first()
    
    if attendance_in.status in ["present", "late"]:
        # Update streak
        student.attendance_streak = (student.attendance_streak or 0) + 1
        
        # Check for achievement (every 10 visits)
        if student.attendance_streak >= 10:
            student.stars = (student.stars or 0) + 1
            student.attendance_streak = 0
            
            # Create Achievement record
            achievement = Achievement(
                student_id=student.id,
                title="10 тренировок подряд!",
                description="Отличная дисциплина! Ты посетил 10 тренировок без пропусков.",
                icon="⭐",
                type="attendance_streak",
                created_at=datetime.utcnow()
            )
            db.add(achievement)
            
            # Create system message notification
            # Find parent(s) to notify
            guardians = db.query(StudentGuardian).filter(StudentGuardian.student_id == student.id).all()
            for g in guardians:
                if g.user_id:
                    msg = Message(
                        sender_id=None, # System
                        recipient_id=g.user_id,
                        title="Новое достижение!",
                        content=f"Ваш ребенок {student.first_name} получил достижение: 10 тренировок подряд! (+1 звезда)",
                        chat_type="system", # Use string "system" or enum if available
                        is_read=False,
                        created_at=datetime.utcnow()
                    )
                    db.add(msg)
                
        # Balance deduction
        group = db.query(Group).filter(Group.id == event.group_id).first()
        
        if student and group and group.subscription_type == "by_class":
             cost_per_class = 0
             if group.classes_per_month > 0:
                  cost_per_class = group.monthly_fee / group.classes_per_month
             
             # Ensure balance is not None
             current_balance = student.balance or 0.0
             student.balance = current_balance - cost_per_class
             
             if student.balance < 0:
                 student.is_debtor = True
    elif attendance_in.status == "absent":
        # Reset streak if absent (unless sick? Let's assume sick preserves streak?)
        student.attendance_streak = 0
    elif attendance_in.status == "sick":
        # Keep streak or reset? Usually sick doesn't break "consecutive attended" logic 
        # but it does break "10 in a row". 
        # Let's preserve streak but not increment.
        pass

    db.commit()
    db.refresh(attendance)
    return attendance

@router.post("/bulk", response_model=List[AttendanceResponse])
async def mark_bulk_attendance(
    *,
    db: Session = Depends(get_db),
    bulk_attendance: BulkAttendanceCreate,
    current_user: User = Depends(get_current_user)
) -> List[Attendance]:
    """
    Mark attendance for multiple students at once (admin and coach only).
    """
    if current_user.role not in ["super_admin", "admin", "coach", "owner"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough permissions"
        )
    
    # Validate event exists
    event = db.query(Event).filter(Event.id == bulk_attendance.event_id).first()
    if not event:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Event not found"
        )
    
    # Check permissions for coaches
    if current_user.role == "coach":
        group = db.query(Group).filter(Group.id == event.group_id).first()
        is_coach = False
        if group:
            if group.coach_id == current_user.id or any(c.id == current_user.id for c in group.coaches):
                is_coach = True
        
        if not is_coach:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Coaches can only mark attendance for their own groups"
            )
    
    # Check Medical Certificate Blocking Rule (Once)
    block_setting = db.query(SchoolSettings).filter(SchoolSettings.key == "features_block_no_medical_certificate").first()
    should_block = block_setting and block_setting.value == "true"

    created_attendances = []
    for item in bulk_attendance.attendances:
        # Check for duplicates
        existing = db.query(Attendance).filter(
            Attendance.event_id == bulk_attendance.event_id,
            Attendance.student_id == item.student_id
        ).first()
        
        if not existing:
            # Check medical certificate if blocking is enabled
            if should_block and item.status in ["present", "late"]:
                student = db.query(Student).filter(Student.id == item.student_id).first()
                if student:
                    is_valid = student.medical_certificate_expires and student.medical_certificate_expires >= date.today()
                    if not is_valid:
                        # Skip this student or raise error? 
                        # Raising error might block the whole bulk operation. 
                        # Better to skip and maybe return a warning, but response model is List[Attendance].
                        # For now, let's just skip marking them as present (effectively not marking attendance or marking as 'absent' if that was the default?)
                        # But here we are creating a record. If we skip, no record is created.
                        # Ideally, we should maybe mark them as 'absent' with a note?
                        # Or just continue.
                        continue
            
            attendance = Attendance(
                event_id=bulk_attendance.event_id,
                student_id=item.student_id,
                status=item.status,
                mark=item.mark
            )
            db.add(attendance)
            created_attendances.append(attendance)

            # BALANCE UPDATE & STREAK LOGIC (Bulk)
            student = db.query(Student).filter(Student.id == item.student_id).first()
            
            if item.status in ["present", "late"]:
                # Streak
                if student:
                    student.attendance_streak = (student.attendance_streak or 0) + 1
                    if student.attendance_streak >= 10:
                        student.stars = (student.stars or 0) + 1
                        student.attendance_streak = 0
                        
                        achievement = Achievement(
                            student_id=student.id,
                            title="10 тренировок подряд!",
                            description="Отличная дисциплина! Ты посетил 10 тренировок без пропусков.",
                            icon="⭐",
                            type="attendance_streak",
                            created_at=datetime.utcnow()
                        )
                        db.add(achievement)

                        # Create system message notification
                        # Find parent(s) to notify
                        guardians = db.query(StudentGuardian).filter(StudentGuardian.student_id == student.id).all()
                        for g in guardians:
                            if g.user_id:
                                msg = Message(
                                    sender_id=None, # System
                                    recipient_id=g.user_id,
                                    title="Новое достижение!",
                                    content=f"Ваш ребенок {student.first_name} получил достижение: 10 тренировок подряд! (+1 звезда)",
                                    chat_type="system", # Use string "system" or enum if available
                                    is_read=False,
                                    created_at=datetime.utcnow()
                                )
                                db.add(msg)

                group = db.query(Group).filter(Group.id == event.group_id).first()
                
                if student and group and group.subscription_type == "by_class":
                    # Deduct cost of one class
                    cost_per_class = 0
                    if group.classes_per_month > 0:
                         cost_per_class = group.monthly_fee / group.classes_per_month
                    
                    student.balance -= cost_per_class
                    
                    # Check debt
                    if student.balance < 0:
                        student.is_debtor = True
            elif item.status == "absent":
                if student:
                    student.attendance_streak = 0

    db.commit()
    for attendance in created_attendances:
        db.refresh(attendance)
    
    return created_attendances

@router.get("/event/{event_id}", response_model=List[AttendanceWithDetails])
async def get_event_attendance(
    event_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> List[Attendance]:
    """
    Get all attendance records for a specific event.
    """
    # Validate event exists
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event not found"
        )
    
    # Check permissions for coaches
    if current_user.role == "coach":
        group = db.query(Group).filter(Group.id == event.group_id).first()
        is_coach = False
        if group:
            if group.coach_id == current_user.id or any(c.id == current_user.id for c in group.coaches):
                is_coach = True
        
        if not is_coach:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not enough permissions"
            )
    
    attendances = db.query(Attendance).filter(Attendance.event_id == event_id).all()
    return attendances

@router.get("/student/{student_id}", response_model=List[AttendanceWithDetails])
async def get_student_attendance(
    student_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> List[Attendance]:
    """
    Get attendance history for a specific student.
    Parents can only view their own children's attendance.
    """
    # Validate student exists
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Student not found"
        )
    
    # Check permissions for parents
    if current_user.role == "parent":
        guardian = db.query(StudentGuardian).filter(
            StudentGuardian.student_id == student_id,
            StudentGuardian.user_id == current_user.id
        ).first()
        if not guardian:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not enough permissions"
            )
    
    # Check permissions for coaches
    if current_user.role == "coach":
        if student.group_id:
            group = db.query(Group).filter(Group.id == student.group_id).first()
            if group and group.coach_id != current_user.id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Not enough permissions"
                )
    
    attendances = db.query(Attendance).filter(Attendance.student_id == student_id).all()
    return attendances

@router.put("/{attendance_id}", response_model=AttendanceResponse)
async def update_attendance(
    *,
    db: Session = Depends(get_db),
    attendance_id: int,
    attendance_in: AttendanceUpdate,
    current_user: User = Depends(get_current_user)
) -> Attendance:
    """
    Update attendance record (admin and coach only).
    """
    if current_user.role not in ["super_admin", "admin", "coach", "owner"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough permissions"
        )
    
    attendance = db.query(Attendance).filter(Attendance.id == attendance_id).first()
    if not attendance:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Attendance record not found"
        )
    
    # Check permissions for coaches
    if current_user.role == "coach":
        event = db.query(Event).filter(Event.id == attendance.event_id).first()
        if event:
            group = db.query(Group).filter(Group.id == event.group_id).first()
            is_coach = False
            if group:
                if group.coach_id == current_user.id or any(c.id == current_user.id for c in group.coaches):
                    is_coach = True
            
            if not is_coach:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Coaches can only update attendance for their own groups"
                )
    
    update_data = attendance_in.dict(exclude_unset=True)
    
    # BALANCE ADJUSTMENT LOGIC (If status changes)
    if 'status' in update_data and update_data['status'] != attendance.status:
        event = db.query(Event).filter(Event.id == attendance.event_id).first()
        if event:
            group = db.query(Group).filter(Group.id == event.group_id).first()
            student = db.query(Student).filter(Student.id == attendance.student_id).first()
            
            if group and student and group.subscription_type == "by_class":
                cost_per_class = 0
                if group.classes_per_month > 0:
                    cost_per_class = group.monthly_fee / group.classes_per_month
                
                # 1. Refund if previously charged
                if attendance.status in ["present", "late"]:
                    student.balance += cost_per_class
                
                # 2. Charge if new status requires payment
                if update_data['status'] in ["present", "late"]:
                    student.balance -= cost_per_class
                
                # Update debtor status
                student.is_debtor = student.balance < 0

    for field, value in update_data.items():
        setattr(attendance, field, value)
    
    db.add(attendance)
    db.commit()
    db.refresh(attendance)
    return attendance

@router.get("/student/{student_id}/stats", response_model=AttendanceStats)
async def get_student_attendance_stats(
    student_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> AttendanceStats:
    """
    Get attendance statistics for a student.
    Parents can only view their own children's stats.
    """
    # Validate student exists
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Student not found"
        )
    
    # Check permissions for parents
    if current_user.role == "parent":
        guardian = db.query(StudentGuardian).filter(
            StudentGuardian.student_id == student_id,
            StudentGuardian.user_id == current_user.id
        ).first()
        if not guardian:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not enough permissions"
            )
    
    # Get attendance records
    attendances = db.query(Attendance).filter(Attendance.student_id == student_id).all()
    
    total_events = len(attendances)
    present = sum(1 for a in attendances if a.status == "present")
    absent = sum(1 for a in attendances if a.status == "absent")
    sick = sum(1 for a in attendances if a.status == "sick")
    late = sum(1 for a in attendances if a.status == "late")
    
    attendance_rate = (present + late) / total_events * 100 if total_events > 0 else 0.0
    
    return AttendanceStats(
        total_events=total_events,
        present=present,
        absent=absent,
        sick=sick,
        late=late,
        attendance_rate=round(attendance_rate, 2)
    )


# ==================== Табель посещаемости за месяц ====================

@router.get("/monthly-report")
async def get_monthly_attendance_report(
    group_id: int = Query(..., description="ID группы"),
    year: int = Query(..., description="Год"),
    month: int = Query(..., ge=1, le=12, description="Месяц (1-12)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    📊 Табель посещаемости группы за месяц.
    
    Возвращает:
    - Список тренировок за месяц (дата, время)
    - По каждому ученику: посещено/пропущено и статус по каждой дате
    """
    # Проверка прав доступа
    role = current_user.role.lower() if current_user.role else ""
    if role not in ["super_admin", "admin", "coach", "owner"]:
        raise HTTPException(status_code=403, detail="Недостаточно прав")
    
    # Проверяем группу
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Группа не найдена")
    
    # Тренер может видеть только свои группы (включая вторых тренеров)
    if role == "coach":
        from app.models.group import group_coaches
        is_primary = group.coach_id == current_user.id
        is_secondary = db.query(Group).join(
            group_coaches, Group.id == group_coaches.c.group_id
        ).filter(
            group_coaches.c.coach_id == current_user.id,
            Group.id == group_id
        ).first() is not None
        if not (is_primary or is_secondary):
            raise HTTPException(status_code=403, detail="Нет доступа к этой группе")
    
    # Определяем границы месяца
    first_day = date(year, month, 1)
    last_day_num = monthrange(year, month)[1]
    last_day = date(year, month, last_day_num)
    
    # Получаем все тренировки группы за месяц
    events = db.query(Event).filter(
        and_(
            Event.group_id == group_id,
            Event.start_time >= datetime.combine(first_day, datetime.min.time()),
            Event.start_time <= datetime.combine(last_day, datetime.max.time()),
            Event.status != 'cancelled'  # Исключаем отменённые
        )
    ).order_by(Event.start_time).all()
    
    # Получаем учеников группы
    students = db.query(Student).filter(
        and_(
            Student.group_id == group_id,
            Student.deleted_at.is_(None)  # Только активные
        )
    ).order_by(Student.last_name, Student.first_name).all()
    
    # Собираем все записи посещаемости за месяц для этой группы
    event_ids = [e.id for e in events]
    attendances = db.query(Attendance).filter(
        Attendance.event_id.in_(event_ids)
    ).all() if event_ids else []
    
    # Создаём мапу посещаемости: {event_id: {student_id: status}}
    attendance_map = {}
    for a in attendances:
        if a.event_id not in attendance_map:
            attendance_map[a.event_id] = {}
        attendance_map[a.event_id][a.student_id] = a.status
    
    # Формируем список тренировок (columns)
    training_dates = []
    for event in events:
        training_dates.append({
            "id": event.id,
            "date": event.start_time.strftime("%Y-%m-%d"),
            "day": event.start_time.day,
            "weekday": event.start_time.strftime("%a"),
            "time": event.start_time.strftime("%H:%M"),
            "type": event.type or "training"
        })
    
    # Формируем данные по каждому ученику (rows)
    students_data = []
    for student in students:
        # Собираем статусы по каждой тренировке
        attendance_by_event = {}
        present_count = 0
        absent_count = 0
        late_count = 0
        sick_count = 0
        unmarked_count = 0
        
        for event in events:
            status_val = attendance_map.get(event.id, {}).get(student.id, None)
            attendance_by_event[event.id] = status_val
            
            if status_val == "present":
                present_count += 1
            elif status_val == "absent":
                absent_count += 1
            elif status_val == "late":
                late_count += 1
                # present_count += 1  # Опоздавший считается отдельно, но учитывается в рейтинге
            elif status_val == "sick":
                sick_count += 1
            else:
                unmarked_count += 1
        
        total_events = len(events)
        # Рейтинг = (Присутствовал + Опоздал) / Всего * 100
        attendance_rate = round(((present_count + late_count) / total_events * 100) if total_events > 0 else 0, 1)
        
        students_data.append({
            "id": student.id,
            "name": f"{student.last_name} {student.first_name}",
            "first_name": student.first_name,
            "last_name": student.last_name,
            "avatar_url": student.avatar_url,
            "is_frozen": student.is_frozen,
            # Статусы по каждой тренировке
            "attendance": attendance_by_event,
            # Статистика
            "stats": {
                "total": total_events,
                "present": present_count,
                "absent": absent_count,
                "late": late_count,
                "sick": sick_count,
                "unmarked": unmarked_count,
                "attendance_rate": attendance_rate
            }
        })
    
    # Названия месяцев
    month_names = ['', 'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
                   'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь']
    
    return {
        "group_id": group_id,
        "group_name": group.name,
        "year": year,
        "month": month,
        "month_name": month_names[month],
        "total_trainings": len(events),
        "total_students": len(students),
        "training_dates": training_dates,
        "students": students_data
    }


@router.get("/student/{student_id}/monthly-report")
async def get_student_monthly_report(
    student_id: int,
    year: int = Query(..., description="Год"),
    month: int = Query(..., ge=1, le=12, description="Месяц (1-12)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    📊 Табель посещаемости конкретного ученика за месяц.
    Доступно родителям (для своих детей), тренерам (для своих групп) и админам.
    """
    # 1. Validate student
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    # 2. Check permissions
    if current_user.role == "parent":
        guardian = db.query(StudentGuardian).filter(
            StudentGuardian.student_id == student_id,
            StudentGuardian.user_id == current_user.id
        ).first()
        if not guardian:
            raise HTTPException(status_code=403, detail="Not enough permissions")
    elif current_user.role == "coach":
        if student.group_id:
            group = db.query(Group).filter(Group.id == student.group_id).first()
            if not group or (group.coach_id != current_user.id and not any(c.id == current_user.id for c in group.coaches)):
                 raise HTTPException(status_code=403, detail="Not enough permissions")
    elif current_user.role not in ["admin", "super_admin", "owner"]:
        raise HTTPException(status_code=403, detail="Not enough permissions")

    # 3. Get month range
    first_day = date(year, month, 1)
    last_day_num = monthrange(year, month)[1]
    last_day = date(year, month, last_day_num)

    # 4. Get events for student's group in this month
    if not student.group_id:
        return {
            "student_id": student_id,
            "year": year,
            "month": month,
            "attendance": []
        }

    events = db.query(Event).filter(
        and_(
            Event.group_id == student.group_id,
            Event.start_time >= datetime.combine(first_day, datetime.min.time()),
            Event.start_time <= datetime.combine(last_day, datetime.max.time()),
            Event.status != 'cancelled'
        )
    ).order_by(Event.start_time).all()

    # 5. Get attendance records
    event_ids = [e.id for e in events]
    attendances = db.query(Attendance).filter(
        and_(
            Attendance.student_id == student_id,
            Attendance.event_id.in_(event_ids)
        )
    ).all() if event_ids else []

    attendance_map = {a.event_id: a.status for a in attendances}

    # 6. Build report
    report = []
    present_count = 0
    absent_count = 0
    late_count = 0
    sick_count = 0

    for event in events:
        status_val = attendance_map.get(event.id, "unmarked") # Default to unmarked if no record
        
        if status_val == "present": present_count += 1
        elif status_val == "absent": absent_count += 1
        elif status_val == "late": 
            late_count += 1
            present_count += 1
        elif status_val == "sick": sick_count += 1

        report.append({
            "id": event.id,
            "date": event.start_time.strftime("%Y-%m-%d"),
            "day": event.start_time.day,
            "weekday": event.start_time.strftime("%a"),
            "time": event.start_time.strftime("%H:%M"),
            "type": event.type,
            "status": status_val
        })

    month_names = ['', 'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
                   'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь']

    return {
        "student_id": student_id,
        "student_name": f"{student.first_name} {student.last_name}",
        "year": year,
        "month": month,
        "month_name": month_names[month],
        "total_events": len(events),
        "stats": {
            "present": present_count,
            "absent": absent_count,
            "late": late_count,
            "sick": sick_count,
            "attendance_rate": round((present_count / len(events) * 100) if events else 0, 1)
        },
        "days": report
    }
