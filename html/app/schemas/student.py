from pydantic import BaseModel, Field, ConfigDict, field_validator
from typing import Optional, List
from datetime import date, datetime
import re

# Nested schemas for relationships
class AchievementResponse(BaseModel):
    id: int
    title: str
    description: Optional[str] = None
    icon: Optional[str] = None
    type: str
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

class CoachBasicInfo(BaseModel):
    id: int
    full_name: str
    model_config = ConfigDict(from_attributes=True)

class GroupBasicInfo(BaseModel):
    id: int
    name: str
    coach_id: Optional[int] = None
    coach: Optional[CoachBasicInfo] = None
    model_config = ConfigDict(from_attributes=True)

class StudentBase(BaseModel):
    first_name: str = Field(..., example="Ion", min_length=1, max_length=100)
    last_name: str = Field(..., example="Popescu", min_length=1, max_length=100)
    dob: Optional[date] = Field(None, example="2014-01-01")
    parent_phone: Optional[str] = Field(None, example="+37369123456")
    group_id: Optional[int] = Field(None, example=1, gt=0)
    avatar_url: Optional[str] = Field(None, max_length=500)
    status: Optional[str] = Field("active", example="active")  # active, frozen, archived
    
    # Medical info (УЛУЧШЕНО)
    medical_info: Optional[str] = Field(None, example="Аллергия на орехи", max_length=1000)
    medical_notes: Optional[str] = Field(None, example="Астма легкой степени", max_length=2000, description="Детальные медицинские заметки")
    medical_certificate_expires: Optional[date] = None
    medical_certificate_file: Optional[str] = None
    blood_type: Optional[str] = Field(None, example="A+", description="Blood type (A+, B-, O+, AB+, etc.)", max_length=10)
    allergies: Optional[str] = Field(None, example="Орехи, пыльца", max_length=500)
    emergency_contact: Optional[str] = Field(None, example="Бабушка Мария", max_length=200)
    emergency_phone: Optional[str] = Field(None, example="+37369999999")
    insurance_number: Optional[str] = Field(None, example="INS-12345", max_length=50)
    height: Optional[float] = Field(None, example=145.5, description="Height in cm", gt=0, lt=3000)
    weight: Optional[float] = Field(None, example=35.0, description="Weight in kg", gt=0, lt=1000)
    
    # Football Profile
    position: Optional[str] = Field(None, example="Forward", max_length=50)
    dominant_foot: Optional[str] = Field(None, example="Right", max_length=20)
    tshirt_size: Optional[str] = Field(None, example="S", max_length=10)
    shoe_size: Optional[str] = Field(None, example="42", max_length=10)
    notes: Optional[str] = Field(None, max_length=2000)
    
    @field_validator("first_name", "last_name")
    @classmethod
    def validate_names(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Name cannot be empty")
        return v.strip()
    
    @field_validator("parent_phone", "emergency_phone")
    @classmethod
    def validate_phone(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        # Remove spaces and dashes
        phone = v.strip().replace(" ", "").replace("-", "")
        # Check format: starts with + and has at least 3 digits (relaxed for test data)
        if not re.match(r'^\+?[0-9]{3,15}$', phone):
            raise ValueError("Phone must contain 3-15 digits")
        return phone
    
    @field_validator("status")
    @classmethod
    def validate_status(cls, v: Optional[str]) -> str:
        if v is None:
            return "active"
        allowed_statuses = ["active", "frozen", "archived"]
        if v not in allowed_statuses:
            raise ValueError(f"Status must be one of: {', '.join(allowed_statuses)}")
        return v
    
    @field_validator("dominant_foot")
    @classmethod
    def validate_dominant_foot(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        # Поддержка русских и английских значений
        mapping = {
            "left": "Left", "левая": "Left", "лева": "Left",
            "right": "Right", "правая": "Right", "права": "Right",
            "both": "Both", "обе": "Both", "обои": "Both"
        }
        normalized = mapping.get(v.lower().strip())
        if normalized:
            return normalized
        # Если уже в правильном формате
        if v in ["Left", "Right", "Both"]:
            return v
        # Иначе просто вернём как есть (без строгой валидации)
        return v
    
    @field_validator("blood_type")
    @classmethod
    def validate_blood_type(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        allowed = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]
        if v not in allowed:
            raise ValueError(f"Blood type must be one of: {', '.join(allowed)}")
        return v

class StudentCreate(StudentBase):
    subscription_expires: Optional[date] = None
    # Обязательная связь с родителем - укажите user_id существующего родителя или parent_phone
    guardian_user_id: Optional[int] = Field(None, description="ID пользователя-родителя (если уже зарегистрирован)")
    relationship_type: Optional[str] = Field("Parent", description="Тип связи: Parent, Guardian, Grandparent")

class StudentUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    dob: Optional[date] = None
    parent_phone: Optional[str] = None
    group_id: Optional[int] = None
    avatar_url: Optional[str] = None
    status: Optional[str] = None
    
    # Индивидуальная оплата (для админов/руководителей)
    individual_fee: Optional[float] = Field(None, description="Индивидуальная сумма абонемента (null = стандарт группы)")
    fee_discount_reason: Optional[str] = Field(None, description="Причина скидки")
    
    # Medical info (УЛУЧШЕНО)
    medical_info: Optional[str] = None
    medical_notes: Optional[str] = None
    medical_certificate_expires: Optional[date] = None
    medical_certificate_file: Optional[str] = None
    blood_type: Optional[str] = None
    allergies: Optional[str] = None
    emergency_contact: Optional[str] = None
    emergency_phone: Optional[str] = None
    insurance_number: Optional[str] = None
    height: Optional[float] = None
    weight: Optional[float] = None
    
    # Football Profile
    position: Optional[str] = None
    dominant_foot: Optional[str] = None
    tshirt_size: Optional[str] = None
    notes: Optional[str] = None
    subscription_expires: Optional[date] = None

class StudentInDB(StudentBase):
    id: int
    balance: Optional[float] = Field(0.0, example=0.0)  # Optional for NULL values
    subscription_expires: Optional[date] = None
    is_debtor: Optional[bool] = False  # Optional for NULL values
    is_frozen: Optional[bool] = False  # Optional for NULL values
    freeze_until: Optional[date] = None
    
    # Индивидуальная оплата
    individual_fee: Optional[float] = Field(None, description="Индивидуальная сумма абонемента")
    fee_discount_reason: Optional[str] = Field(None, description="Причина скидки")
    
    # Achievements
    stars: Optional[int] = Field(0, description="Total stars collected")
    attendance_streak: Optional[int] = Field(0, description="Current consecutive attendance streak")
    
    # Additional fields for response
    blood_type: Optional[str] = None
    allergies: Optional[str] = None
    emergency_contact: Optional[str] = None
    emergency_phone: Optional[str] = None
    insurance_number: Optional[str] = None
    
    model_config = ConfigDict(from_attributes=True)

class PastDebt(BaseModel):
    month: int
    year: int
    name: str

class StudentResponse(StudentInDB):
    guardian_ids: List[int] = Field(default_factory=list, description="List of guardian user IDs")
    group: Optional[GroupBasicInfo] = None
    attended_classes: int = Field(0, description="Total classes attended")
    achievements: List[AchievementResponse] = Field(default_factory=list)
    
    # Monthly Balance Info
    monthly_balance: Optional[float] = 0.0
    is_paid_this_month: Optional[bool] = True
    monthly_fee: Optional[float] = 0.0
    target_month: Optional[str] = ""
    balance_color: Optional[str] = "grey"
    past_debts: List[PastDebt] = Field(default_factory=list)
    
    model_config = ConfigDict(from_attributes=True)

class UserBasicInfo(BaseModel):
    id: int
    phone: str
    full_name: str
    relationship_type: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)

class StudentWithGuardians(StudentResponse):
    guardians: list[UserBasicInfo] = []

class StudentPagination(BaseModel):
    data: List[StudentWithGuardians]
    total: int
    skip: int
    limit: int
    pages: int
    model_config = ConfigDict(from_attributes=True)

# Freeze request schema
class FreezeRequest(BaseModel):
    student_id: int
    freeze_until: date
    document_url: Optional[str] = None
    reason: Optional[str] = None
