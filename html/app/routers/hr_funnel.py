from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from app.core.deps import get_db, get_current_user
from app.models.hr_funnel import HRFunnelStage
from app.schemas.hr_funnel import (
    HRFunnelStageCreate,
    HRFunnelStageUpdate,
    HRFunnelStageResponse,
)
from app.models.user import User


router = APIRouter(prefix="/hr/funnel", tags=["HR Settings"])


@router.get("/", response_model=List[HRFunnelStageResponse])
def get_hr_stages(
    db: Session = Depends(get_db),
):
    return db.query(HRFunnelStage).order_by(HRFunnelStage.order).all()


@router.post("/", response_model=HRFunnelStageResponse)
def create_hr_stage(
    stage_in: HRFunnelStageCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if db.query(HRFunnelStage).filter(HRFunnelStage.key == stage_in.key).first():
        raise HTTPException(status_code=400, detail="Stage key already exists")

    stage = HRFunnelStage(**stage_in.model_dump())
    db.add(stage)
    db.commit()
    db.refresh(stage)
    return stage


@router.put("/{stage_id}", response_model=HRFunnelStageResponse)
def update_hr_stage(
    stage_id: int,
    stage_in: HRFunnelStageUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    stage = db.query(HRFunnelStage).filter(HRFunnelStage.id == stage_id).first()
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
def delete_hr_stage(
    stage_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    stage = db.query(HRFunnelStage).filter(HRFunnelStage.id == stage_id).first()
    if not stage:
        raise HTTPException(status_code=404, detail="Stage not found")

    db.delete(stage)
    db.commit()
    return None


@router.post("/reorder", response_model=List[HRFunnelStageResponse])
def reorder_hr_stages(
    ordered_ids: List[int],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    stages = db.query(HRFunnelStage).filter(HRFunnelStage.id.in_(ordered_ids)).all()
    stage_map = {s.id: s for s in stages}

    for index, stage_id in enumerate(ordered_ids):
        if stage_id in stage_map:
            stage_map[stage_id].order = index

    db.commit()
    return db.query(HRFunnelStage).order_by(HRFunnelStage.order).all()


@router.post("/init-defaults")
def init_default_hr_stages(
    db: Session = Depends(get_db),
):
    if db.query(HRFunnelStage).count() > 0:
        return {"message": "HR stages already initialized"}

    defaults = [
        {
            "key": "new",
            "title": "Отклик / Новое резюме",
            "color": "bg-blue-500",
            "order": 0,
            "is_system": True,
        },
        {
            "key": "screening",
            "title": "Первичное интервью",
            "color": "bg-yellow-500",
            "order": 1,
            "is_system": True,
        },
        {
            "key": "trial",
            "title": "Тестовое задание / Пробная тренировка",
            "color": "bg-purple-500",
            "order": 2,
            "is_system": True,
        },
        {
            "key": "offer",
            "title": "Оффер",
            "color": "bg-indigo-500",
            "order": 3,
            "is_system": True,
        },
        {
            "key": "onboarding",
            "title": "Онбординг",
            "color": "bg-green-500",
            "order": 4,
            "is_system": True,
        },
        {
            "key": "reserve",
            "title": "Отказ / Резерв",
            "color": "bg-red-500",
            "order": 5,
            "is_system": True,
        },
    ]

    for data in defaults:
        stage = HRFunnelStage(**data)
        db.add(stage)

    db.commit()
    return {"message": "HR default stages initialized"}

