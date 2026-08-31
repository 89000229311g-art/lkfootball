from sqlalchemy import Column, Integer, String, Text, ForeignKey, Index
from .base import Base

class SchoolSettings(Base):
    """
    Global settings for the school/academy.
    Used for Payment Info, Contact Details, Features Toggles, etc.
    """
    __tablename__ = "school_settings"
    __table_args__ = (
        Index("ix_school_settings_academy_key", "academy_id", "key", unique=True),
    )

    academy_id = Column(Integer, ForeignKey("academies.id", ondelete="CASCADE"), nullable=True, index=True)
    key = Column(String(100), index=True)
    value = Column(Text, nullable=True)
    description = Column(String(255), nullable=True)
    group = Column(String(50), default="general") # payment, contact, features
