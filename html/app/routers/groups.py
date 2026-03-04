from typing import List
from datetime import date
from fastapi import APIRouter, Depends, HTTPException, status, Query
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session, joinedload, subqueryload
from sqlalchemy import func

from app.core.deps import get_db, get_current_user
from app.core.audit_service import log_create, log_update, log_delete, entity_to_dict
from app.models import User, Group, Student, StudentGroupHistory
from app.models.group import group_coaches
from app.schemas.group import (
    GroupCreate,
    GroupUpdate,
    GroupResponse,
    GroupWithDetails,
    GroupPagination,
    BulkTransferStudents,
    BulkTransferResponse,
    AddCoachesToGroup,
    RemoveCoachFromGroup
)
from app.schemas.student import StudentResponse

router = APIRouter()

@router.post("/", response_model=GroupResponse)
async def create_group(
    *,
    db: Session = Depends(get_db),
    group_in: GroupCreate,
    current_user: User = Depends(get_current_user)
) -> Group:
    """
    Create a new group (admin only).
    Supports multiple coaches via coach_ids parameter.
    """
    user_role = current_user.role.lower() if current_user.role else ""
    if user_role not in ["super_admin", "admin", "owner"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough permissions"
        )
    
    # Validate primary coach exists if provided
    if group_in.coach_id:
        coach = db.query(User).filter(User.id == group_in.coach_id).first()
        if not coach or (coach.role and coach.role.lower() != "coach"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid coach user - user must have coach role"
            )
    
    # Validate multiple coaches if provided
    coaches_to_add = []
    if group_in.coach_ids:
        for cid in group_in.coach_ids:
            coach = db.query(User).filter(User.id == cid).first()
            if not coach or (coach.role and coach.role.lower() != "coach"):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid coach ID {cid} - user must have coach role"
                )
            coaches_to_add.append(coach)
    
    group = Group(
        name=group_in.name,
        age_group=group_in.age_group,
        coach_id=group_in.coach_id,
        subscription_type=group_in.subscription_type,
        monthly_fee=group_in.monthly_fee,
        classes_per_month=group_in.classes_per_month,
        payment_due_day=group_in.payment_due_day
    )
    db.add(group)
    db.flush()  # Get group ID
    
    # Add multiple coaches
    if coaches_to_add:
        group.coaches = coaches_to_add
    
    db.commit()
    db.refresh(group)
    
    # Log creation in audit
    log_create(db, "group", group, user=current_user)
    db.commit()
    
    return group

