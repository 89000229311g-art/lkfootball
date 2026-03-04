from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List
from datetime import datetime
from app.models.attendance import AttendanceStatus

class AttendanceBase(BaseModel):
    event_id: int = Field(..., example=1)
    student_id: int = Field(..., example=1)
    status: AttendanceStatus = Field(..., example="present")
    mark: Optional[int] = Field(None, ge=1, le=10, example=8, description="Coach's evaluation (1-10)")

class AttendanceCreate(AttendanceBase):
    pass

class AttendanceUpdate(BaseModel):
    status: Optional[AttendanceStatus] = Field(None, example="present")
    mark: Optional[int] = Field(None, ge=1, le=10, example=8)

class AttendanceInDB(AttendanceBase):
    id: int
    model_config = ConfigDict(from_attributes=True)

class AttendanceResponse(AttendanceInDB):
    pass

class BulkAttendanceItem(BaseModel):
    student_id: int = Field(..., example=1)
    status: AttendanceStatus = Field(..., example="present")
    mark: Optional[int] = Field(None, ge=1, le=10, example=8)

class BulkAttendanceCreate(BaseModel):
    event_id: int = Field(..., example=1)
    attendances: List[BulkAttendanceItem]

class StudentAttendanceInfo(BaseModel):
    id: int
    first_name: str
    last_name: str
    model_config = ConfigDict(from_attributes=True)

class EventAttendanceInfo(BaseModel):
    id: int
    start_time: datetime
    type: str
    model_config = ConfigDict(from_attributes=True)

class AttendanceWithDetails(AttendanceResponse):
    student: Optional[StudentAttendanceInfo] = None
    event: Optional[EventAttendanceInfo] = None
    model_config = ConfigDict(from_attributes=True)

class AttendanceStats(BaseModel):
    total_events: int
    present: int
    absent: int
    sick: int
    late: int
    attendance_rate: float
