from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class HRCandidateBase(BaseModel):
    full_name: str
    target_role: Optional[str] = "coach"
    phone: Optional[str] = None
    email: Optional[str] = None
    experience_years: Optional[float] = None
    experience_summary: Optional[str] = None
    stage: Optional[str] = "new"
    next_interview_at: Optional[datetime] = None
    notes: Optional[str] = None
    resume_url: Optional[str] = None

class HRCandidateCreate(HRCandidateBase):
    pass

class HRCandidateUpdate(BaseModel):
    full_name: Optional[str] = None
    target_role: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    experience_years: Optional[float] = None
    experience_summary: Optional[str] = None
    stage: Optional[str] = None
    next_interview_at: Optional[datetime] = None
    notes: Optional[str] = None
    resume_url: Optional[str] = None

class HRCandidateResponse(HRCandidateBase):
    id: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True
