from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from datetime import datetime
from .base import Base

class TrainingPlan(Base):
    __tablename__ = "training_plans"

    id = Column(Integer, primary_key=True, index=True)
    event_id = Column(Integer, ForeignKey("events.id", ondelete="CASCADE"), unique=True) # One plan per event
    coach_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    
    objectives = Column(Text)  # Цели и упражнения (Visible to Coach)
    theme = Column(String)     # Тема тренировки (Visible to Parents)
    
    # Relationships
    event = relationship("Event", back_populates="training_plan_rel")
    coach = relationship("User")

class MediaReport(Base):
    __tablename__ = "media_reports"

    id = Column(Integer, primary_key=True, index=True)
    event_id = Column(Integer, ForeignKey("events.id", ondelete="CASCADE"))
    url = Column(String)       # Path to file
    type = Column(String, default="photo") # photo, video
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    event = relationship("Event", back_populates="media_reports")
