from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime, Enum as SQLEnum
from sqlalchemy.orm import relationship
from app.models.base import Base
import enum
from datetime import datetime

class InvoiceItemType(str, enum.Enum):
    GROUP_TRAINING = "group_training"
    INDIVIDUAL_TRAINING = "individual_training"
    EQUIPMENT = "equipment"
    MEMBERSHIP = "membership"
    OTHER = "other"

class InvoiceItem(Base):
    __tablename__ = "invoice_items"

    id = Column(Integer, primary_key=True, index=True)
    payment_id = Column(Integer, ForeignKey("payments.id", ondelete="CASCADE"), nullable=False)
    item_type = Column(String, nullable=False)  # Stores InvoiceItemType value
    description = Column(String(500), nullable=False)
    quantity = Column(Integer, default=1, nullable=False)
    unit_price = Column(Float, nullable=False)
    total_price = Column(Float, nullable=False)
    service_date = Column(DateTime, nullable=True)
    
    # Relationships
    payment = relationship("app.models.payment.Payment", back_populates="invoice_items")
