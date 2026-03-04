from typing import List, Dict, Any, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Body
from app.services.ai_service import ai_service
from app.core.deps import get_current_user
from app.models import User, UserRole

router = APIRouter()

@router.post("/analyze/performance")
async def analyze_student_performance(
    student_data: Dict[str, Any] = Body(...),
    current_user: User = Depends(get_current_user)
):
    """
    Generate AI analysis for student performance.
    Only coaches and admins can use this.
    """
    if current_user.role not in [UserRole.COACH, UserRole.ADMIN, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Not authorized")
        
    result = await ai_service.analyze_student_performance(student_data)
    return {"analysis": result}

@router.post("/plan/training")
async def generate_training_plan(
    group_level: str = Body(..., embed=True),
    focus_area: str = Body(..., embed=True),
    current_user: User = Depends(get_current_user)
):
    """
    Generate AI training plan.
    Only coaches and admins can use this.
    """
    if current_user.role not in [UserRole.COACH, UserRole.ADMIN, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Not authorized")
        
    result = await ai_service.generate_training_plan(group_level, focus_area)
    return {"plan": result}

@router.get("/status")
async def get_ai_status(
    current_user: User = Depends(get_current_user)
):
    """
    Check if AI service is configured and ready.
    """
    is_ready = ai_service.client is not None
    model = ai_service.model
    return {
        "ready": is_ready,
        "model": model,
        "provider": "OpenAI" if is_ready else "None"
    }
