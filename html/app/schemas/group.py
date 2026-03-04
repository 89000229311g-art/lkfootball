from pydantic import BaseModel, Field, ConfigDict, field_validator
from typing import Optional, List
from datetime import datetime

# Valid subscription types
SUBSCRIPTION_TYPES = ["by_class", "by_calendar"]

class GroupBase(BaseModel):
    name: str = Field(..., example="Дети 2020 г.р.", min_length=1, max_length=100)
    age_group: Optional[str] = Field(None, example="2015", max_length=50)
    coach_id: Optional[int] = Field(None, example=1, gt=0)  # Primary coach (legacy)
    coach_ids: Optional[List[int]] = Field(None, example=[1, 2])  # Multiple coaches
    subscription_type: Optional[str] = Field("by_class", example="by_class")  # by_class or by_calendar
    monthly_fee: Optional[float] = Field(0.0, example=800.0, ge=0, le=100000)
    classes_per_month: Optional[int] = Field(8, example=8, ge=1, le=31)
    payment_due_day: Optional[int] = Field(10, example=10, ge=1, le=31)
    
    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Group name cannot be empty")
        return v.strip()
    
    @field_validator("subscription_type")
    @classmethod
    def validate_subscription_type(cls, v: Optional[str]) -> str:
        if v is None:
            return "by_class"
        if v not in SUBSCRIPTION_TYPES:
            raise ValueError(f"Subscription type must be one of: {', '.join(SUBSCRIPTION_TYPES)}")
        return v

class GroupCreate(GroupBase):
    pass

class GroupUpdate(BaseModel):
    name: Optional[str] = Field(None, example="Дети 2020 г.р.")
    age_group: Optional[str] = None
    coach_id: Optional[int] = Field(None, example=1)  # Primary coach
    coach_ids: Optional[List[int]] = None  # Multiple coaches
    subscription_type: Optional[str] = None
    monthly_fee: Optional[float] = None
    classes_per_month: Optional[int] = None
    payment_due_day: Optional[int] = None

class GroupInDB(GroupBase):
    id: int
    model_config = ConfigDict(from_attributes=True)

class GroupResponse(GroupInDB):
    pass

class CoachBasicInfo(BaseModel):
    id: int
    phone: str
    full_name: str
    avatar_url: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)

class StudentBasicInfo(BaseModel):
    id: int
    first_name: str
    last_name: str
    status: str
    is_debtor: Optional[bool] = False
    avatar_url: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)

class GroupWithDetails(GroupResponse):
    coach: Optional[CoachBasicInfo] = None
    coaches: List[CoachBasicInfo] = []  # Multiple coaches
    students: List[StudentBasicInfo] = []
    students_count: int = 0  # Количество учеников в группе
    deleted_at: Optional[datetime] = None
    model_config = ConfigDict(from_attributes=True)

class GroupPagination(BaseModel):
    data: List[GroupWithDetails]
    total: int
    skip: int
    limit: int
    pages: int
    model_config = ConfigDict(from_attributes=True)


# ============ BULK TRANSFER SCHEMAS ============

class BulkTransferStudents(BaseModel):
    """Schema for bulk transfer students between groups"""
    student_ids: List[int] = Field(..., min_length=1, description="List of student IDs to transfer")
    target_group_id: int = Field(..., gt=0, description="Target group ID")
    
class BulkTransferResponse(BaseModel):
    """Response for bulk transfer operation"""
    success: bool
    transferred_count: int
    message: str
    failed_ids: List[int] = []


# ============ COACH MANAGEMENT SCHEMAS ============

class AddCoachesToGroup(BaseModel):
    """Schema for adding coaches to group"""
    coach_ids: List[int] = Field(..., min_length=1, description="List of coach IDs to add")

class RemoveCoachFromGroup(BaseModel):
    """Schema for removing coach from group"""
    coach_id: int = Field(..., gt=0, description="Coach ID to remove")
