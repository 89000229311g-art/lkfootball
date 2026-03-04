from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_, func, case
from typing import List, Optional, Any
from datetime import datetime, timedelta
from ..core.deps import get_db, get_current_user
from ..models.task import Task
from ..models.user import User
from ..schemas.task import TaskCreate, TaskUpdate, Task as TaskSchema

router = APIRouter()

@router.get("/analytics", response_model=Any)
def get_tasks_analytics(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
    days: int = 30
):
    """
    Get task analytics for the last N days.
    Returns:
    - total_tasks
    - completed_tasks
    - completion_rate
    - tasks_by_assignee
    - tasks_by_status
    """
    start_date = datetime.now() - timedelta(days=days)
    
    # 1. Overall Stats
    total_tasks = db.query(Task).filter(Task.created_at >= start_date).count()
    completed_tasks = db.query(Task).filter(
        Task.status == 'done',
        Task.updated_at >= start_date
    ).count()
    
    completion_rate = (completed_tasks / total_tasks * 100) if total_tasks > 0 else 0
    
    # 2. Tasks by Assignee (Efficiency)
    # Using case expression properly for SQLite/PostgreSQL compatibility
    assignee_stats = db.query(
        User.full_name,
        User.phone,
        func.count(Task.id).label('total'),
        func.sum(case((Task.status == 'done', 1), else_=0)).label('completed'),
        func.sum(case((Task.status == 'in_progress', 1), else_=0)).label('in_progress')
    ).select_from(Task)\
     .join(User, Task.assignee_id == User.id)\
     .filter(Task.created_at >= start_date)\
     .group_by(User.id, User.full_name, User.phone)\
     .all()
    
    assignee_data = []
    for stat in assignee_stats:
        # stat is a tuple/row, access by index or name
        total = stat[2]
        completed = stat[3] or 0
        in_progress = stat[4] or 0
        
        assignee_data.append({
            "name": stat[0] or stat[1] or "Unknown", # full_name or phone
            "total": total,
            "completed": completed,
            "in_progress": in_progress,
            "rate": round((completed / total * 100), 1) if total > 0 else 0
        })
        
    return {
        "period_days": days,
        "total_tasks": total_tasks,
        "completed_tasks": completed_tasks,
        "completion_rate": round(completion_rate, 1),
        "assignee_stats": assignee_data
    }

@router.get("/", response_model=List[TaskSchema])
def get_tasks(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
    status: Optional[str] = None,
    days: int = 30,  # For done tasks retention
    skip: int = 0,
    limit: int = 100
):
    """
    Get tasks with smart filtering.
    By default returns:
    - All ACTIVE tasks (todo, in_progress, review)
    - DONE tasks only from the last 30 days (to prevent board clutter)
    """
    query = db.query(Task)
    
    if status:
        query = query.filter(Task.status == status)
    else:
        # Smart Filter: All active OR (Done AND recent)
        cutoff_date = datetime.now() - timedelta(days=days)
        
        query = query.filter(
            or_(
                Task.status.in_(['todo', 'in_progress', 'review']),
                and_(
                    Task.status == 'done',
                    Task.updated_at >= cutoff_date
                )
            )
        )
    
    # Order by priority (High first) and due date
    tasks = query.order_by(Task.priority.desc(), Task.due_date.asc()).offset(skip).limit(limit).all()
    return tasks

@router.post("/", response_model=TaskSchema)
def create_task(
    task: TaskCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    db_task = Task(**task.model_dump(), created_by_id=current_user.id)
    db.add(db_task)
    db.commit()
    db.refresh(db_task)
    return db_task

@router.get("/{task_id}", response_model=TaskSchema)
def get_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task

@router.put("/{task_id}", response_model=TaskSchema)
def update_task(
    task_id: int,
    task_update: TaskUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    db_task = db.query(Task).filter(Task.id == task_id).first()
    if not db_task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    update_data = task_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_task, key, value)
    
    db.commit()
    db.refresh(db_task)
    return db_task

@router.delete("/{task_id}")
def delete_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    db_task = db.query(Task).filter(Task.id == task_id).first()
    if not db_task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    db.delete(db_task)
    db.commit()
    return {"ok": True}
