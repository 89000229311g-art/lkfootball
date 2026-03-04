from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime
from .base import Base

class Achievement(Base):
    __tablename__ = "achievements"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("students.id", ondelete="CASCADE"))
    title = Column(String)
    description = Column(String, nullable=True)
    icon = Column(String, nullable=True) # Emoji or icon name
    type = Column(String) # e.g., "attendance_streak", "skill_master", "tournament_mvp"
    created_at = Column(DateTime, default=datetime.utcnow)
    is_viewed = Column(Boolean, default=False)

    student = relationship("Student", back_populates="achievements")
