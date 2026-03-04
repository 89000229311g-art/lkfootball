"""
Booking model for individual training sessions.

This replaces the old method of storing booking info in Event.location field.
"""
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Enum as SQLEnum, Index, Text
from sqlalchemy.orm import relationship
from enum import Enum
from datetime import datetime, timezone
from .base import Base


class BookingStatus(str, Enum):
    """Booking status enumeration"""
    PENDING = "pending"
    CONFIRMED = "confirmed"
    CANCELLED = "cancelled"
    COMPLETED = "completed"


class Booking(Base):
    """Individual training booking model"""
    __tablename__ = "bookings"
    
    # Performance indexes
    __table_args__ = (
        Index('ix_booking_parent_date', 'parent_user_id', 'booking_date'),
        Index('ix_booking_coach_date', 'coach_id', 'booking_date'),
        Index('ix_booking_status', 'status'),
    )
    
    id = Column(Integer, primary_key=True, index=True)
    
    # Who booked
    parent_user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    
    # For which student
    student_id = Column(Integer, ForeignKey("students.id", ondelete="CASCADE"), nullable=False)
    
    # Which coach
    coach_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    
    # Related event (if training is conducted as an event)
    event_id = Column(Integer, ForeignKey("events.id", ondelete="SET NULL"), nullable=True)
    
    # Booking details
    booking_date = Column(DateTime(timezone=True), nullable=False)
    duration_minutes = Column(Integer, default=60, nullable=False)  # Default 1 hour
    location = Column(String(200), nullable=True)
    
    # Status
    status = Column(SQLEnum(BookingStatus), default=BookingStatus.PENDING, nullable=False)
    
    # Additional info
    notes = Column(Text, nullable=True)
    parent_notes = Column(Text, nullable=True)  # Notes from parent
    admin_notes = Column(Text, nullable=True)  # Internal notes
    
    # Payment info
    price = Column(Integer, nullable=True)  # Price for this session
    is_paid = Column(Integer, default=0, nullable=False)  # 0 = not paid, 1 = paid
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    
    # Relationships
    parent_user = relationship("User", foreign_keys=[parent_user_id], back_populates="bookings_as_parent")
    student = relationship("Student", back_populates="bookings")
    coach = relationship("User", foreign_keys=[coach_id], back_populates="bookings_as_coach")
    event = relationship("Event", back_populates="bookings")
    
    def __repr__(self):
        return f"<Booking {self.id}: {self.student_id} with {self.coach_id} on {self.booking_date}>"
