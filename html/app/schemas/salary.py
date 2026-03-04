"""
Pydantic schemas for salary management API.
"""
from pydantic import BaseModel, Field
from typing import Optional, List, Dict
from datetime import date, datetime
from enum import Enum


class SalaryTypeEnum(str, Enum):
    FIXED = "fixed"
    PER_STUDENT = "per_student"
    PER_TRAINING = "per_training"
    COMBINED = "combined"


class PaymentTypeEnum(str, Enum):
    ADVANCE = "advance"
    SALARY = "salary"
    BONUS = "bonus"
    DEDUCTION = "deduction"


class PaymentMethodEnum(str, Enum):
    CASH = "cash"
    CARD = "card"
    BANK_TRANSFER = "bank_transfer"


class PaymentStatusEnum(str, Enum):
    PENDING = "pending"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


# ==================== CONTRACT SCHEMAS ====================

class ContractBase(BaseModel):
    salary_type: SalaryTypeEnum = SalaryTypeEnum.FIXED
    base_salary: float = 0
    per_student_rate: float = 0
    per_training_rate: float = 0
    rates: Optional[Dict[str, float]] = {}  # Specific rates per event type
    advance_percent: float = 40
    advance_day: int = 25
    salary_day: int = 10
    effective_from: date
    effective_to: Optional[date] = None
    notes: Optional[str] = None


class ContractCreate(ContractBase):
    user_id: int


class ContractUpdate(BaseModel):
    salary_type: Optional[SalaryTypeEnum] = None
    base_salary: Optional[float] = None
    per_student_rate: Optional[float] = None
    per_training_rate: Optional[float] = None
    rates: Optional[Dict[str, float]] = None
    advance_percent: Optional[float] = None
    advance_day: Optional[int] = None
    salary_day: Optional[int] = None
    effective_from: Optional[date] = None
    effective_to: Optional[date] = None
    is_active: Optional[bool] = None
    notes: Optional[str] = None


class ContractResponse(ContractBase):
    id: int
    user_id: int
    is_active: bool
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    
    # Additional info
    user_name: Optional[str] = None
    user_role: Optional[str] = None
    salary_type_display: Optional[str] = None
    
    class Config:
        from_attributes = True


class ContractWithCalculation(ContractResponse):
    """Contract with calculated salary preview"""
    calculated_salary: float = 0
    students_count: int = 0
    trainings_count: int = 0
    advance_amount: float = 0
    remaining_amount: float = 0


# ==================== PAYMENT SCHEMAS ====================

class PaymentBase(BaseModel):
    amount: float = Field(..., gt=0, description="Payment amount in MDL")
    payment_type: PaymentTypeEnum = PaymentTypeEnum.SALARY
    payment_date: date
    period_month: int = Field(..., ge=1, le=12)
    period_year: int = Field(..., ge=2020, le=2100)
    method: PaymentMethodEnum = PaymentMethodEnum.CASH
    description: Optional[str] = None
    reference_id: Optional[str] = None


class PaymentCreate(PaymentBase):
    user_id: int
    status: PaymentStatusEnum = PaymentStatusEnum.COMPLETED


class PaymentUpdate(BaseModel):
    amount: Optional[float] = Field(None, gt=0)
    payment_type: Optional[PaymentTypeEnum] = None
    payment_date: Optional[date] = None
    period_month: Optional[int] = Field(None, ge=1, le=12)
    period_year: Optional[int] = Field(None, ge=2020, le=2100)
    method: Optional[PaymentMethodEnum] = None
    status: Optional[PaymentStatusEnum] = None
    description: Optional[str] = None
    reference_id: Optional[str] = None


class PaymentResponse(PaymentBase):
    id: int
    user_id: int
    status: str
    created_at: Optional[datetime] = None
    created_by_id: Optional[int] = None
    
    # Additional info
    user_name: Optional[str] = None
    user_role: Optional[str] = None
    payment_type_display: Optional[str] = None
    period_display: Optional[str] = None
    
    # Calculation details
    calculated_base: Optional[float] = None
    calculated_students: Optional[int] = None
    calculated_trainings: Optional[int] = None
    
    class Config:
        from_attributes = True


# ==================== REPORT SCHEMAS ====================

class EmployeeSalaryReport(BaseModel):
    """Monthly salary report for one employee"""
    user_id: int
    user_name: str
    user_role: str
    
    # Contract info
    contract_id: Optional[int] = None
    salary_type: Optional[str] = None
    base_salary: float = 0
    
    # Calculations
    calculated_salary: float = 0
    students_count: int = 0
    trainings_count: int = 0
    
    # Payments for this period
    advance_paid: float = 0
    salary_paid: float = 0
    bonus_paid: float = 0
    deductions: float = 0
    total_paid: float = 0
    
    # Balance
    remaining: float = 0  # calculated_salary - total_paid


class MonthlyReportResponse(BaseModel):
    """Full monthly salary report"""
    year: int
    month: int
    month_name: str
    
    # Summary
    total_employees: int
    total_calculated: float  # Total salaries due
    total_paid: float        # Total actually paid
    total_remaining: float   # Outstanding balance
    
    # Per employee breakdown
    employees: List[EmployeeSalaryReport]


class EmployeePaymentsSummary(BaseModel):
    """Summary of employee's own payments"""
    user_id: int
    user_name: str
    
    # Current contract
    has_contract: bool
    salary_type: Optional[str] = None
    base_salary: float = 0
    
    # This month
    current_month_salary: float = 0
    current_month_paid: float = 0
    current_month_remaining: float = 0
    
    # Year to date
    ytd_total_earned: float = 0
    ytd_total_paid: float = 0
    
    # Next payment info
    next_payment_type: Optional[str] = None  # "advance" or "salary"
    next_payment_date: Optional[date] = None
    next_payment_amount: Optional[float] = None
    
    # Recent payments
    recent_payments: List[PaymentResponse] = []


# ==================== LIST/PAGINATION SCHEMAS ====================

class ContractListResponse(BaseModel):
    data: List[ContractResponse]
    total: int


class PaymentListResponse(BaseModel):
    data: List[PaymentResponse]
    total: int
    skip: int = 0
    limit: int = 100
