from pydantic import BaseModel, Field, ConfigDict, field_validator
from typing import Optional, List
import re
from app.models.user import UserRole

# Valid roles
VALID_ROLES = ["super_admin", "admin", "coach", "parent", "owner", "accountant"]

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"

class TokenData(BaseModel):
    phone: Optional[str] = None
    role: Optional[UserRole] = None

class UserLogin(BaseModel):
    phone: str = Field(..., example="+37312345678")
    password: str = Field(..., min_length=1)
    
    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v: str) -> str:
        phone = v.strip().replace(" ", "").replace("-", "")
        if not re.match(r'^\+?[0-9]{10,15}$', phone):
            raise ValueError("Телефон должен быть в формате: +373XXXXXXXX (10-15 цифр)")
        return phone

class UserCreate(BaseModel):
    phone: str = Field(..., example="+37312345678")
    password: str = Field(..., max_length=100)  # min_length проверяется в валидаторе
    full_name: str = Field(..., max_length=200)  # min_length проверяется в валидаторе
    role: UserRole
    phone_secondary: Optional[str] = Field(None, max_length=20)
    can_view_history: Optional[bool] = False  # Permission for history access (admin only)
    can_view_analytics: Optional[bool] = False  # Permission for analytics access (admin only)
    can_view_crm: Optional[bool] = False  # Permission for CRM access (admin only)
    can_view_recruitment: Optional[bool] = False  # Permission for recruitment/HR access (admin only)
    can_view_marketing: Optional[bool] = False  # Permission for marketing module access (admin only)
    
    # Child data (required when role=parent)
    child_full_name: Optional[str] = Field(None, max_length=200)  # min_length проверяется в валидаторе
    child_birth_date: Optional[str] = Field(None)  # Format: YYYY-MM-DD
    child_group_id: Optional[int] = Field(None)
    child_medical_info: Optional[str] = Field(None, max_length=2000, description="Хронические болезни и аллергии")
    child_medical_notes: Optional[str] = Field(None, max_length=2000, description="Медицинские показания ребенка")
    
    @field_validator("phone", "phone_secondary")
    @classmethod
    def validate_phones(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        phone = v.strip().replace(" ", "").replace("-", "")
        if not re.match(r'^\+?[0-9]{10,15}$', phone):
            raise ValueError("Телефон должен быть в формате: +373XXXXXXXX (10-15 цифр)")
        return phone
    
    @field_validator("full_name", "child_full_name")
    @classmethod
    def validate_full_name(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        v = v.strip()
        if not v:
            raise ValueError("Имя не может быть пустым")
        if len(v) < 2:
            raise ValueError("Имя должно содержать минимум 2 символа")
        return v
    
    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        if len(v) < 6:
            raise ValueError("Пароль должен содержать минимум 6 символов")
        return v
    
    @field_validator("child_birth_date")
    @classmethod
    def validate_birth_date(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        try:
            from datetime import datetime
            datetime.strptime(v, "%Y-%m-%d")
        except ValueError:
            raise ValueError("Дата рождения должна быть в формате ГГГГ-ММ-ДД")
        return v

class PasswordChangeRequest(BaseModel):
    current_password: str
    new_password: str

class LanguageRequest(BaseModel):
    language: str

class UserUpdate(BaseModel):
    full_name: Optional[str] = Field(None, max_length=200)  # min_length проверяется в валидаторе
    phone: Optional[str] = Field(None, max_length=20)
    phone_secondary: Optional[str] = Field(None, max_length=20)
    password: Optional[str] = Field(None, max_length=100)  # min_length проверяется в валидаторе
    preferred_language: Optional[str] = None  # ФАЗА 7
    can_view_history: Optional[bool] = None  # Permission for history access (admin only, set by super_admin)
    can_view_analytics: Optional[bool] = None  # Permission for analytics access (admin only, set by super_admin)
    can_view_crm: Optional[bool] = None  # Permission for CRM access (admin only, set by super_admin)
    can_view_recruitment: Optional[bool] = None  # Permission for recruitment/HR access (admin only, set by super_admin)
    can_view_marketing: Optional[bool] = None  # Permission for marketing access (admin only, set by super_admin)
    
    @field_validator("phone", "phone_secondary")
    @classmethod
    def validate_phones(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        phone = v.strip().replace(" ", "").replace("-", "")
        if not re.match(r'^\+?[0-9]{10,15}$', phone):
            raise ValueError("Телефон должен быть в формате: +373XXXXXXXX (10-15 цифр)")
        return phone
    
    @field_validator("full_name")
    @classmethod
    def validate_full_name(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        v = v.strip()
        if not v:
            raise ValueError("ФИО не может быть пустым")
        if len(v) < 2:
            raise ValueError("ФИО должно содержать минимум 2 символа")
        return v
    
    @field_validator("password")
    @classmethod
    def validate_password(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and len(v) < 6:
            raise ValueError("Пароль должен содержать минимум 6 символов")
        return v

    @field_validator('preferred_language')
    @classmethod
    def validate_language(cls, v):
        if v is not None and v not in ('ro', 'ru'):
            raise ValueError('Язык должен быть "ro" или "ru"')
        return v

class UserResponse(BaseModel):
    id: int
    phone: str
    phone_secondary: Optional[str] = None
    full_name: str
    role: UserRole
    avatar_url: Optional[str] = None
    preferred_language: str = 'ru'  # ФАЗА 7: предпочитаемый язык
    can_view_history: bool = False  # Permission for history access (admin only)
    can_view_analytics: bool = False  # Permission for analytics access (admin only)
    can_view_crm: bool = False  # Permission for CRM access (admin only)
    can_view_recruitment: bool = False  # Permission for recruitment/HR access (admin only)
    can_view_marketing: bool = False  # Permission for marketing access (admin only)
    model_config = ConfigDict(from_attributes=True)


class UserPagination(BaseModel):
    """Paginated response for users list."""
    data: List[UserResponse]
    total: int
    page: int = 1
    pages: int = 0
    model_config = ConfigDict(from_attributes=True)
