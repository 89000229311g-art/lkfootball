from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Enum, Boolean, func
from sqlalchemy.orm import relationship
from datetime import datetime
import enum
from .base import Base

class LeadStatus(str, enum.Enum):
    NEW = "new"
    CALL = "call"
    TRIAL = "trial"
    OFFER = "offer"
    DEAL = "deal"
    SUCCESS = "success"
    REJECT = "reject"

class Lead(Base):
    __tablename__ = "leads"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    phone = Column(String, index=True)
    age = Column(Integer, nullable=True)  # New field
    next_contact_date = Column(DateTime, nullable=True)  # New field
    status = Column(String, default=LeadStatus.NEW)
    source = Column(String, nullable=True)
    notes = Column(String, nullable=True)
    rejection_reason = Column(String, nullable=True)
    first_call_at = Column(DateTime, nullable=True)
    first_trial_at = Column(DateTime, nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_by = relationship("User", foreign_keys=[created_by_id])
    
    responsible_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    responsible = relationship("User", foreign_keys=[responsible_id])


class LeadTask(Base):
    __tablename__ = "lead_tasks"

    id = Column(Integer, primary_key=True, index=True)
    lead_id = Column(Integer, ForeignKey("leads.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String, nullable=False)
    due_date = Column(DateTime, nullable=True)
    completed = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)

    lead = relationship("Lead", backref="tasks")
