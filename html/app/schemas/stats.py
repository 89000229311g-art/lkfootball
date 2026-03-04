
from pydantic import BaseModel
from typing import List, Optional
from datetime import date

class GroupStatItem(BaseModel):
    id: int
    name: str
    coach_name: Optional[str]
    students_count: int
    monthly_fee: float
    potential_revenue: float

class PaymentStatItem(BaseModel):
    id: int
    amount: float
    payment_date: date
    student_name: str
    group_name: Optional[str]
    payment_method: str

class ExpiringStudentItem(BaseModel):
    id: int
    first_name: str
    last_name: str
    medical_certificate_expires: date

class StudentBasicItem(BaseModel):
    id: int
    first_name: str
    last_name: str
    group_name: Optional[str]
    debt_amount: Optional[float] = None
    med_status: Optional[str] = None # 'missing' or 'expired'

class DashboardStats(BaseModel):
    total_students: int
    active_students: int
    total_groups: int
    total_coaches: int
    events_this_month: int
    total_revenue: float
    revenue_this_month: float
    attendance_rate: float
    
    # Optimized lists
    group_stats: List[GroupStatItem]
    recent_payments: List[PaymentStatItem]
    expiring_students: List[ExpiringStudentItem]
    
    # Expiring docs count
    expiring_docs_count: int

    # New Admin lists
    paid_students_count: int
    paid_students_list: List[StudentBasicItem]
    debtors_count: int
    debtors_list: List[StudentBasicItem]
    medical_debts_count: int
    medical_debts_list: List[StudentBasicItem]

    # Birthdays
    birthdays_count: int
    birthdays_list: List[StudentBasicItem]
