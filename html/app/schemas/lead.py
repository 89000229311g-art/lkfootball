from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from enum import Enum

class LeadStatus(str, Enum):
    NEW = "new"
    CALL = "call"
    TRIAL = "trial"
    OFFER = "offer"
    DEAL = "deal"
    SUCCESS = "success"
    REJECT = "reject"


class LeadTaskBase(BaseModel):
    title: str = Field(..., min_length=2)
    due_date: Optional[datetime] = None


class LeadTaskCreate(LeadTaskBase):
    pass


class LeadTaskUpdate(BaseModel):
    title: Optional[str] = None
    due_date: Optional[datetime] = None
    completed: Optional[bool] = None


class LeadTaskResponse(LeadTaskBase):
    id: int
    completed: bool
    created_at: datetime

    class Config:
        from_attributes = True

class LeadBase(BaseModel):
    name: str = Field(..., min_length=2)
    phone: str = Field(..., min_length=8)
    age: Optional[int] = None  # New field
    next_contact_date: Optional[datetime] = None  # New field
    status: Optional[str] = "new"
    source: Optional[str] = None
    notes: Optional[str] = None
    responsible_id: Optional[int] = None
    rejection_reason: Optional[str] = None

class LeadCreate(LeadBase):
    pass

class LeadUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    age: Optional[int] = None  # New field
    next_contact_date: Optional[datetime] = None  # New field
    status: Optional[str] = None
    source: Optional[str] = None
    notes: Optional[str] = None
    responsible_id: Optional[int] = None
    rejection_reason: Optional[str] = None

class LeadResponse(LeadBase):
    id: int
    created_at: datetime
    updated_at: datetime
    created_by_id: Optional[int] = None
    first_call_at: Optional[datetime] = None
    first_trial_at: Optional[datetime] = None
    tasks: List[LeadTaskResponse] = []
    
    class Config:
        from_attributes = True
