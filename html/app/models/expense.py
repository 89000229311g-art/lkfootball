from sqlalchemy import Column, Integer, String, Float, Date, DateTime, ForeignKey, Enum as SQLEnum, Index
from sqlalchemy.orm import relationship
from datetime import datetime
from enum import Enum
from .base import Base
from .marketing import MarketingCampaign

class ExpenseCategory(str, Enum):
    RENT = "rent"                 # Аренда
    EQUIPMENT = "equipment"       # Инвентарь
    MARKETING = "marketing"       # Маркетинг
    MAINTENANCE = "maintenance"   # Обслуживание
    SALARY_EXTRA = "salary_extra" # Доп. выплаты сотрудникам
    EVENT = "event"               # Расходы на мероприятия
    OTHER = "other"               # Прочее

class Expense(Base):
    """
    Model for tracking miscellaneous expenses (non-salary).
    """
    __tablename__ = "expenses"

    __table_args__ = (
        Index('ix_expense_date', 'date'),
        Index('ix_expense_category', 'category'),
    )

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(200), nullable=False)
    amount = Column(Float, nullable=False)
    category = Column(String, default="other") # stored as string for flexibility, validated against enum in API
    date = Column(Date, nullable=False)
    description = Column(String(1000), nullable=True)
    
    # Metadata
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    created_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    marketing_campaign_id = Column(Integer, ForeignKey("marketing_campaigns.id", ondelete="SET NULL"), nullable=True)

    # Relationships
    created_by = relationship("User", foreign_keys=[created_by_id])
    marketing_campaign = relationship("MarketingCampaign", back_populates="expenses")

    @property
    def category_display(self):
        categories = {
            "rent": "Аренда",
            "equipment": "Инвентарь",
            "marketing": "Маркетинг",
            "maintenance": "Обслуживание",
            "salary_extra": "Доп. выплаты",
            "event": "Мероприятия",
            "other": "Прочее"
        }
        return categories.get(self.category, self.category)
