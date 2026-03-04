from typing import List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status, Body
from sqlalchemy.orm import Session
from app.core.deps import get_db, get_current_user
from app.models import User, SchoolSettings
from app.schemas.settings import SchoolSettingsCreate, SchoolSettingsUpdate, SchoolSettingsResponse
from app.core.scheduler import refresh_cleanup_schedule, refresh_alerts_job

router = APIRouter()

@router.get("/", response_model=List[SchoolSettingsResponse])
async def get_settings(
    group: str = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get all settings or filter by group"""
    query = db.query(SchoolSettings)
    if group:
        query = query.filter(SchoolSettings.group == group)
    return query.all()

@router.put("/{key}", response_model=SchoolSettingsResponse)
async def update_setting(
    key: str,
    setting_in: SchoolSettingsUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update a setting (Admin only)"""
    if current_user.role not in ["super_admin", "admin", "owner"]:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    
    setting = db.query(SchoolSettings).filter(SchoolSettings.key == key).first()
    if not setting:
        # Create if not exists (upsert behavior for admins)
        setting = SchoolSettings(key=key, value=setting_in.value, description=setting_in.description)
        db.add(setting)
    else:
        setting.value = setting_in.value
        if setting_in.description:
            setting.description = setting_in.description
            
    db.commit()
    db.refresh(setting)
    # Auto-refresh scheduler for cleanup/alerts changes
    try:
        if key.startswith("cleanup.schedule."):
            refresh_cleanup_schedule()
        elif key.startswith("cleanup.alerts."):
            refresh_alerts_job()
    except Exception:
        # Non-critical: scheduler may be unavailable in some runtimes
        pass
    return setting

@router.get("/public/payment-info")
async def get_payment_info(db: Session = Depends(get_db)):
    """Public endpoint for payment info (safe to expose)"""
    # Fetch specific keys
    keys = ["payment_bank_details", "payment_qr_url", "payment_instructions"]
    settings = db.query(SchoolSettings).filter(SchoolSettings.key.in_(keys)).all()
    return {s.key: s.value for s in settings}
