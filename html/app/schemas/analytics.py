from pydantic import BaseModel
from typing import List, Optional, Dict
from datetime import date

class FinancialPeriodStats(BaseModel):
    period: str  # e.g., "2024-10" or "2024"
    revenue: float
    payment_count: int
    unique_payers: int
    growth_rate: Optional[float] = None  # Percentage change from previous period

class FinancialReport(BaseModel):
    generated_at: date
    period_type: str  # "month" or "year"
    data: List[FinancialPeriodStats]
    total_revenue: float
    average_revenue: float

class DebtorStudent(BaseModel):
    id: int
    full_name: str
    group_name: Optional[str]
    parent_name: Optional[str]
    parent_phone: Optional[str]
    last_payment_date: Optional[date]
    last_payment_amount: Optional[float]
    balance: float

class RevenueByGroup(BaseModel):
    group_id: int
    group_name: str
    revenue: float
    payer_count: int
