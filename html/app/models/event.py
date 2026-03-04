from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from enum import Enum
from .base import Base

class EventType(str, Enum):
    TRAINING = "TRAINING"              # 🏋️ Обычная тренировка
    GAME = "GAME"                      # ⚽ Игра/Матч
    TOURNAMENT = "TOURNAMENT"          # 🏆 Турнир
    CHAMPIONSHIP = "CHAMPIONSHIP"      # 🥇 Чемпионат
    PARENT_MEETING = "PARENT_MEETING"  # 👨‍👩‍👧 Собрание родителей
    INDIVIDUAL = "INDIVIDUAL"          # 🎯 Индивидуальная тренировка
    MEDICAL = "MEDICAL"                # 🏥 Медицинский осмотр
    TESTING = "TESTING"                # 📊 Тестирование (сдача нормативов)

class Event(Base):
    __tablename__ = "events"

    id = Column(Integer, primary_key=True, index=True)
    group_id = Column(Integer, ForeignKey("groups.id", ondelete="CASCADE"), nullable=True)
    student_id = Column(Integer, ForeignKey("students.id", ondelete="SET NULL"), nullable=True)
    start_time = Column(DateTime)
    end_time = Column(DateTime)
    type = Column(String)
    location = Column(String)
    status = Column(String, default="scheduled")
    notes = Column(String, nullable=True)
    
    # Поля для управления играми/матчами
    opponent_team = Column(String(200), nullable=True)  # Команда противника
    home_away = Column(String(10), nullable=True)  # home/away/neutral
    score_home = Column(Integer, nullable=True)  # Наши голы
    score_away = Column(Integer, nullable=True)  # Голы противника
    meeting_time = Column(DateTime, nullable=True)  # Время сбора
    departure_time = Column(DateTime, nullable=True)  # Время выезда
    transport_info = Column(String, nullable=True)  # Информация о транспорте
    uniform_color = Column(String(50), nullable=True)  # Цвет формы
    equipment_required = Column(String, nullable=True)  # Необходимое оборудование
    
    # Training Plan
    training_plan = Column(String, nullable=True)  # JSON or Text description of exercises

    # Relationships
    group = relationship("Group", back_populates="events")
    student = relationship("Student", foreign_keys=[student_id])
    attendances = relationship("Attendance", back_populates="event")
    media_reports = relationship("MediaReport", back_populates="event")
    bookings = relationship("Booking", back_populates="event")
    training_plan_rel = relationship("TrainingPlan", back_populates="event", uselist=False)
