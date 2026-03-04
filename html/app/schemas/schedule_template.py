"""
📅 Schedule Template Schemas
Pydantic schemas for recurring schedule management.
"""
from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List
from datetime import datetime


class ScheduleRule(BaseModel):
    """Правило расписания на один день недели"""
    day: int = Field(..., ge=0, le=6, description="День недели: 0=Пн, 1=Вт, 2=Ср, 3=Чт, 4=Пт, 5=Сб, 6=Вс")
    start_time: str = Field(..., example="17:00", description="Время начала HH:MM")
    end_time: str = Field(..., example="18:00", description="Время окончания HH:MM")
    type: str = Field("training", example="training", description="Тип: training, game, rest")
    location: Optional[str] = Field(None, example="Поле 1")


class ScheduleTemplateCreate(BaseModel):
    """Создание шаблона расписания"""
    group_id: int = Field(..., description="ID группы")
    name: str = Field(..., example="Основное расписание U10", max_length=100)
    valid_from: datetime = Field(..., description="Начало действия расписания")
    valid_until: datetime = Field(..., description="Окончание действия (обычно +1 год)")
    schedule_rules: List[ScheduleRule] = Field(..., description="Правила расписания по дням")
    excluded_dates: List[str] = Field(default=[], description="Исключения (праздники, каникулы) в формате YYYY-MM-DD")
    is_active: bool = Field(False, description="Активен ли шаблон сразу после создания")


class ScheduleTemplateUpdate(BaseModel):
    """Обновление шаблона расписания"""
    name: Optional[str] = Field(None, max_length=100)
    valid_from: Optional[datetime] = None
    valid_until: Optional[datetime] = None
    schedule_rules: Optional[List[ScheduleRule]] = None
    excluded_dates: Optional[List[str]] = None
    is_active: Optional[bool] = None
    regenerate_future: Optional[bool] = Field(None, description="Пересоздать будущие события (при изменении правил)")


class ScheduleTemplateResponse(BaseModel):
    """Ответ с шаблоном расписания"""
    id: int
    group_id: int
    name: str
    valid_from: datetime
    valid_until: datetime
    is_active: bool
    schedule_rules: List[dict]
    excluded_dates: List[str]
    created_at: datetime
    updated_at: datetime
    
    # Дополнительные поля для отображения
    group_name: Optional[str] = None
    events_generated: int = 0
    
    model_config = ConfigDict(from_attributes=True)


class GeneratedEventResponse(BaseModel):
    """Информация о сгенерированном событии"""
    id: int
    template_id: int
    event_id: int
    original_date: datetime
    is_modified: bool
    is_cancelled: bool
    
    model_config = ConfigDict(from_attributes=True)


class GenerateEventsRequest(BaseModel):
    """Запрос на генерацию событий из шаблона"""
    template_id: int
    start_date: Optional[datetime] = Field(None, description="С какой даты генерировать (по умолчанию - сегодня)")
    end_date: Optional[datetime] = Field(None, description="До какой даты генерировать (по умолчанию - valid_until шаблона)")
    overwrite_existing: bool = Field(False, description="Перезаписать существующие события")


class GenerateEventsResponse(BaseModel):
    """Результат генерации событий"""
    success: bool
    events_created: int
    events_skipped: int
    message: str


class BulkCancelRequest(BaseModel):
    """Массовая отмена событий"""
    event_ids: List[int] = Field(..., description="ID событий для отмены")
    reason: str = Field(..., min_length=5, max_length=500, description="Причина отмены (обязательно)")
    send_sms: bool = Field(True, description="Отправить SMS уведомление родителям")


class RescheduleEventRequest(BaseModel):
    """Перенос события на другое время"""
    event_id: int
    new_start_time: datetime
    new_end_time: datetime
    reason: str = Field(..., min_length=5, max_length=500, description="Причина переноса (обязательно)")
    send_sms: bool = Field(True, description="Отправить SMS уведомление родителям")


class EventUpdateRequest(BaseModel):
    """Точечное редактирование события"""
    change_type: str = Field(..., description="Тип изменения: cancelled, rescheduled, location_changed")
    reason: str = Field(..., min_length=5, max_length=500, description="Причина изменения")
    new_start_time: Optional[datetime] = Field(None, description="Новое время начала (для rescheduled)")
    new_end_time: Optional[datetime] = Field(None, description="Новое время окончания (для rescheduled)")
    new_location: Optional[str] = Field(None, max_length=200, description="Новое место (для location_changed)")
    send_sms: bool = Field(True, description="Отправить SMS уведомление родителям")
    notify_coach: bool = Field(True, description="Уведомить тренера")


class ScheduleChangeResponse(BaseModel):
    """Ответ с информацией об изменении расписания"""
    id: int
    event_id: Optional[int]
    group_id: int
    group_name: Optional[str] = None
    change_type: str
    reason: str
    old_start_time: Optional[datetime]
    new_start_time: Optional[datetime]
    old_location: Optional[str]
    new_location: Optional[str]
    changed_by: int
    changed_by_name: Optional[str] = None
    notification_sent: bool
    sms_sent: bool
    created_at: datetime
    
    model_config = ConfigDict(from_attributes=True)
