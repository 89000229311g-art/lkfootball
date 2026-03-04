from pydantic import BaseModel, Field, ConfigDict
from typing import Optional
from datetime import date, datetime
from enum import Enum

class FreezeRequestStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"

class FreezeRequestBase(BaseModel):
    end_date: date = Field(..., description="Inclusive end date of freeze")
    reason: Optional[str] = Field(None, max_length=500)
    file_url: Optional[str] = None

class FreezeRequestCreate(FreezeRequestBase):
    pass

class FreezeRequestResponse(FreezeRequestBase):
    id: int
    student_id: int
    start_date: date
    status: str
    created_at: datetime
    processed_at: Optional[datetime] = None
    requested_by_id: Optional[int] = None
    processed_by_id: Optional[int] = None
    
    model_config = ConfigDict(from_attributes=True)

class FreezeRequestUpdate(BaseModel):
    status: FreezeRequestStatus
    rejection_reason: Optional[str] = None


class FreezeRequestFileUpdate(BaseModel):
    file_url: Optional[str] = None
