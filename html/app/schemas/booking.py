"""
Booking schemas for individual training sessions.
"""
from pydantic import BaseModel, Field, ConfigDict, field_validator
from typing import Optional, List
from datetime import datetime
from enum import Enum

# Moldova timezone for validation
from app.core.timezone import now as get_now


class BookingStatusEnum(str, Enum):
    """Booking status options"""
    PENDING = "pending"
    CONFIRMED = "confirmed"
    CANCELLED = "cancelled"
    COMPLETED = "completed"


class BookingBase(BaseModel):
    """Base booking schema"""
    student_id: int = Field(..., gt=0, description="Student ID")
    coach_id: Optional[int] = Field(None, gt=0, description="Preferred coach ID")
    booking_date: datetime = Field(..., description="Date and time of booking")
    duration_minutes: int = Field(60, ge=30, le=180, description="Duration in minutes (30-180)")
    location: Optional[str] = Field(None, max_length=200, description="Training location")
    parent_notes: Optional[str] = Field(None, max_length=1000, description="Notes from parent")
    
    @field_validator("booking_date")
    @classmethod
    def validate_booking_date(cls, v: datetime) -> datetime:
        if v < get_now():  # Moldova timezone
            raise ValueError("Booking date cannot be in the past")
        return v


class BookingCreate(BookingBase):
    """Schema for creating a booking"""
    pass


class BookingUpdate(BaseModel):
    """Schema for updating a booking"""
    booking_date: Optional[datetime] = None
    duration_minutes: Optional[int] = Field(None, ge=30, le=180)
    location: Optional[str] = Field(None, max_length=200)
    status: Optional[BookingStatusEnum] = None
    parent_notes: Optional[str] = Field(None, max_length=1000)
    admin_notes: Optional[str] = Field(None, max_length=1000)
    price: Optional[int] = Field(None, ge=0, le=100000)
    is_paid: Optional[bool] = None


class BookingAdminUpdate(BookingUpdate):
    """Schema for admin updates (includes more fields)"""
    coach_id: Optional[int] = Field(None, gt=0)
    notes: Optional[str] = Field(None, max_length=2000)


# Response schemas
class UserBasicInfo(BaseModel):
    """Basic user info for responses"""
    id: int
    full_name: str
    phone: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)


class StudentBasicInfo(BaseModel):
    """Basic student info for responses"""
    id: int
    first_name: str
    last_name: str
    
    @property
    def full_name(self) -> str:
        return f"{self.first_name} {self.last_name}"
    
    model_config = ConfigDict(from_attributes=True)


class BookingResponse(BaseModel):
    """Full booking response"""
    id: int
    parent_user_id: int
    student_id: int
    coach_id: Optional[int] = None
    event_id: Optional[int] = None
    
    booking_date: datetime
    duration_minutes: int
    location: Optional[str] = None
    status: str
    
    notes: Optional[str] = None
    parent_notes: Optional[str] = None
    admin_notes: Optional[str] = None
    
    price: Optional[int] = None
    is_paid: int = 0
    
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    
    # Nested objects
    parent_user: Optional[UserBasicInfo] = None
    student: Optional[StudentBasicInfo] = None
    coach: Optional[UserBasicInfo] = None
    
    model_config = ConfigDict(from_attributes=True)


class BookingListResponse(BaseModel):
    """Paginated booking list response"""
    data: List[BookingResponse]
    total: int
    skip: int
    limit: int
    pages: int
    model_config = ConfigDict(from_attributes=True)


class BookingStatusUpdate(BaseModel):
    """Quick status update"""
    status: BookingStatusEnum
    admin_notes: Optional[str] = Field(None, max_length=500)


class BookingConfirm(BaseModel):
    """Confirm booking with details"""
    coach_id: int = Field(..., gt=0, description="Assigned coach")
    price: int = Field(..., ge=0, description="Session price")
    location: Optional[str] = Field(None, max_length=200)
    admin_notes: Optional[str] = Field(None, max_length=500)
