from pydantic import BaseModel, Field, ConfigDict, field_validator
from typing import Optional
from datetime import date
from app.models.payment import PaymentMethod

class PaymentBase(BaseModel):
    student_id: int = Field(..., example=1, gt=0)
    amount: float = Field(..., gt=0, example=500.0)
    payment_date: Optional[date] = Field(None, example="2024-01-15")  # NULL for pending invoices
    payment_period: Optional[date] = Field(None, example="2024-01-01", description="For which month the payment is made")
    method: Optional[str] = Field("cash", example="cash")  # Изменено на Optional[str] для совместимости
    status: Optional[str] = Field("completed", example="completed")
    description: Optional[str] = Field(None, example="Monthly fee", max_length=500)
    reference_id: Optional[str] = Field(None, example="TRX123456", max_length=100)
    
    @field_validator("amount")
    @classmethod
    def validate_amount(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("Payment amount must be positive")
        if v > 1000000:  # 1 million limit
            raise ValueError("Payment amount is unrealistically high. Please verify.")
        return round(v, 2)  # Round to 2 decimal places
    
    @field_validator("method")
    @classmethod
    def validate_method(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None  # Разрешаем None для pending счетов
        allowed_methods = ["cash", "card", "bank_transfer", "online"]
        if v not in allowed_methods:
            raise ValueError(f"Payment method must be one of: {', '.join(allowed_methods)}")
        return v
    
    @field_validator("status")
    @classmethod
    def validate_status(cls, v: Optional[str]) -> str:
        if v is None:
            return "completed"
        allowed_statuses = ["completed", "pending", "cancelled", "refunded"]
        if v not in allowed_statuses:
            raise ValueError(f"Payment status must be one of: {', '.join(allowed_statuses)}")
        return v

class PaymentCreate(PaymentBase):
    pass

class PaymentUpdate(BaseModel):
    amount: Optional[float] = Field(None, gt=0, example=500.0)
    payment_date: Optional[date] = Field(None, example="2024-01-15")
    payment_period: Optional[date] = Field(None, example="2024-01-01")
    method: Optional[str] = Field(None, example="cash")  # Изменено на Optional[str]
    status: Optional[str] = Field(None, example="completed")
    description: Optional[str] = Field(None)
    reference_id: Optional[str] = Field(None)

class PaymentInDB(PaymentBase):
    id: int
    student_id: Optional[int] = None  # Allow None for orphaned records
    model_config = ConfigDict(from_attributes=True)

class InvoiceItemResponse(BaseModel):
    """Ответ с детализацией счета"""
    id: int
    item_type: str
    description: str
    quantity: int
    unit_price: float
    total_price: float
    service_date: Optional[date] = None
    model_config = ConfigDict(from_attributes=True)

class PaymentResponse(PaymentInDB):
    student_name: Optional[str] = None
    invoice_items: list[InvoiceItemResponse] = []

class PaymentPagination(BaseModel):
    data: list[PaymentResponse]
    total: int
    skip: int
    limit: int
    pages: int
    model_config = ConfigDict(from_attributes=True)

class StudentPaymentInfo(BaseModel):
    id: int
    first_name: str
    last_name: str
    balance: float
    model_config = ConfigDict(from_attributes=True)

class PaymentWithDetails(PaymentResponse):
    student: Optional[StudentPaymentInfo] = None
    model_config = ConfigDict(from_attributes=True)

class StudentBalance(BaseModel):
    student_id: int
    balance: float
    total_paid: float
    payment_count: int

class PaymentSummary(BaseModel):
    total_payments: int
    total_amount: float
    by_method: dict


# ==================== INVOICE SYSTEM SCHEMAS ====================

class InvoiceGroupRequest(BaseModel):
    """Запрос на массовое выставление счетов группе"""
    payment_period: date = Field(..., description="Первый день месяца (2026-02-01)")
    custom_amount: Optional[float] = Field(None, description="Кастомная сумма (если не указано - берется из группы)")
    description: Optional[str] = Field(None, description="Описание платежа (за что)")
    item_type: str = Field("membership", description="Тип услуги: membership, group_training, etc.")

class InvoiceStudentRequest(BaseModel):
    """Запрос на индивидуальное выставление счета"""
    payment_period: date = Field(..., description="Первый день месяца")
    amount: float = Field(..., gt=0, description="Сумма счета")
    description: Optional[str] = Field(None, description="Описание платежа (за что)")

class PaymentConfirm(BaseModel):
    """Подтверждение оплаты администратором"""
    method: str = Field("cash", description="Метод оплаты: cash, card, bank_transfer")
    reference_id: Optional[str] = Field(None, description="Номер транзакции/квитанции")

class ChildPaymentStatus(BaseModel):
    """Статус оплаты ребенка"""
    student_id: int
    student_name: str
    group_name: Optional[str] = None
    amount: float
    status: str  # pending, completed
    period: str  # "Февраль 2026"
    payment_id: Optional[int] = None

class ParentPaymentStatus(BaseModel):
    """Статус оплаты для родителя"""
    has_debt: bool
    total_pending: float
    children: list[ChildPaymentStatus]

class InvoiceResult(BaseModel):
    """Результат выставления счетов"""
    success: bool
    created_count: int
    skipped_count: int
    message: str
    payments: list[PaymentResponse] = []

# ==================== MANUAL INVOICE CREATION SCHEMAS ====================

class InvoiceItemCreate(BaseModel):
    """Позиция счета для ручного создания"""
    item_type: str = Field(..., description="Тип услуги: group_training, individual_training, equipment, membership, other")
    description: str = Field(..., max_length=500, description="Описание услуги")
    quantity: int = Field(1, ge=1, description="Количество")
    unit_price: float = Field(..., gt=0, description="Цена за единицу")
    
    @property
    def total_price(self) -> float:
        return self.quantity * self.unit_price

class ManualInvoiceCreate(BaseModel):
    """Создание счета вручную с детализацией"""
    student_id: int = Field(..., gt=0, description="ID студента")
    invoice_items: list[InvoiceItemCreate] = Field(..., min_items=1, description="Позиции счета")
    payment_period: Optional[date] = Field(None, description="Период оплаты (например, 2024-02-01)")
    due_date: Optional[date] = Field(None, description="Срок оплаты")
    notes: Optional[str] = Field(None, max_length=500, description="Дополнительные заметки")
    
    @property
    def total_amount(self) -> float:
        return sum(item.total_price for item in self.invoice_items)

class ManualInvoiceResponse(PaymentResponse):
    """Ответ с полной информацией о счете"""
    invoice_items: list[InvoiceItemResponse] = []
    total_amount: float
    due_date: Optional[date] = None
    notes: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)

class PaymentWithItemsResponse(PaymentResponse):
    """Payment with invoice items details"""
    invoice_items: list[InvoiceItemResponse] = []
    model_config = ConfigDict(from_attributes=True)

class StudentPendingInvoicesResponse(BaseModel):
    invoices: list[PaymentWithItemsResponse]
    total_amount: float
