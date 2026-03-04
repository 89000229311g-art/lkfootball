"""
New improvement models for:
- Achievements
- Student Photos (Gallery)
- Absence Requests
- Announcement Reads
- Payment Reminders
- Coach Recommendations
- Expenses & Categories
- Trial Sessions
"""

from sqlalchemy import Column, Integer, String, Date, DateTime, Float, Boolean, Text, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from .base import Base
from app.core.timezone import now_naive


class StudentPhoto(Base):
    """Photo gallery from trainings"""
    __tablename__ = "student_photos"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("students.id", ondelete="CASCADE"), nullable=False)
    photo_url = Column(String(500), nullable=False)
    thumbnail_url = Column(String(500), nullable=True)
    caption = Column(String(500), nullable=True)
    training_date = Column(Date, nullable=True)
    group_id = Column(Integer, ForeignKey("groups.id"), nullable=True)
    uploaded_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    is_profile_worthy = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    student = relationship("Student", back_populates="photos")
    group = relationship("Group")
    uploader = relationship("User")


class AbsenceRequest(Base):
    """Pre-registered absence requests"""
    __tablename__ = "absence_requests"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("students.id", ondelete="CASCADE"), nullable=False)
    requested_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    absence_date = Column(Date, nullable=False)
    reason = Column(String(500), nullable=True)
    status = Column(String(20), default="pending")  # pending, approved, rejected
    approved_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    student = relationship("Student", back_populates="absence_requests")
    requester = relationship("User", foreign_keys=[requested_by])
    approver = relationship("User", foreign_keys=[approved_by])


class AnnouncementRead(Base):
    """Track read/confirmed announcements"""
    __tablename__ = "announcement_reads"

    id = Column(Integer, primary_key=True, index=True)
    post_id = Column(Integer, ForeignKey("posts.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    read_at = Column(DateTime, default=datetime.utcnow)
    confirmed = Column(Boolean, default=False)
    confirmed_at = Column(DateTime, nullable=True)

    # Relationships
    post = relationship("Post", back_populates="reads")
    user = relationship("User")


class GroupChatReadStatus(Base):
    """Track last read timestamp for group chats"""
    __tablename__ = "group_chat_read_status"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    group_id = Column(Integer, ForeignKey("groups.id", ondelete="CASCADE"), nullable=False)
    last_read_at = Column(DateTime, default=now_naive)

    # Relationships
    user = relationship("User")
    group = relationship("Group")


class PaymentReminder(Base):
    """Payment reminder history"""
    __tablename__ = "payment_reminders"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("students.id", ondelete="CASCADE"), nullable=False)
    reminder_type = Column(String(50), nullable=False)  # upcoming, overdue, final_warning
    sent_at = Column(DateTime, default=datetime.utcnow)
    sent_via = Column(String(20), nullable=False)  # sms, push, email
    target_month = Column(Date, nullable=False)
    amount_due = Column(Float, nullable=True)

    # Relationships
    student = relationship("Student", back_populates="payment_reminders")


class CoachRecommendation(Base):
    """Coach recommendations for student improvement"""
    __tablename__ = "coach_recommendations"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("students.id", ondelete="CASCADE"), nullable=False)
    coach_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    recommendation_type = Column(String(50), nullable=False)  # technique, fitness, tactical, mental
    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=False)
    priority = Column(String(20), default="normal")  # low, normal, high
    target_date = Column(Date, nullable=True)
    is_completed = Column(Boolean, default=False)
    completed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    student = relationship("Student", back_populates="recommendations")
    coach = relationship("User")


class TrialSession(Base):
    """Trial session requests for funnel tracking"""
    __tablename__ = "trial_sessions"

    id = Column(Integer, primary_key=True, index=True)
    student_name = Column(String(200), nullable=False)
    parent_name = Column(String(200), nullable=True)
    parent_phone = Column(String(20), nullable=False)
    parent_email = Column(String(100), nullable=True)
    age = Column(Integer, nullable=True)
    preferred_group_id = Column(Integer, ForeignKey("groups.id"), nullable=True)
    trial_date = Column(Date, nullable=False)
    status = Column(String(30), default="scheduled")  # scheduled, completed, no_show, converted, rejected
    source = Column(String(50), nullable=True)  # instagram, website, referral, walk-in
    notes = Column(Text, nullable=True)
    converted_student_id = Column(Integer, ForeignKey("students.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    preferred_group = relationship("Group")
    converted_student = relationship("Student")
