from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime

from app.core.deps import get_db, get_current_user
from app.models.lead import Lead, LeadStatus, LeadTask
from app.schemas.lead import LeadCreate, LeadUpdate, LeadResponse, LeadTaskCreate, LeadTaskUpdate, LeadTaskResponse
from app.models.user import User

router = APIRouter(tags=["CRM"])


def require_crm_access(current_user: User):
    role = current_user.role.lower() if current_user.role else ""
    if role in ["super_admin", "owner"]:
        return
    if getattr(current_user, "can_view_crm", False):
        return
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Доступ к CRM запрещён. Обратитесь к руководителю для получения доступа."
    )

@router.post("/", response_model=LeadResponse)
def create_lead(
    lead_in: LeadCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Create a new lead.
    """
    require_crm_access(current_user)
    status_value = lead_in.status or LeadStatus.NEW
    lead = Lead(
        name=lead_in.name,
        phone=lead_in.phone,
        age=lead_in.age,
        next_contact_date=lead_in.next_contact_date,
        status=status_value,
        source=lead_in.source,
        notes=lead_in.notes,
        created_by_id=current_user.id,
        responsible_id=lead_in.responsible_id or current_user.id,
        rejection_reason=lead_in.rejection_reason,
    )
    if status_value == LeadStatus.CALL:
        lead.first_call_at = datetime.utcnow()
    if status_value == LeadStatus.TRIAL:
        now = datetime.utcnow()
        lead.first_trial_at = now
        if not lead.first_call_at:
            lead.first_call_at = now
    db.add(lead)
    db.commit()
    db.refresh(lead)
    return lead

@router.get("/", response_model=List[LeadResponse])
def get_leads(
    status: Optional[str] = Query(None, description="Filter by status"),
    search: Optional[str] = Query(None, description="Search by name or phone"),
    responsible_id: Optional[int] = Query(None, description="Filter by responsible user ID"),
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get all leads with filtering.
    """
    require_crm_access(current_user)
    query = db.query(Lead)
    
    if status:
        query = query.filter(Lead.status == status)
        
    if search:
        search_pattern = f"%{search}%"
        query = query.filter(
            (Lead.name.ilike(search_pattern)) | 
            (Lead.phone.ilike(search_pattern))
        )
    if responsible_id:
        query = query.filter(Lead.responsible_id == responsible_id)
        
    leads = query.offset(skip).limit(limit).all()
    return leads

@router.get("/{lead_id}", response_model=LeadResponse)
def get_lead(
    lead_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get specific lead by ID.
    """
    require_crm_access(current_user)
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    return lead

@router.put("/{lead_id}", response_model=LeadResponse)
def update_lead(
    lead_id: int,
    lead_in: LeadUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Update lead.
    """
    require_crm_access(current_user)
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    previous_status = lead.status
        
    if lead_in.name is not None:
        lead.name = lead_in.name
    if lead_in.phone is not None:
        lead.phone = lead_in.phone
    if lead_in.age is not None:  # New field
        lead.age = lead_in.age
    if lead_in.next_contact_date is not None:  # New field
        lead.next_contact_date = lead_in.next_contact_date
    if lead_in.status is not None:
        lead.status = lead_in.status
    if lead_in.source is not None:
        lead.source = lead_in.source
    if lead_in.notes is not None:
        lead.notes = lead_in.notes
    if lead_in.responsible_id is not None:
        lead.responsible_id = lead_in.responsible_id
    if lead_in.rejection_reason is not None:
        lead.rejection_reason = lead_in.rejection_reason
    if lead.status == LeadStatus.CALL and lead.first_call_at is None:
        lead.first_call_at = datetime.utcnow()
    if lead.status == LeadStatus.TRIAL and lead.first_trial_at is None:
        now = datetime.utcnow()
        lead.first_trial_at = now
        if lead.first_call_at is None:
            lead.first_call_at = now
        
    db.commit()
    db.refresh(lead)
    return lead

@router.delete("/{lead_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_lead(
    lead_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Delete lead.
    """
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
        
    db.delete(lead)
    db.commit()
    return None

@router.put("/{lead_id}/status", response_model=LeadResponse)
def update_lead_status(
    lead_id: int,
    status: str,
    reason: Optional[str] = Query(None, description="Reason for rejection"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Update lead status (drag & drop).
    """
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    previous_status = lead.status
        
    lead.status = status
    if status == LeadStatus.REJECT:
        lead.rejection_reason = reason
    else:
        lead.rejection_reason = None
    if lead.status == LeadStatus.CALL and lead.first_call_at is None:
        lead.first_call_at = datetime.utcnow()
    if lead.status == LeadStatus.TRIAL and lead.first_trial_at is None:
        now = datetime.utcnow()
        lead.first_trial_at = now
        if lead.first_call_at is None:
            lead.first_call_at = now
    db.commit()
    db.refresh(lead)
    return lead


@router.get("/{lead_id}/tasks", response_model=List[LeadTaskResponse])
def get_lead_tasks(
    lead_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_crm_access(current_user)
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    return db.query(LeadTask).filter(LeadTask.lead_id == lead_id).order_by(LeadTask.due_date.is_(None), LeadTask.due_date).all()


@router.post("/{lead_id}/tasks", response_model=LeadTaskResponse, status_code=status.HTTP_201_CREATED)
def create_lead_task(
    lead_id: int,
    task_in: LeadTaskCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_crm_access(current_user)
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    task = LeadTask(
        lead_id=lead_id,
        title=task_in.title,
        due_date=task_in.due_date,
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


@router.put("/{lead_id}/tasks/{task_id}", response_model=LeadTaskResponse)
def update_lead_task(
    lead_id: int,
    task_id: int,
    task_in: LeadTaskUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task = db.query(LeadTask).filter(LeadTask.id == task_id, LeadTask.lead_id == lead_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if task_in.title is not None:
        task.title = task_in.title
    if task_in.due_date is not None:
        task.due_date = task_in.due_date
    if task_in.completed is not None:
        task.completed = task_in.completed
    db.commit()
    db.refresh(task)
    return task


@router.delete("/{lead_id}/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_lead_task(
    lead_id: int,
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task = db.query(LeadTask).filter(LeadTask.id == task_id, LeadTask.lead_id == lead_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    db.delete(task)
    db.commit()
    return None
