"""
Schemas for student skills
Updated for 10-point scale and new metrics
"""
from pydantic import BaseModel, Field, field_validator
from typing import Optional, List, Any
from datetime import datetime


class SkillRatingBase(BaseModel):
    """Base skill rating schema (1-10 scale)"""
    technique: int = Field(ge=0, le=10, default=5, description="Техника (1-10)")
    tactics: int = Field(ge=0, le=10, default=5, description="Тактика (1-10)")
    physical: int = Field(ge=0, le=10, default=5, description="Физика (1-10)")
    discipline: int = Field(ge=0, le=10, default=5, description="Дисциплина (1-10)")
    speed: Optional[int] = Field(ge=0, le=10, default=5, description="Скорость (1-10)")
    talent_tags: Optional[List[str]] = []
    coach_comment: Optional[str] = None

    @field_validator('technique', 'tactics', 'physical', 'discipline', 'speed', mode='before')
    @classmethod
    def normalize_rating(cls, v: Any) -> int:
        if v is None:
            return 0 # Treat missing as 0
        try:
            val = int(v)
            return val
        except (ValueError, TypeError):
            return 0


class SkillRatingCreate(SkillRatingBase):
    """Create skill rating - coach provides this"""
    student_id: int
    rating_month: int = Field(ge=1, le=12, description="Месяц оценки (1-12)")
    rating_year: int = Field(ge=2020, le=2050, description="Год оценки")


class SkillRatingUpdate(BaseModel):
    """Update skill rating - partial updates allowed"""
    technique: Optional[int] = Field(ge=1, le=10, default=None)
    tactics: Optional[int] = Field(ge=1, le=10, default=None)
    physical: Optional[int] = Field(ge=1, le=10, default=None)
    discipline: Optional[int] = Field(ge=1, le=10, default=None)
    speed: Optional[int] = Field(ge=1, le=10, default=None)
    talent_tags: Optional[List[str]] = None
    coach_comment: Optional[str] = None


class SkillRatingResponse(SkillRatingBase):
    """Response with skill rating data"""
    id: int
    student_id: int
    rating_month: int
    rating_year: int
    rated_by_id: Optional[int] = None
    rated_by_name: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True


class SkillsHistory(BaseModel):
    """Skills history for chart display"""
    months: List[str]  # ["Янв 2026", "Фев 2026", ...]
    technique: List[int]
    tactics: List[int]
    physical: List[int]
    discipline: List[int]
    speed: List[int]


class SeasonSummarySchema(BaseModel):
    """Schema for Season Summary (GPA)"""
    season_year: int
    gpa_technique: float
    gpa_tactics: float
    gpa_physical: float
    gpa_discipline: float
    gpa_speed: float
    total_gpa: float

    class Config:
        from_attributes = True


class StudentCardResponse(BaseModel):
    """Full student card with all data for modal"""
    id: int
    first_name: str
    last_name: str
    full_name: str
    avatar_url: Optional[str] = None
    dob: Optional[str] = None
    age: Optional[int] = None
    
    # Group info
    group_id: Optional[int] = None
    group_name: Optional[str] = None
    
    # Football profile
    position: Optional[str] = None
    dominant_foot: Optional[str] = None
    tshirt_size: Optional[str] = None
    height: Optional[float] = None
    weight: Optional[float] = None
    
    # Financial
    total_paid: float = 0.0
    balance: float = 0.0
    is_debtor: bool = False
    
    # Monthly payment status
    monthly_balance: Optional[float] = None
    balance_color: Optional[str] = None

    is_paid_this_month: bool = False
    target_month: Optional[str] = None
    
    # Guardian/Parent info
    guardian_id: Optional[int] = None
    guardian_name: Optional[str] = None
    guardian_phone: Optional[str] = None
    guardian_user_id: Optional[int] = None
    
    # Latest skills
    latest_skills: Optional[SkillRatingResponse] = None
    
    # Season Summaries (Archive)
    season_summaries: List[SeasonSummarySchema] = []


class GroupOption(BaseModel):
    """Simple group option for dropdowns"""
    id: int
    name: str

    class Config:
        from_attributes = True


class StudentAnalyticsSummary(BaseModel):
    """Summary of student performance for group analytics"""
    student_id: int
    full_name: str
    avatar_url: Optional[str] = None
    gpa: float
    technique: int
    tactics: int
    physical: int
    discipline: int
    risk: bool


class GroupAnalyticsResponse(BaseModel):
    """Bulk analytics response for a group"""
    group_id: int
    group_name: str
    average_gpa: float
    students: List[StudentAnalyticsSummary]
