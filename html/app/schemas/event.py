from pydantic import BaseModel, Field, ConfigDict, field_validator, model_validator
from typing import Optional, List
from datetime import datetime
from .training import TrainingPlan, MediaReport

# Valid event types
EVENT_TYPES = ["TRAINING", "INDIVIDUAL", "TOURNAMENT", "MEDICAL", "GAME", "PARENT_MEETING", "TESTING", "CHAMPIONSHIP"]
EVENT_STATUSES = ["scheduled", "confirmed", "cancelled", "completed"]

# Base schema for responses (no time validation - data from DB is trusted)
class EventResponseBase(BaseModel):
    group_id: Optional[int] = Field(None, example=1)
    coach_id: Optional[int] = Field(None, example=1)
    student_id: Optional[int] = Field(None, example=1)
    start_time: datetime = Field(..., example="2024-01-15T10:00:00")
    end_time: datetime = Field(..., example="2024-01-15T12:00:00")
    type: str = Field(..., example="TRAINING")
    location: Optional[str] = Field(None, example="Main Stadium", max_length=200)
    status: str = Field("scheduled", example="scheduled")
    notes: Optional[str] = Field(None, example="Notes", max_length=2000)
    
    # Поля для игр
    opponent_team: Optional[str] = Field(None, example="Academia Chisinau", max_length=200)
    home_away: Optional[str] = Field(None, example="home")  # home/away/neutral
    score_home: Optional[int] = Field(None, example=3)
    score_away: Optional[int] = Field(None, example=1)
    meeting_time: Optional[datetime] = Field(None, example="2024-01-15T09:00:00")
    departure_time: Optional[datetime] = Field(None, example="2024-01-15T09:30:00")
    training_plan: Optional[str] = Field(None, example="1. Разминка\n2. Удары по воротам")
    transport_info: Optional[str] = Field(None, example="Автобус от школы")
    uniform_color: Optional[str] = Field(None, example="Основная (синяя)")
    equipment_required: Optional[str] = Field(None, example="Щитки, бутсы")

# Schema with validation for create/update
class EventBase(BaseModel):
    group_id: Optional[int] = Field(None, example=1, gt=0)
    coach_id: Optional[int] = Field(None, example=1, gt=0)
    student_id: Optional[int] = Field(None, example=1, gt=0)
    start_time: datetime = Field(..., example="2024-01-15T10:00:00")
    end_time: datetime = Field(..., example="2024-01-15T12:00:00")
    type: str = Field(..., example="training")
    location: Optional[str] = Field(None, example="Main Stadium", max_length=200)
    status: str = Field("scheduled", example="scheduled")
    notes: Optional[str] = Field(None, example="Notes", max_length=2000)
    
    # Поля для игр
    opponent_team: Optional[str] = Field(None, example="Academia Chisinau", max_length=200)
    home_away: Optional[str] = Field(None, example="home")
    score_home: Optional[int] = Field(None, example=3, ge=0)
    score_away: Optional[int] = Field(None, example=1, ge=0)
    meeting_time: Optional[datetime] = Field(None, example="2024-01-15T09:00:00")
    departure_time: Optional[datetime] = Field(None, example="2024-01-15T09:30:00")
    transport_info: Optional[str] = Field(None, example="Автобус от школы")
    uniform_color: Optional[str] = Field(None, example="Основная")
    equipment_required: Optional[str] = Field(None, example="Щитки, бутсы")
    training_plan: Optional[str] = Field(None, example="1. Разминка\n2. Удары по воротам")
    
    @field_validator("type")
    @classmethod
    def validate_type(cls, v: str) -> str:
        if v:
            v = v.upper()
        if v not in EVENT_TYPES:
            raise ValueError(f"Event type must be one of: {', '.join(EVENT_TYPES)}")
        return v
    
    @field_validator("status")
    @classmethod
    def validate_status(cls, v: str) -> str:
        if v not in EVENT_STATUSES:
            raise ValueError(f"Event status must be one of: {', '.join(EVENT_STATUSES)}")
        return v
    
    @model_validator(mode="after")
    def validate_times(self):
        if self.start_time and self.end_time:
            if self.end_time <= self.start_time:
                raise ValueError("End time must be after start time")
            # Max duration: 8 hours
            duration = (self.end_time - self.start_time).total_seconds() / 3600
            if duration > 8:
                raise ValueError("Event duration cannot exceed 8 hours")
        return self

class EventCreate(EventBase):
    send_notification: bool = True

class EventUpdate(BaseModel):
    group_id: Optional[int] = Field(None, example=1)
    coach_id: Optional[int] = Field(None, example=1)
    student_id: Optional[int] = Field(None, example=1)
    start_time: Optional[datetime] = Field(None, example="2024-01-15T10:00:00")
    end_time: Optional[datetime] = Field(None, example="2024-01-15T12:00:00")
    type: Optional[str] = Field(None, example="TRAINING")
    location: Optional[str] = Field(None, example="Main Stadium")
    status: Optional[str] = Field(None, example="scheduled")
    notes: Optional[str] = Field(None, example="Notes")
    # Поля для игр
    opponent_team: Optional[str] = Field(None, example="Academia Chisinau")
    home_away: Optional[str] = Field(None, example="home")
    score_home: Optional[int] = Field(None, example=3)
    score_away: Optional[int] = Field(None, example=1)
    meeting_time: Optional[datetime] = Field(None, example="2024-01-15T09:00:00")
    departure_time: Optional[datetime] = Field(None, example="2024-01-15T09:30:00")
    transport_info: Optional[str] = Field(None, example="Автобус")
    uniform_color: Optional[str] = Field(None, example="Основная")
    equipment_required: Optional[str] = Field(None, example="Щитки")
    training_plan: Optional[str] = Field(None, example="1. Разминка\n2. Удары по воротам")

    @field_validator("type")
    @classmethod
    def validate_type(cls, v: Optional[str]) -> Optional[str]:
        if v:
            v = v.upper()
            if v not in EVENT_TYPES:
                raise ValueError(f"Event type must be one of: {', '.join(EVENT_TYPES)}")
        return v

class EventInDB(EventResponseBase):
    id: int
    model_config = ConfigDict(from_attributes=True)

class EventResponse(EventInDB):
    pass

class EventPagination(BaseModel):
    data: List[EventResponse]
    total: int
    skip: int
    limit: int
    pages: int
    model_config = ConfigDict(from_attributes=True)

class GroupBasicInfo(BaseModel):
    id: int
    name: str
    model_config = ConfigDict(from_attributes=True)

class EventWithDetails(EventResponse):
    group: Optional[GroupBasicInfo] = None
    media_reports: List[MediaReport] = []
    model_config = ConfigDict(from_attributes=True)
