from sqlalchemy import Column, Integer, String, Text
from .base import Base

class SchoolSettings(Base):
    """
    Global settings for the school/academy.
    Used for Payment Info, Contact Details, Features Toggles, etc.
    """
    __tablename__ = "school_settings"

    key = Column(String(100), unique=True, index=True)
    value = Column(Text, nullable=True)
    description = Column(String(255), nullable=True)
    group = Column(String(50), default="general") # payment, contact, features
