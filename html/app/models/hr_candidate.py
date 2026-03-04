from sqlalchemy import Column, Integer, String, Text, DateTime, Float, ForeignKey
from sqlalchemy.sql import func
from .base import Base

class HRCandidate(Base):
    __tablename__ = "hr_candidates"

    id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String, nullable=False)
    target_role = Column(String, default="coach")
    phone = Column(String, nullable=True)
    email = Column(String, nullable=True)
    
    experience_years = Column(Float, nullable=True)
    experience_summary = Column(Text, nullable=True)
    
    # Links to HRFunnelStage.key
    stage = Column(String, default="new", index=True)
    
    next_interview_at = Column(DateTime, nullable=True)
    notes = Column(Text, nullable=True)
    
    resume_url = Column(String, nullable=True)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
