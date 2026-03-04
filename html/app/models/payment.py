from sqlalchemy import Column, Integer, Float, Date, String, ForeignKey, Enum as SQLEnum, Index, DateTime
from sqlalchemy.orm import relationship
from enum import Enum
from .base import Base

class PaymentMethod(str, Enum):
    CASH = "cash"
    CARD = "card"
    BANK_TRANSFER = "bank_transfer"

class Payment(Base):
    __tablename__ = "payments"
    
    # Performance indexes for frequently queried columns
    __table_args__ = (
        Index('ix_payment_student_period', 'student_id', 'payment_period'),
        Index('ix_payment_status_date', 'status', 'payment_date'),
        Index('ix_payment_period', 'payment_period'),
        Index('ix_payment_deleted_at', 'deleted_at'),
    )

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("students.id", ondelete="CASCADE"))
    amount = Column(Float)
    payment_date = Column(Date)
    payment_period = Column(Date)  # For which month the payment is made (e.g., 01.09.2024)
    method = Column(String, default="cash")
    
    # New fields
    status = Column(String, default="completed")  # completed, pending, cancelled
    description = Column(String, nullable=True)
    reference_id = Column(String, nullable=True)  # Transaction ID, Invoice #
    
    # Soft delete fields
    deleted_at = Column(DateTime, nullable=True)
    deletion_reason = Column(String(255), nullable=True)
    deleted_by_id = Column(Integer, nullable=True)
    
    # Metadata for restoration
    last_student_name = Column(String(255), nullable=True)  # Store student name before deletion

    # Relationships
    student = relationship("Student", back_populates="payments")
    invoice_items = relationship("InvoiceItem", back_populates="payment", cascade="all, delete-orphan")

    @property
    def student_name(self):
        if self.student:
            return f"{self.student.first_name} {self.student.last_name}"
        return self.last_student_name