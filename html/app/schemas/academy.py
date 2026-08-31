from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


class AcademyBase(BaseModel):
    name: str = Field(..., min_length=2, max_length=200)
    short_name: Optional[str] = Field(None, max_length=80)
    slug: str = Field(..., min_length=2, max_length=80)
    logo_url: Optional[str] = Field(None, max_length=500)
    primary_color: str = Field("#EAB308", max_length=20)
    country_code: str = Field("MD", min_length=2, max_length=2)
    currency: str = Field("MDL", min_length=3, max_length=3)
    default_language: str = Field("ru", min_length=2, max_length=5)
    locale: str = Field("ru-MD", min_length=2, max_length=20)
    timezone: str = Field("Europe/Chisinau", min_length=2, max_length=60)
    city: Optional[str] = Field(None, max_length=120)
    contact_phone: Optional[str] = Field(None, max_length=50)
    contact_email: Optional[str] = Field(None, max_length=200)
    description: Optional[str] = None
    subscription_status: str = "trial"
    subscription_plan: str = "starter"
    subscription_expires_at: Optional[date] = None
    max_users: Optional[int] = None
    max_students: Optional[int] = None
    is_active: bool = True

    @field_validator("slug")
    @classmethod
    def validate_slug(cls, value: str) -> str:
        import re

        value = value.strip().lower()
        if not re.match(r"^[a-z0-9]+(?:-[a-z0-9]+)*$", value):
            raise ValueError("Slug can contain lowercase latin letters, numbers and hyphens")
        return value

    @field_validator("primary_color")
    @classmethod
    def validate_primary_color(cls, value: str) -> str:
        import re

        if not re.match(r"^#[0-9a-fA-F]{6}$", value):
            raise ValueError("Primary color must be HEX, for example #EAB308")
        return value.upper()

    @field_validator("country_code")
    @classmethod
    def validate_country_code(cls, value: str) -> str:
        return value.strip().upper()

    @field_validator("currency")
    @classmethod
    def validate_currency(cls, value: str) -> str:
        return value.strip().upper()

    @field_validator("default_language")
    @classmethod
    def validate_default_language(cls, value: str) -> str:
        language = value.strip().lower()
        if language not in {"ru", "ro"}:
            raise ValueError('Default language must be "ru" or "ro"')
        return language


class AcademyCreate(AcademyBase):
    pass


class AcademyAdminCreate(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=200)
    phone: str = Field(..., min_length=6, max_length=50)
    password: str = Field(..., min_length=4, max_length=100)
    role: str = "owner"

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, value: str) -> str:
        import re

        phone = value.strip().replace(" ", "").replace("-", "")
        if not re.match(r"^\+?[0-9]{6,15}$", phone):
            raise ValueError("Телефон должен содержать 6-15 цифр")
        return phone

    @field_validator("role")
    @classmethod
    def validate_role(cls, value: str) -> str:
        role = value.strip().lower()
        if role not in {"owner", "super_admin", "admin"}:
            raise ValueError("Первый пользователь академии может быть owner, super_admin или admin")
        return role


class AcademyAdminResponse(BaseModel):
    id: int
    academy_id: int
    full_name: str
    phone: str
    role: str
    login_url: str
    cabinet_url: str
    model_config = ConfigDict(from_attributes=True)


class AcademyUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=200)
    short_name: Optional[str] = Field(None, max_length=80)
    logo_url: Optional[str] = Field(None, max_length=500)
    primary_color: Optional[str] = Field(None, max_length=20)
    country_code: Optional[str] = Field(None, min_length=2, max_length=2)
    currency: Optional[str] = Field(None, min_length=3, max_length=3)
    default_language: Optional[str] = Field(None, min_length=2, max_length=5)
    locale: Optional[str] = Field(None, min_length=2, max_length=20)
    timezone: Optional[str] = Field(None, min_length=2, max_length=60)
    city: Optional[str] = Field(None, max_length=120)
    contact_phone: Optional[str] = Field(None, max_length=50)
    contact_email: Optional[str] = Field(None, max_length=200)
    description: Optional[str] = None
    subscription_status: Optional[str] = None
    subscription_plan: Optional[str] = None
    subscription_expires_at: Optional[date] = None
    max_users: Optional[int] = None
    max_students: Optional[int] = None
    is_active: Optional[bool] = None


class AcademyResponse(AcademyBase):
    id: int
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)


class PublicAcademyResponse(BaseModel):
    id: int
    name: str
    short_name: Optional[str] = None
    slug: str
    logo_url: Optional[str] = None
    primary_color: str
    country_code: str
    currency: str
    default_language: str
    locale: str
    timezone: str
    city: Optional[str] = None
    is_active: bool
    subscription_status: str
    model_config = ConfigDict(from_attributes=True)