@router.get("/", response_model=GroupPagination)
async def get_groups(
    skip: int = 0,
    limit: int = 10000,
    include_deleted: bool = Query(False, description="Include deleted groups"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Retrieve groups with student count and details. 
    - Admins see all groups
    - Coaches see only their assigned groups
    - Parents see groups of their children
    """
    user_role = current_user.role.lower() if current_user.role else ""
    query = db.query(Group)
    
    # Filter out deleted groups unless requested
    if not include_deleted:
        query = query.filter(Group.deleted_at.is_(None))
    
    if user_role in ["super_admin", "admin", "owner"]:
        # Admins see all groups
        pass
    elif user_role == "coach":
        # Coaches see only their groups (primary or secondary)
        query = query.filter(
            (Group.coach_id == current_user.id) | 
            (Group.coaches.any(id=current_user.id))
        )
    elif user_role == "parent":
        # Parents see only groups their children belong to
        from app.models.student_guardian import StudentGuardian
        children_groups = db.query(Student.group_id).join(StudentGuardian).filter(
            StudentGuardian.user_id == current_user.id
        ).all()
        parent_group_ids = [g[0] for g in children_groups if g[0]]
        
        if parent_group_ids:
            query = query.filter(Group.id.in_(parent_group_ids))
        else:
            # If parent has no children in groups, return empty
            return {
                "data": [],
                "total": 0,
                "skip": skip,
                "limit": limit,
                "pages": 0
            }
    
    total = query.count()
    
    # Subquery to count active students
    student_count_subquery = (
        db.query(func.count(Student.id))
        .filter(Student.group_id == Group.id)
        .filter(Student.deleted_at.is_(None))
        .correlate(Group)
        .scalar_subquery()
    )
    
    # Query groups with student count
    groups_with_counts = (
        query.with_entities(Group, student_count_subquery.label("student_count"))
        .options(joinedload(Group.coaches))
        .offset(skip)
        .limit(limit)
        .all()
    )
    
    # Добавляем students_count для каждой группы
    # Скрываем финансовую информацию от тренеров
    hide_financial = user_role == "coach"
    
    result = []
    for group, s_count in groups_with_counts:
        students_count = s_count or 0
        
        result.append({
            "id": group.id,
            "name": group.name,
            "age_group": group.age_group,
            "coach_id": group.coach_id,
            "subscription_type": group.subscription_type,
            "monthly_fee": 0 if hide_financial else group.monthly_fee,
            "classes_per_month": group.classes_per_month,
            "payment_due_day": group.payment_due_day,
            "coach": None,
            "coaches": [
                {"id": c.id, "phone": c.phone, "full_name": c.full_name, "avatar_url": c.avatar_url}
                for c in group.coaches
            ],
            "students": [],  # We don't need full student list here for performance
            "students_count": students_count,
            "deleted_at": group.deleted_at
        })
    
    return JSONResponse(content={
        "data": result,
        "total": total,
        "skip": skip,
        "limit": limit,
        "pages": (total + limit - 1) // limit if limit > 0 else 0
    })

@router.get("/{group_id}", response_model=GroupWithDetails)
async def get_group(
    group_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Group:
    """
    Get group by ID with details.
    """
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Group not found"
        )
    
    # Check permissions for coaches
    user_role = current_user.role.lower() if current_user.role else ""
    if user_role == "coach" and group.coach_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough permissions"
        )
    
    # Calculate student count
    students_count = db.query(Student).filter(
        Student.group_id == group.id,
        Student.deleted_at.is_(None)
    ).count()
    
    # Load students for details
    students = db.query(Student).filter(
        Student.group_id == group.id,
        Student.deleted_at.is_(None)
    ).all()
    
    students_data = [
        {
            "id": s.id, 
            "first_name": s.first_name, 
            "last_name": s.last_name, 
            "status": s.status, 
            "is_debtor": s.is_debtor,
            "avatar_url": s.avatar_url
        } 
        for s in students
    ]
    
    # Load coaches
    coaches_data = [
        {"id": c.id, "phone": c.phone, "full_name": c.full_name, "avatar_url": c.avatar_url}
        for c in group.coaches
    ]
    
    return JSONResponse(content={
        "id": group.id,
        "name": group.name,
        "age_group": group.age_group,
        "coach_id": group.coach_id,
        "subscription_type": group.subscription_type,
        "monthly_fee": group.monthly_fee,
        "classes_per_month": group.classes_per_month,
        "payment_due_day": group.payment_due_day,
        "coach": None,
        "coaches": coaches_data,
        "students": students_data,
        "students_count": students_count,
        "deleted_at": group.deleted_at.isoformat() if group.deleted_at else None
    })

@router.put("/{group_id}", response_model=GroupResponse)
async def update_group(
    *,
    db: Session = Depends(get_db),
    group_id: int,
    group_in: GroupUpdate,
    current_user: User = Depends(get_current_user)
) -> Group:
    """
    Update group information (admin only).
    Supports multiple coaches via coach_ids parameter.
    """
    user_role = current_user.role.lower() if current_user.role else ""
    if user_role not in ["super_admin", "admin", "owner"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough permissions"
        )
    
    group = db.query(Group).filter(Group.id == group_id, Group.deleted_at.is_(None)).first()
    if not group:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Group not found"
        )
    
    # Save old data for audit
    old_data = entity_to_dict(group)
    
    # Validate primary coach if provided
    if group_in.coach_id is not None:
        if group_in.coach_id:  # If coach_id is not 0/empty
            coach = db.query(User).filter(User.id == group_in.coach_id).first()
            if not coach or (coach.role and coach.role.lower() != "coach"):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid coach user - user must have coach role"
                )
    
    # Validate and update multiple coaches if provided
    if group_in.coach_ids is not None:
        coaches_to_add = []
        for cid in group_in.coach_ids:
            coach = db.query(User).filter(User.id == cid).first()
            if not coach or (coach.role and coach.role.lower() != "coach"):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid coach ID {cid} - user must have coach role"
                )
            coaches_to_add.append(coach)
        group.coaches = coaches_to_add
    
    update_data = group_in.dict(exclude_unset=True, exclude={"coach_ids"})
    for field, value in update_data.items():
        setattr(group, field, value)
    
    db.add(group)
    db.commit()
    db.refresh(group)
    
    # Log update in audit
    log_update(db, "group", group, old_data, user=current_user)
    db.commit()
    
    return group

@router.delete("/{group_id}")
async def delete_group(
    *,
    db: Session = Depends(get_db),
    group_id: int,
    force: bool = Query(False, description="Deprecated - groups with students are now always deleted together"),
    current_user: User = Depends(get_current_user)
):
    """
    Delete a group (admin only) - uses soft delete.
    
    🔄 КАСКАДНОЕ УДАЛЕНИЕ:
    - Группа удаляется вместе со всеми учениками
    - Все могут быть восстановлены из корзины
    - При восстановлении группы ученики восстанавливаются автоматически
    """
    from app.core.timezone import now_naive
    
    user_role = current_user.role.lower() if current_user.role else ""
    if user_role not in ["super_admin", "admin", "owner"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough permissions"
        )
    
    group = db.query(Group).filter(Group.id == group_id, Group.deleted_at.is_(None)).first()
    if not group:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Group not found"
        )
    
    # Count students in group (for informational purposes)
    students_count = db.query(Student).filter(
        Student.group_id == group_id,
        Student.deleted_at.is_(None)
    ).count()
    
    # ❌ BLOCK DELETION IF STUDENTS EXIST
    if students_count > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Нельзя удалить группу с учениками ({students_count} чел.). Сначала перенесите их в другую группу или удалите."
        )
    
    orphaned_parents_count = 0
    
    try:
        # Log deletion BEFORE soft delete
        log_delete(db, "group", group, user=current_user)
        
        # Delete related schedule templates first
        from app.models.schedule_template import ScheduleTemplate
        db.query(ScheduleTemplate).filter(ScheduleTemplate.group_id == group_id).delete()
        
        # Remove coaches from group
        group.coaches = []
        group.coach_id = None
        
        # Soft delete the group
        group.deleted_at = now_naive()
        group.deleted_by_id = current_user.id
        group.deletion_reason = f"Удалена администратором"
        db.add(group)
        
        db.commit()
        
        return {"message": "Группа успешно удалена", "students_deleted": 0, "orphaned_parents_deleted": 0}
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error deleting group: {str(e)}"
        )

@router.get("/{group_id}/students", response_model=List[StudentResponse])
async def get_group_students(
    group_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> List[dict]:
    """
    Get all students in a group.
    """
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Group not found"
        )
    
    # Check permissions for coaches
    user_role = current_user.role.lower() if current_user.role else ""
    if user_role == "coach" and group.coach_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough permissions"
        )
    
    students = db.query(Student).filter(Student.group_id == group_id).all()
    return [{
        "id": s.id,
        "first_name": s.first_name,
        "last_name": s.last_name,
        "dob": s.dob,
        "status": s.status,
        "group_id": s.group_id,
        "avatar_url": s.avatar_url,
        "parent_phone": s.parent_phone,
        "balance": s.balance,
        "is_debtor": s.is_debtor
    } for s in students]

@router.put("/{group_id}/coach/{user_id}", response_model=GroupResponse)
async def assign_coach(
    *,
    db: Session = Depends(get_db),
    group_id: int,
    user_id: int,
    current_user: User = Depends(get_current_user)
) -> Group:
    """
    Assign a primary coach to a group (admin only).
    For multiple coaches, use POST /{group_id}/coaches endpoint.
    """
    user_role = current_user.role.lower() if current_user.role else ""
    if user_role not in ["super_admin", "admin", "owner"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough permissions"
        )
    
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Group not found"
        )
    
    # Validate coach user
    coach = db.query(User).filter(User.id == user_id).first()
    if not coach or (coach.role and coach.role.lower() != "coach"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid coach user - user must have coach role"
        )
    
    old_data = entity_to_dict(group)
    group.coach_id = user_id
    
    # Log update
    log_update(db, "group", group, old_data, user=current_user)
    
    db.add(group)
    db.commit()
    db.refresh(group)
    return group


# ============ BULK TRANSFER STUDENTS ============

@router.post("/transfer-students", response_model=BulkTransferResponse)
async def bulk_transfer_students(
    *,
    db: Session = Depends(get_db),
    transfer_data: BulkTransferStudents,
    current_user: User = Depends(get_current_user)
):
    """
    🔄 Массовый перенос учеников из одной группы в другую.
    
    Принимает список ID учеников и ID целевой группы.
    Возвращает количество успешно перенесённых учеников.
    """
    user_role = current_user.role.lower() if current_user.role else ""
    if user_role not in ["super_admin", "admin", "owner"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough permissions"
        )
    
    # Validate target group exists
    target_group = db.query(Group).filter(
        Group.id == transfer_data.target_group_id,
        Group.deleted_at.is_(None)
    ).first()
    if not target_group:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Target group not found"
        )
    
    transferred = 0
    failed_ids = []
    
    for student_id in transfer_data.student_ids:
        student = db.query(Student).filter(
            Student.id == student_id,
            Student.deleted_at.is_(None)
        ).first()
        
        if student:
            # Skip if already in target group
            if student.group_id == transfer_data.target_group_id:
                continue

            # 1. Close old history record if exists
            if student.group_id:
                old_history = db.query(StudentGroupHistory).filter(
                    StudentGroupHistory.student_id == student.id,
                    StudentGroupHistory.group_id == student.group_id,
                    StudentGroupHistory.left_at.is_(None)
                ).first()
                
                if old_history:
                    old_history.left_at = date.today()
                    db.add(old_history)
            
            # 2. Create new history record
            new_history = StudentGroupHistory(
                student_id=student.id,
                group_id=transfer_data.target_group_id,
                joined_at=date.today()
            )
            db.add(new_history)

            # 3. Update student group
            old_data = entity_to_dict(student)
            student.group_id = transfer_data.target_group_id
            
            # Log update
            log_update(db, "student", student, old_data, user=current_user)
            
            db.add(student)
            transferred += 1
        else:
            failed_ids.append(student_id)
    
    db.commit()
    
    return BulkTransferResponse(
        success=True,
        transferred_count=transferred,
        message=f"✅ Успешно переведено {transferred} учеников в группу '{target_group.name}'",
        failed_ids=failed_ids
    )


@router.post("/{group_id}/transfer-all")
async def transfer_all_students_from_group(
    *,
    db: Session = Depends(get_db),
    group_id: int,
    target_group_id: int = Query(..., gt=0, description="Target group ID"),
    current_user: User = Depends(get_current_user)
):
    """
    🔄 Перевести ВСЕХ учеников из одной группы в другую.
    
    Удобно для расформирования группы перед удалением.
    """
    user_role = current_user.role.lower() if current_user.role else ""
    if user_role not in ["super_admin", "admin", "owner"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough permissions"
        )
    
    # Validate source group
    source_group = db.query(Group).filter(
        Group.id == group_id,
        Group.deleted_at.is_(None)
    ).first()
    if not source_group:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Source group not found"
        )
    
    # Validate target group
    target_group = db.query(Group).filter(
        Group.id == target_group_id,
        Group.deleted_at.is_(None)
    ).first()
    if not target_group:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Target group not found"
        )
    
    if group_id == target_group_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Source and target groups must be different"
        )
    
    # Transfer all students
    students_to_transfer = db.query(Student).filter(
        Student.group_id == group_id,
        Student.deleted_at.is_(None)
    ).all()
    
    transferred_count = 0
    for student in students_to_transfer:
        old_data = entity_to_dict(student)
        student.group_id = target_group_id
        
        # Log update
        log_update(db, "student", student, old_data, user=current_user)
        db.add(student)
        transferred_count += 1
    
    db.commit()
    
    return {
        "success": True,
        "transferred_count": transferred_count,
        "message": f"✅ Все {transferred_count} учеников переведены из '{source_group.name}' в '{target_group.name}'"
    }


# ============ MULTIPLE COACHES MANAGEMENT ============

@router.post("/{group_id}/coaches")
async def add_coaches_to_group(
    *,
    db: Session = Depends(get_db),
    group_id: int,
    data: AddCoachesToGroup,
    current_user: User = Depends(get_current_user)
):
    """
    👥 Добавить тренеров в группу (можно добавлять нескольких).
    
    Тренеры добавляются к уже существующим, не заменяя их.
    """
    user_role = current_user.role.lower() if current_user.role else ""
    if user_role not in ["super_admin", "admin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough permissions"
        )
    
    group = db.query(Group).filter(
        Group.id == group_id,
        Group.deleted_at.is_(None)
    ).first()
    if not group:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Group not found"
        )
    
    added_coaches = []
    already_assigned = []
    invalid_ids = []
    
    current_coach_ids = {c.id for c in group.coaches}
    
    old_data = entity_to_dict(group)
    
    for coach_id in data.coach_ids:
        coach = db.query(User).filter(User.id == coach_id).first()
        
        if not coach or (coach.role and coach.role.lower() != "coach"):
            invalid_ids.append(coach_id)
            continue
        
        if coach_id in current_coach_ids:
            already_assigned.append(coach.full_name)
            continue
        
        group.coaches.append(coach)
        added_coaches.append(coach.full_name)
    
    if added_coaches:
        log_update(db, "group", group, old_data, user=current_user, reason=f"Added coaches: {', '.join(added_coaches)}")
    
    db.commit()
    
    message_parts = []
    if added_coaches:
        message_parts.append(f"✅ Добавлены: {', '.join(added_coaches)}")
    if already_assigned:
        message_parts.append(f"⚠️ Уже назначены: {', '.join(already_assigned)}")
    if invalid_ids:
        message_parts.append(f"❌ Неверные ID: {invalid_ids}")
    
    return {
        "success": len(added_coaches) > 0,
        "added_count": len(added_coaches),
        "message": " | ".join(message_parts) if message_parts else "No changes made",
        "coaches": [{"id": c.id, "full_name": c.full_name} for c in group.coaches]
    }


@router.delete("/{group_id}/coaches/{coach_id}")
async def remove_coach_from_group(
    *,
    db: Session = Depends(get_db),
    group_id: int,
    coach_id: int,
    current_user: User = Depends(get_current_user)
):
    """
    ❌ Удалить тренера из группы.
    
    Если удаляется основной тренер (coach_id), он также будет убран.
    """
    user_role = current_user.role.lower() if current_user.role else ""
    if user_role not in ["super_admin", "admin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough permissions"
        )
    
    group = db.query(Group).filter(
        Group.id == group_id,
        Group.deleted_at.is_(None)
    ).first()
    if not group:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Group not found"
        )
    
    coach = db.query(User).filter(User.id == coach_id).first()
    if not coach:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Coach not found"
        )
    
    removed = False
    old_data = entity_to_dict(group)
    
    # Remove from multiple coaches list
    if coach in group.coaches:
        group.coaches.remove(coach)
        removed = True
    
    # Also remove if this is the primary coach
    if group.coach_id == coach_id:
        group.coach_id = None
        removed = True
    
    if not removed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Coach '{coach.full_name}' is not assigned to this group"
        )
    
    log_update(db, "group", group, old_data, user=current_user, reason=f"Removed coach: {coach.full_name}")
    
    db.commit()
    
    return {
        "success": True,
        "message": f"✅ Тренер '{coach.full_name}' удалён из группы '{group.name}'",
        "remaining_coaches": [{"id": c.id, "full_name": c.full_name} for c in group.coaches]
    }


@router.get("/{group_id}/coaches")
async def get_group_coaches(
    *,
    db: Session = Depends(get_db),
    group_id: int,
    current_user: User = Depends(get_current_user)
):
    """
    📋 Получить список всех тренеров группы.
    """
    group = db.query(Group).filter(
        Group.id == group_id,
        Group.deleted_at.is_(None)
    ).first()
    if not group:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Group not found"
        )
    
    # Combine primary coach and additional coaches
    all_coaches = []
    seen_ids = set()
    
    if group.coach:
        all_coaches.append({
            "id": group.coach.id,
            "full_name": group.coach.full_name,
            "phone": group.coach.phone,
            "avatar_url": group.coach.avatar_url,
            "is_primary": True
        })
        seen_ids.add(group.coach.id)
    
    for coach in group.coaches:
        if coach.id not in seen_ids:
            all_coaches.append({
                "id": coach.id,
                "full_name": coach.full_name,
                "phone": coach.phone,
                "avatar_url": coach.avatar_url,
                "is_primary": False
            })
            seen_ids.add(coach.id)
    
    return {
        "group_id": group_id,
        "group_name": group.name,
        "coaches": all_coaches,
        "total": len(all_coaches)
    }
