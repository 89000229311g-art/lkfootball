from sqlalchemy import Column, Integer, String, Date, Float, Boolean, Text, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from enum import Enum
from .base import Base

class StudentStatus(str, Enum):
    ACTIVE = "active"       # Активный
    FROZEN = "frozen"       # Заморожен
    ARCHIVED = "archived"   # Архив

class Student(Base):
    __tablename__ = "students"

    id = Column(Integer, primary_key=True, index=True)
    first_name = Column(String)
    last_name = Column(String)
    dob = Column(Date)
    parent_phone = Column(String, nullable=True)  # Parent's phone
    group_id = Column(Integer, ForeignKey("groups.id", ondelete="SET NULL"), nullable=True)
    avatar_url = Column(String, nullable=True)
    status = Column(String, default="active")  # active, frozen, archived
    
    # Financial
    balance = Column(Float, default=0.0)                    # Общий баланс (MDL)
    subscription_expires = Column(Date, nullable=True)      # Дата окончания абонемента
    is_debtor = Column(Boolean, default=False)              # Флаг должника
    
    # ИНДИВИДУАЛЬНАЯ ОПЛАТА (для скидок)
    individual_fee = Column(Float, nullable=True)           # Индивидуальная сумма абонемента (если NULL - берётся из группы)
    fee_discount_reason = Column(String(255), nullable=True) # Причина скидки (многодетная семья, спонсор и т.д.)
    
    # ОПТИМИЗАЦИЯ: Кэшированная сумма платежей (для аналитики)
    total_paid_cache = Column(Float, default=0.0)           # Кэш суммы всех платежей
    cache_updated_at = Column(DateTime, nullable=True)      # Время обновления кэша
    
    # Freeze functionality
    is_frozen = Column(Boolean, default=False)
    freeze_until = Column(Date, nullable=True)
    freeze_document_url = Column(String, nullable=True)     # Справка
    
    # Medical info (УЛУЧШЕНО)
    medical_info = Column(Text, nullable=True)              # Аллергии, хрон. заболевания
    medical_certificate_expires = Column(Date, nullable=True) # Срок действия медсправки
    medical_certificate_file = Column(String, nullable=True) # URL файла медсправки
    medical_notes = Column(Text, nullable=True)             # NEW: Детальные медицинские заметки (астма, бронхит и т.д.)
    insurance_expires = Column(Date, nullable=True)         # Срок действия страховки
    blood_type = Column(String(10), nullable=True)          # Группа крови (A+, B-, O+, AB+, etc.)
    allergies = Column(Text, nullable=True)                 # Отдельное поле для аллергий
    emergency_contact = Column(String(100), nullable=True)  # Экстренный контакт (имя)
    emergency_phone = Column(String(20), nullable=True)     # Телефон экстренного контакта
    insurance_number = Column(String(50), nullable=True)    # Номер страхового полиса
    height = Column(Float, nullable=True)                   # Рост (см)
    weight = Column(Float, nullable=True)                   # Вес (кг)
    
    # Football Profile (Mini Questionnaire)
    position = Column(String, nullable=True)                # Forward, Midfielder, Defender, Goalkeeper
    dominant_foot = Column(String, nullable=True)           # Right, Left, Both
    tshirt_size = Column(String, nullable=True)             # XS, S, M, L, XL, etc.
    shoe_size = Column(String, nullable=True)               # Shoe size (e.g., 38, 42, 45)
    notes = Column(Text, nullable=True)                     # General notes
    
    # Soft delete fields for archive/restore functionality
    deleted_at = Column(DateTime, nullable=True, index=True)  # When deleted (null = active)
    deletion_reason = Column(String(255), nullable=True)       # Why deleted
    deleted_by_id = Column(Integer, nullable=True)             # Who deleted
    last_parent_name = Column(String(255), nullable=True)      # Parent info at deletion time
    last_parent_phone = Column(String(50), nullable=True)      # Parent phone at deletion time
    last_group_name = Column(String(255), nullable=True)       # Group info at deletion time

    # Attendance Streak
    attendance_streak = Column(Integer, default=0)
    stars = Column(Integer, default=0)
    
    # Relationships
    group = relationship("Group", back_populates="students")
    guardians = relationship("StudentGuardian", back_populates="student")
    attendance_records = relationship("Attendance", back_populates="student")
    payments = relationship("Payment", back_populates="student")
    group_history = relationship("StudentGroupHistory", back_populates="student")
    skill_ratings = relationship("StudentSkills", back_populates="student", order_by="desc(StudentSkills.rating_year), desc(StudentSkills.rating_month)")
    bookings = relationship("Booking", back_populates="student", cascade="all, delete-orphan")
    
    # NEW: Improvement relationships
    achievements = relationship("Achievement", back_populates="student", cascade="all, delete-orphan")
    photos = relationship("StudentPhoto", back_populates="student", cascade="all, delete-orphan")
    absence_requests = relationship("AbsenceRequest", back_populates="student", cascade="all, delete-orphan")
    payment_reminders = relationship("PaymentReminder", back_populates="student", cascade="all, delete-orphan")
    recommendations = relationship("CoachRecommendation", back_populates="student", cascade="all, delete-orphan")
    physical_test_results = relationship("StudentPhysicalTestResult", back_populates="student", cascade="all, delete-orphan")
    freeze_requests = relationship("FreezeRequest", back_populates="student", cascade="all, delete-orphan")

    @property
    def guardian_ids(self):
        """Returns list of guardian user IDs for Pydantic models"""
        return [g.user_id for g in self.guardians]