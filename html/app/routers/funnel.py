from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from app.core.deps import get_db, get_current_user
from app.models.funnel import FunnelStage
from app.schemas.funnel import FunnelStageCreate, FunnelStageUpdate, FunnelStageResponse
from app.models.user import User

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

router = APIRouter(prefix="/funnel", tags=["CRM Settings"])

@router.get("/", response_model=List[FunnelStageResponse])
def get_stages(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get all funnel stages ordered by 'order' field.
    """
    require_crm_access(current_user)
    return db.query(FunnelStage).order_by(FunnelStage.order).all()

@router.post("/", response_model=FunnelStageResponse)
def create_stage(
    stage_in: FunnelStageCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Create a new funnel stage.
    """
    require_crm_access(current_user)
    # Check if key exists
    if db.query(FunnelStage).filter(FunnelStage.key == stage_in.key).first():
        raise HTTPException(status_code=400, detail="Stage key already exists")

    stage = FunnelStage(**stage_in.model_dump())
    db.add(stage)
    db.commit()
    db.refresh(stage)
    return stage

@router.put("/{stage_id}", response_model=FunnelStageResponse)
def update_stage(
    stage_id: int,
    stage_in: FunnelStageUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Update a funnel stage.
    """
    require_crm_access(current_user)
    stage = db.query(FunnelStage).filter(FunnelStage.id == stage_id).first()
    if not stage:
        raise HTTPException(status_code=404, detail="Stage not found")

    if stage_in.title is not None:
        stage.title = stage_in.title
    if stage_in.color is not None:
        stage.color = stage_in.color
    if stage_in.order is not None:
        stage.order = stage_in.order

    db.commit()
    db.refresh(stage)
    return stage

@router.delete("/{stage_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_stage(
    stage_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    require_crm_access(current_user)
    stage = db.query(FunnelStage).filter(FunnelStage.id == stage_id).first()
    if not stage:
        raise HTTPException(status_code=404, detail="Stage not found")

    db.delete(stage)
    db.commit()
    return None

@router.post("/reorder", response_model=List[FunnelStageResponse])
def reorder_stages(
    ordered_ids: List[int],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Update order of stages based on list of IDs.
    """
    require_crm_access(current_user)
    stages = db.query(FunnelStage).filter(FunnelStage.id.in_(ordered_ids)).all()
    stage_map = {s.id: s for s in stages}

    for index, stage_id in enumerate(ordered_ids):
        if stage_id in stage_map:
            stage_map[stage_id].order = index

    db.commit()
    return db.query(FunnelStage).order_by(FunnelStage.order).all()

@router.post("/init-defaults")
def init_default_stages(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Initialize default stages if table is empty.
    """
    require_crm_access(current_user)
    if db.query(FunnelStage).count() > 0:
        return {"message": "Stages already initialized"}

    defaults = [
        {"key": "new", "title": "Новый лид", "color": "bg-blue-500", "order": 0, "is_system": True},
        {"key": "call", "title": "Звонок", "color": "bg-yellow-500", "order": 1, "is_system": True},
        {"key": "trial", "title": "Первая тренировка", "color": "bg-purple-500", "order": 2, "is_system": True},
        {"key": "offer", "title": "Оффер", "color": "bg-indigo-500", "order": 3, "is_system": True},
        {"key": "deal", "title": "Сделка", "color": "bg-green-500", "order": 4, "is_system": True},
        {"key": "success", "title": "Успех", "color": "bg-emerald-600", "order": 5, "is_system": True},
        {"key": "reject", "title": "Отказ", "color": "bg-red-500", "order": 6, "is_system": True},
    ]

    for data in defaults:
        stage = FunnelStage(**data)
        db.add(stage)
    
    db.commit()
    return {"message": "Default stages initialized"}
