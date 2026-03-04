from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime, Table
from sqlalchemy.orm import relationship
from enum import Enum
from .base import Base

class SubscriptionType(str, Enum):
    BY_CLASS = "by_class"       # Списание 1 единицы за каждое занятие
    BY_CALENDAR = "by_calendar" # Оплата до определённой даты месяца

# Many-to-many association table for groups and coaches
group_coaches = Table(
    'group_coaches',
    Base.metadata,
    Column('group_id', Integer, ForeignKey('groups.id', ondelete='CASCADE'), primary_key=True),
    Column('coach_id', Integer, ForeignKey('users.id', ondelete='CASCADE'), primary_key=True)
)

class Group(Base):
    __tablename__ = "groups"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String)  # e.g., "Дети 2020 г.р."
    age_group = Column(String, nullable=True) # e.g. "2015" or "U-10"
    coach_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)  # Primary coach (legacy)
    
    # Subscription settings (using String for flexibility)
    subscription_type = Column(String, default="by_class")  # by_class or by_calendar
    monthly_fee = Column(Float, default=0.0)         # Стоимость абонемента
    classes_per_month = Column(Integer, default=8)   # Кол-во занятий в месяц
    payment_due_day = Column(Integer, default=10)    # День месяца для оплаты
    
    # НОВОЕ: Вместимость группы
    max_capacity = Column(Integer, default=20)       # Максимальное кол-во учеников
    
    # Soft delete fields
    deleted_at = Column(DateTime, nullable=True, index=True)
    deleted_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    deletion_reason = Column(String(255), nullable=True)

    # Relationships
    coach = relationship("User", back_populates="coached_groups", foreign_keys=[coach_id])
    coaches = relationship("User", secondary=group_coaches, backref="coach_groups")  # Multiple coaches
    students = relationship("Student", back_populates="group", cascade="all, delete-orphan", passive_deletes=True)
    events = relationship("Event", back_populates="group", cascade="all, delete-orphan", passive_deletes=True)