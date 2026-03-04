from sqlalchemy import Column, Integer, Date, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from .base import Base

class StudentGroupHistory(Base):
    __tablename__ = "student_group_history"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("students.id", ondelete="CASCADE"))
    group_id = Column(Integer, ForeignKey("groups.id", ondelete="SET NULL"), nullable=True)
    joined_at = Column(Date, default=datetime.utcnow)
    left_at = Column(Date, nullable=True)
    
    # Relationships
    student = relationship("Student", back_populates="group_history")
    group = relationship("Group")
