from sqlalchemy import Boolean, Column, Date, DateTime, Integer, String, Text
from sqlalchemy.orm import relationship

from app.core.timezone import now_naive

from .base import Base


class Academy(Base):
    __tablename__ = "academies"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    short_name = Column(String(80), nullable=True)
    slug = Column(String(80), nullable=False, unique=True, index=True)
    logo_url = Column(String(500), nullable=True)
    primary_color = Column(String(20), default="#EAB308", nullable=False)
    country_code = Column(String(2), default="MD", nullable=False)
    currency = Column(String(3), default="MDL", nullable=False)
    default_language = Column(String(5), default="ru", nullable=False)
    locale = Column(String(20), default="ru-MD", nullable=False)
    timezone = Column(String(60), default="Europe/Chisinau", nullable=False)
    city = Column(String(120), nullable=True)
    contact_phone = Column(String(50), nullable=True)
    contact_email = Column(String(200), nullable=True)
    description = Column(Text, nullable=True)

    subscription_status = Column(String(30), default="trial", nullable=False)
    subscription_plan = Column(String(50), default="starter", nullable=False)
    subscription_expires_at = Column(Date, nullable=True)
    max_users = Column(Integer, nullable=True)
    max_students = Column(Integer, nullable=True)

    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=now_naive, nullable=False)
    updated_at = Column(DateTime, default=now_naive, onupdate=now_naive, nullable=False)

    users = relationship("User", back_populates="academy")
    groups = relationship("Group", back_populates="academy")
    students = relationship("Student", back_populates="academy")
