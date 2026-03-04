"""
📅 Schedule Template Model
Позволяет создавать шаблоны расписания с повторяющимся циклом на год.

Примеры:
- U10: Пн-Пт 17:00-18:00 (тренировки), Сб (игровой день), Вс (выходной)
- U12: Пн,Ср,Пт 18:00-19:30
"""
from sqlalchemy import Column, Integer, String, Time, Boolean, ForeignKey, DateTime, JSON
from sqlalchemy.orm import relationship, backref
from datetime import datetime
from .base import Base
from app.core.timezone import now_naive


class ScheduleTemplate(Base):
    """
    Шаблон расписания для группы.
    Позволяет задать повторяющееся расписание на год.
    """
    __tablename__ = "schedule_templates"
    
    id = Column(Integer, primary_key=True, index=True)
    group_id = Column(Integer, ForeignKey("groups.id", ondelete="CASCADE"), nullable=False)
    
    # Название шаблона (например "Основное расписание U10")
    name = Column(String(100), nullable=False)
    
    # Период действия шаблона
    valid_from = Column(DateTime, nullable=False)  # Начало действия
    valid_until = Column(DateTime, nullable=False)  # Конец действия (обычно +1 год)
    
    # Статус шаблона
    is_active = Column(Boolean, default=True)
    
    # Дни и время тренировок (JSON format)
    # [{"day": 0, "start_time": "17:00", "end_time": "18:00", "type": "training", "location": "Поле 1"}]
    # day: 0=Пн, 1=Вт, 2=Ср, 3=Чт, 4=Пт, 5=Сб, 6=Вс
    schedule_rules = Column(JSON, nullable=False)
    
    # Исключения (праздники, каникулы) - даты когда НЕ будет занятий
    # ["2026-01-01", "2026-01-07", ...]
    excluded_dates = Column(JSON, default=list)
    
    # Метаданные
    created_at = Column(DateTime, default=now_naive)
    updated_at = Column(DateTime, default=now_naive, onupdate=now_naive)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    
    # Soft Delete
    deleted_at = Column(DateTime, nullable=True)
    deletion_reason = Column(String(255), nullable=True)
    deleted_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    
    # Relationships
    group = relationship("Group", backref="schedule_templates")
    creator = relationship("User", foreign_keys=[created_by])
    deleter = relationship("User", foreign_keys=[deleted_by_id])


class GeneratedEvent(Base):
    """
    Связь между сгенерированным событием и шаблоном.
    Позволяет отслеживать какие события были созданы из какого шаблона.
    """
    __tablename__ = "generated_events"
    
    id = Column(Integer, primary_key=True, index=True)
    template_id = Column(Integer, ForeignKey("schedule_templates.id", ondelete="CASCADE"), nullable=False)
    event_id = Column(Integer, ForeignKey("events.id", ondelete="CASCADE"), nullable=False)
    
    # Исходная дата из шаблона (до возможных изменений)
    original_date = Column(DateTime, nullable=False)
    
    # Было ли событие изменено вручную
    is_modified = Column(Boolean, default=False)
    
    # Было ли событие отменено
    is_cancelled = Column(Boolean, default=False)
    
    # Relationships
    template = relationship("ScheduleTemplate", backref=backref("generated_events", cascade="all, delete-orphan"))
    event = relationship("Event", backref="template_link")


class ScheduleChange(Base):
    """
    Лог изменений расписания с автоматическими уведомлениями.
    Хранит историю всех изменений для информирования родителей и тренеров.
    """
    __tablename__ = "schedule_changes"
    
    id = Column(Integer, primary_key=True, index=True)
    event_id = Column(Integer, ForeignKey("events.id", ondelete="SET NULL"), nullable=True)
    group_id = Column(Integer, ForeignKey("groups.id", ondelete="CASCADE"), nullable=False, index=True)
    
    # Тип изменения: cancelled, rescheduled, location_changed, time_changed
    change_type = Column(String(30), nullable=False)
    
    # Причина изменения (обязательная для уведомлений)
    reason = Column(String(500), nullable=False)
    
    # Старые и новые значения времени
    old_start_time = Column(DateTime, nullable=True)
    new_start_time = Column(DateTime, nullable=True)
    old_end_time = Column(DateTime, nullable=True)
    new_end_time = Column(DateTime, nullable=True)
    
    # Старое и новое место
    old_location = Column(String(200), nullable=True)
    new_location = Column(String(200), nullable=True)
    
    # Кто внёс изменение
    changed_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    
    # Статус уведомлений
    notification_sent = Column(Boolean, default=False)
    notification_sent_at = Column(DateTime, nullable=True)
    parents_notified = Column(Integer, default=0)  # Количество уведомлённых родителей
    coach_notified = Column(Boolean, default=False)
    sms_sent = Column(Boolean, default=False)  # Отправлено ли SMS
    
    # Метаданные
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    event = relationship("Event", backref="schedule_changes")
    group = relationship("Group", backref="schedule_changes")
    changed_by_user = relationship("User", foreign_keys=[changed_by])
