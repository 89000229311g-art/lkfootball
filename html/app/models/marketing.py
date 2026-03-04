from sqlalchemy import Column, Integer, String, Float, Enum, ForeignKey
from sqlalchemy.orm import relationship
from .base import Base

class MarketingCampaign(Base):
    __tablename__ = "marketing_campaigns"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    status = Column(String, default="planning", index=True)  # planning, preparing, active, paused, scaling, archived
    budget = Column(Float, default=0.0)
    spend = Column(Float, default=0.0)
    leads = Column(Integer, default=0)
    paying_students = Column(Integer, default=0)
    revenue = Column(Float, default=0.0)
    source = Column(String, nullable=True)
    
    expenses = relationship("Expense", back_populates="marketing_campaign", cascade="all, delete-orphan")
    
    @property
    def total_spend(self):
        """Calculate total spend from linked expenses"""
        return sum(expense.amount for expense in self.expenses) if self.expenses else 0.0
    
    # Optional: Link to creator if needed
    # created_by_id = Column(Integer, ForeignKey("users.id"))
    # created_by = relationship("User", foreign_keys=[created_by_id])
