from typing import Any, List
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from sqlalchemy.orm import Session
import shutil
import os
from uuid import uuid4

from app.core.deps import get_db, get_current_user
from app.models import User, TrainingPlan, MediaReport, Event, UserRole
from app.schemas.training import TrainingPlanCreate, TrainingPlanUpdate, TrainingPlan as TrainingPlanSchema, MediaReport as MediaReportSchema

router = APIRouter()

# --- Training Plans ---

@router.post("/plans", response_model=TrainingPlanSchema)
async def create_training_plan(
    plan_in: TrainingPlanCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Any:
    """Create a training plan for an event."""
    if current_user.role not in [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.COACH]:
        raise HTTPException(status_code=403, detail="Not enough permissions")

    event = db.query(Event).filter(Event.id == plan_in.event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    # Check if plan already exists
    existing_plan = db.query(TrainingPlan).filter(TrainingPlan.event_id == plan_in.event_id).first()
    if existing_plan:
        raise HTTPException(status_code=400, detail="Training plan already exists for this event")

    plan = TrainingPlan(
        event_id=plan_in.event_id,
        coach_id=current_user.id,
        objectives=plan_in.objectives,
        theme=plan_in.theme
    )
    db.add(plan)
    db.commit()
    db.refresh(plan)
    return plan

@router.put("/plans/{plan_id}", response_model=TrainingPlanSchema)
async def update_training_plan(
    plan_id: int,
    plan_in: TrainingPlanUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Any:
    """Update a training plan."""
    if current_user.role not in [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.COACH]:
        raise HTTPException(status_code=403, detail="Not enough permissions")

    plan = db.query(TrainingPlan).filter(TrainingPlan.id == plan_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Training plan not found")

    if plan_in.objectives is not None:
        plan.objectives = plan_in.objectives
    if plan_in.theme is not None:
        plan.theme = plan_in.theme

    db.commit()
    db.refresh(plan)
    return plan

@router.get("/plans/event/{event_id}", response_model=TrainingPlanSchema)
async def get_training_plan_by_event(
    event_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Any:
    """Get training plan by event ID."""
    plan = db.query(TrainingPlan).filter(TrainingPlan.event_id == event_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Training plan not found")
    
    # If parent, hide objectives? The requirement says:
    # "Родители видят только тему занятия (например: «Отработка паса»)."
    # However, the schema returns everything. The frontend can hide it, 
    # OR we can filter it here. Let's filter here for better security.
    if current_user.role == UserRole.PARENT:
        plan.objectives = None
        
    return plan

# --- Media Reports ---

@router.post("/media/upload", response_model=MediaReportSchema)
async def upload_media_report(
    event_id: int = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Any:
    """Upload a photo/video for an event."""
    if current_user.role not in [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.COACH]:
        raise HTTPException(status_code=403, detail="Not enough permissions")

    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    # Save file
    file_ext = os.path.splitext(file.filename)[1]
    filename = f"{uuid4()}{file_ext}"
    
    # Determine type
    media_type = "photo"
    if file.content_type.startswith("video"):
        media_type = "video"
        
    # Directory structure: uploads/events/{event_id}/
    upload_dir = f"uploads/events/{event_id}"
    os.makedirs(upload_dir, exist_ok=True)
    file_path = f"{upload_dir}/{filename}"
    
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    # Create DB entry
    media = MediaReport(
        event_id=event_id,
        url=f"/{file_path}", # Relative URL
        type=media_type
    )
    db.add(media)
    db.commit()
    db.refresh(media)
    
    # Notify parents (Mock logic for now, or just rely on them pulling the data)
    # TODO: Implement Push Notifications
    
    return media

@router.get("/media/event/{event_id}", response_model=List[MediaReportSchema])
async def get_media_reports(
    event_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Any:
    """Get all media reports for an event."""
    # Parents should only see reports for events their kids participated in?
    # For now, let's allow if they have access to the event.
    media = db.query(MediaReport).filter(MediaReport.event_id == event_id).all()
    return media
