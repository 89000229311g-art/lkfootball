"""
Salary models for employee payment management.

EmployeeContract: Defines salary calculation type and rates per employee
SalaryPayment: Records of actual salary payments (advances and full payments)
"""
from sqlalchemy import Column, Integer, Float, String, Boolean, Date, DateTime, ForeignKey, Index, JSON
from sqlalchemy.orm import relationship
from enum import Enum
from datetime import datetime
from .base import Base
from app.core.timezone import now_naive


class SalaryType(str, Enum):
    """Types of salary calculation"""
    FIXED = "fixed"               # Fixed monthly salary
    PER_STUDENT = "per_student"   # Based on student count in groups
    PER_TRAINING = "per_training" # Based on trainings conducted
    COMBINED = "combined"         # Base salary + bonuses


class PaymentType(str, Enum):
    """Types of salary payments"""
    ADVANCE = "advance"     # Аванс (25 числа)
    SALARY = "salary"       # Зарплата (10 числа за прошлый месяц)
    BONUS = "bonus"         # Премия
    DEDUCTION = "deduction" # Вычет


class EmployeeContract(Base):
    """
    Employee salary contract - defines how salary is calculated.
    Each employee can have only one active contract at a time.
    """
    __tablename__ = "employee_contracts"
    
    __table_args__ = (
        Index('ix_contract_user_active', 'user_id', 'is_active'),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    
    # Salary type and rates
    salary_type = Column(String, default="fixed")  # fixed/per_student/per_training/combined
    base_salary = Column(Float, default=0)         # Fixed salary amount (MDL)
    per_student_rate = Column(Float, default=0)    # Bonus per student (MDL)
    per_training_rate = Column(Float, default=0)   # Bonus per training conducted (MDL)
    rates = Column(JSON, default={})               # Specific rates per event type: {"game": 300, "training": 150}
    
    # Advance settings
    advance_percent = Column(Float, default=40)    # % of salary paid as advance (default 40%)
    advance_day = Column(Integer, default=25)      # Day of month for advance
    salary_day = Column(Integer, default=10)       # Day of month for remaining salary
    
    # Contract period
    effective_from = Column(Date, nullable=False)
    effective_to = Column(Date, nullable=True)     # NULL = indefinite
    is_active = Column(Boolean, default=True)
    
    # Metadata
    notes = Column(String(500), nullable=True)     # Additional notes
    created_at = Column(DateTime, default=now_naive)
    updated_at = Column(DateTime, default=now_naive, onupdate=now_naive)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    
    # Relationships
    user = relationship("User", foreign_keys=[user_id], backref="salary_contracts")
    created_by = relationship("User", foreign_keys=[created_by_id])
    
    @property
    def salary_type_display(self):
        """Human-readable salary type"""
        types = {
            "fixed": "Фиксированный оклад",
            "per_student": "За ученика",
            "per_training": "За тренировку",
            "combined": "Оклад + бонусы"
        }
        return types.get(self.salary_type, self.salary_type)


class SalaryPayment(Base):
    """
    Actual salary payment record.
    Tracks all payments: advances, salaries, bonuses, deductions.
    """
    __tablename__ = "salary_payments"
    
    __table_args__ = (
        Index('ix_payment_user_period', 'user_id', 'period_year', 'period_month'),
        Index('ix_payment_date', 'payment_date'),
        Index('ix_payment_status', 'status'),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    
    # Payment details
    amount = Column(Float, nullable=False)
    payment_type = Column(String, default="salary")  # advance/salary/bonus/deduction
    payment_date = Column(Date, nullable=False)
    
    # Period this payment covers
    period_month = Column(Integer, nullable=False)   # 1-12
    period_year = Column(Integer, nullable=False)
    
    # Payment method and status
    method = Column(String, default="cash")          # cash/card/bank_transfer
    status = Column(String, default="completed")     # pending/completed/cancelled
    
    # Additional info
    description = Column(String(500), nullable=True)
    reference_id = Column(String(100), nullable=True)  # Bank transfer reference, receipt #
    
    # Calculation details (for audit)
    calculated_base = Column(Float, nullable=True)     # Base salary at time of calculation
    calculated_students = Column(Integer, nullable=True) # Students count used
    calculated_trainings = Column(Integer, nullable=True) # Trainings count used
    
    # Metadata
    created_at = Column(DateTime, default=now_naive)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    
    # Relationships
    user = relationship("User", foreign_keys=[user_id], backref="salary_payments")
    created_by = relationship("User", foreign_keys=[created_by_id])
    
    @property
    def payment_type_display(self):
        """Human-readable payment type"""
        types = {
            "advance": "Аванс",
            "salary": "Зарплата",
            "bonus": "Премия",
            "deduction": "Вычет"
        }
        return types.get(self.payment_type, self.payment_type)
    
    @property
    def period_display(self):
        """Human-readable period"""
        months = {
            1: "Январь", 2: "Февраль", 3: "Март", 4: "Апрель",
            5: "Май", 6: "Июнь", 7: "Июль", 8: "Август",
            9: "Сентябрь", 10: "Октябрь", 11: "Ноябрь", 12: "Декабрь"
        }
        return f"{months.get(self.period_month, '')} {self.period_year}"
