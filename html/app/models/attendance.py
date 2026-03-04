from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Enum as SQLEnum, Index
from sqlalchemy.orm import relationship
from enum import Enum
from .base import Base

class AttendanceStatus(str, Enum):
    PRESENT = "present"
    ABSENT = "absent"
    SICK = "sick"
    LATE = "late"

class Attendance(Base):
    __tablename__ = "attendances"
    
    # Performance indexes for frequently queried columns
    __table_args__ = (
        Index('ix_attendance_student_event', 'student_id', 'event_id'),
        Index('ix_attendance_student_status', 'student_id', 'status'),
        Index('ix_attendance_event', 'event_id'),
    )

    id = Column(Integer, primary_key=True, index=True)
    event_id = Column(Integer, ForeignKey("events.id", ondelete="CASCADE"))
    student_id = Column(Integer, ForeignKey("students.id", ondelete="CASCADE"))
    status = Column(SQLEnum(AttendanceStatus))
    mark = Column(Integer, nullable=True)  # Optional: coach's evaluation (1-10)
    
    # Parent Feedback
    parent_rating = Column(Integer, nullable=True) # 1-5 stars
    parent_feedback = Column(String(500), nullable=True)

    # Relationships
    event = relationship("Event", back_populates="attendances")
    student = relationship("Student", back_populates="attendance_records")