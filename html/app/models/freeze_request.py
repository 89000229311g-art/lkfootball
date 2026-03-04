from sqlalchemy import Column, Integer, String, Date, DateTime, ForeignKey, Enum as SqlEnum
from sqlalchemy.orm import relationship
from datetime import datetime
import enum
from .base import Base

class FreezeRequestStatus(str, enum.Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"

class FreezeRequest(Base):
    __tablename__ = "freeze_requests"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("students.id", ondelete="CASCADE"), nullable=False)
    requested_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    
    start_date = Column(Date, default=datetime.utcnow().date)
    end_date = Column(Date, nullable=False)
    reason = Column(String(500), nullable=True)
    file_url = Column(String, nullable=True)
    
    status = Column(String, default=FreezeRequestStatus.PENDING)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    processed_at = Column(DateTime, nullable=True)
    processed_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    # Relationships
    student = relationship("Student", back_populates="freeze_requests")
    requested_by = relationship("User", foreign_keys=[requested_by_id])
    processed_by = relationship("User", foreign_keys=[processed_by_id])
