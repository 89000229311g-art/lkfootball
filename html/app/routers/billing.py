from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.services.billing_service import BillingService

router = APIRouter(
    prefix="/billing",
    tags=["billing"],
    responses={404: {"description": "Not found"}},
)

@router.get("/student-history/{student_id}")
async def get_student_billing_history(student_id: int, db: Session = Depends(get_db)):
    try:
        history = BillingService.get_student_billing_history(db, student_id)
        return history
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
