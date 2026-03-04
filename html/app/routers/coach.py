from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import and_

from app.core.deps import get_db, get_current_user
from app.models import User, Group, Student, StudentGuardian
from app.schemas.coach import GroupWithStudentsAndParents, StudentWithParents, ParentInfo
from app.schemas.group import GroupResponse

router = APIRouter()


@router.get("/my-groups", response_model=List[GroupResponse])
async def get_coach_groups(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> List[Group]:
    """
    Get all groups assigned to the current coach (simple list).
    Only accessible by coaches.
    """
    if current_user.role.lower() != "coach":
        raise HTTPException(
            status_code=403,
            detail="Only coaches can access this endpoint"
        )
    
    # Get coach's groups (primary or secondary)
    groups = db.query(Group).filter(
        (Group.coach_id == current_user.id) | 
        (Group.coaches.any(id=current_user.id))
    ).all()
    return groups


@router.get("/my-groups-with-students", response_model=List[GroupWithStudentsAndParents])
async def get_coach_groups_with_students(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> List[Group]:
    """
    Get all groups assigned to the current coach with detailed student and parent information.
    Only accessible by coaches.
    """
    # Verify user is a coach
    if current_user.role.lower() != "coach":
        raise HTTPException(
            status_code=403,
            detail="Only coaches can access this endpoint"
        )
    
    # Get coach's groups (primary or secondary)
    groups = db.query(Group).filter(
        (Group.coach_id == current_user.id) | 
        (Group.coaches.any(id=current_user.id))
    ).all()
    
    result = []
    
    for group in groups:
        # Get students in this group
        students = db.query(Student).filter(Student.group_id == group.id).all()
        
        students_with_parents = []
        
        for student in students:
            # Get parents/guardians for this student
            guardians = db.query(StudentGuardian).filter(
                StudentGuardian.student_id == student.id
            ).all()
            
            parents = []
            for guardian in guardians:
                parent_user = db.query(User).filter(User.id == guardian.user_id).first()
                if parent_user:
                    parents.append(ParentInfo(
                        id=parent_user.id,
                        full_name=parent_user.full_name,
                        phone=parent_user.phone,
                        phone_secondary=parent_user.phone_secondary,
                        avatar_url=parent_user.avatar_url
                    ))
            
            # If no guardians found, try to find parent by phone match
            if not parents and student.parent_phone:
                parent_user = db.query(User).filter(User.phone == student.parent_phone).first()
                if parent_user:
                    parents.append(ParentInfo(
                        id=parent_user.id,
                        full_name=parent_user.full_name,
                        phone=parent_user.phone,
                        phone_secondary=parent_user.phone_secondary,
                        avatar_url=parent_user.avatar_url
                    ))
            
            students_with_parents.append(StudentWithParents(
                id=student.id,
                first_name=student.first_name,
                last_name=student.last_name,
                dob=student.dob,
                avatar_url=student.avatar_url,
                status=student.status,
                parents=parents
            ))
        
        result.append(GroupWithStudentsAndParents(
            id=group.id,
            name=group.name,
            students=students_with_parents
        ))
    
    return result