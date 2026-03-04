from sqlalchemy import Column, Integer, String, Boolean, DateTime
from sqlalchemy.orm import relationship
from enum import Enum
from .base import Base

class UserRole(str, Enum):
    SUPER_ADMIN = "super_admin"
    OWNER = "owner"
    ADMIN = "admin"
    ACCOUNTANT = "accountant"  # New: can manage salaries
    COACH = "coach"
    PARENT = "parent"

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    phone = Column(String, unique=True, index=True)
    phone_secondary = Column(String, nullable=True)  # Backup phone number
    password_hash = Column(String)
    full_name = Column(String)
    role = Column(String)  # Store as string for easier comparison
    avatar_url = Column(String, nullable=True)  # Profile photo
    
    # Account status
    is_active = Column(Boolean, default=True, nullable=False)  # Active/disabled account
    
    # Localization - user's preferred language
    preferred_language = Column(String, default='ru', nullable=False)  # 'ro' or 'ru'
    
    # Push notifications - Firebase Cloud Messaging token
    fcm_token = Column(String(500), nullable=True)  # FCM token for push notifications
    
    # Messenger Integration
    telegram_chat_id = Column(String, nullable=True, unique=True, index=True)  # Telegram Chat ID for notifications
    
    # Special permissions for admins
    can_view_history = Column(Boolean, default=False, nullable=False)  # Access to history/audit log
    can_view_analytics = Column(Boolean, default=False, nullable=False)  # Access to financial analytics
    can_view_crm = Column(Boolean, default=False, nullable=False)  # Access to CRM (leads)
    can_view_recruitment = Column(Boolean, default=False, nullable=False)  # Access to Recruitment (HR)
    can_view_marketing = Column(Boolean, default=False, nullable=False)  # Access to Marketing module
    
    # Soft delete fields for archive/restore functionality
    deleted_at = Column(DateTime, nullable=True, index=True)  # When deleted (null = active)
    deletion_reason = Column(String(255), nullable=True)       # Why deleted
    deleted_by_id = Column(Integer, nullable=True)             # Who deleted

    @property
    def role_normalized(self):
        """Return role in lowercase for consistent comparison."""
        if self.role:
            return self.role.lower() if isinstance(self.role, str) else self.role.value
        return "parent"

    # Relationships with cascade delete support
    student_guardians = relationship("StudentGuardian", back_populates="user", cascade="all, delete-orphan", passive_deletes=True)
    coached_groups = relationship("Group", back_populates="coach", foreign_keys="Group.coach_id")  # coach_id SET NULL on delete
    sent_messages = relationship("Message", foreign_keys="Message.sender_id", cascade="all, delete-orphan", passive_deletes=True)
    received_messages = relationship("Message", foreign_keys="Message.recipient_id", cascade="all, delete-orphan", passive_deletes=True)
    
    # Booking relationships
    bookings_as_parent = relationship("Booking", foreign_keys="Booking.parent_user_id", back_populates="parent_user", cascade="all, delete-orphan", passive_deletes=True)
    bookings_as_coach = relationship("Booking", foreign_keys="Booking.coach_id", back_populates="coach")
    
    # Web Push Subscriptions
    push_subscriptions = relationship("PushSubscription", back_populates="user", cascade="all, delete-orphan")
