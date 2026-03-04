"""
StudentSkills Model - Monthly skill ratings for students
Updated to 10-point scale: Technique, Tactics, Physical, Discipline.
"""
from sqlalchemy import Column, Integer, Float, Date, ForeignKey, DateTime, Text, JSON
from sqlalchemy.orm import relationship
from datetime import datetime
from .base import Base


class StudentSkills(Base):
    """
    Оценка навыков игрока тренером (Monthly Grade).
    Шкала: 1-10.
    """
    __tablename__ = "student_skills"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("students.id", ondelete="CASCADE"), nullable=False, index=True)
    
    # Месяц и год оценки (для группировки)
    rating_month = Column(Integer, nullable=False)  # 1-12
    rating_year = Column(Integer, nullable=False)   # e.g. 2026
    
    # 5 ключевых навыков (1-10 баллов)
    technique = Column(Integer, default=5)      # Техника
    tactics = Column(Integer, default=5)        # Тактика
    physical = Column(Integer, default=5)       # Физика
    discipline = Column(Integer, default=5)     # Дисциплина
    speed = Column(Integer, default=5)          # Скорость (NEW)
    
    # Теги таланта (JSON список строк)
    talent_tags = Column(JSON, default=[])

    # Комментарий тренера
    coach_comment = Column(Text, nullable=True)
    
    # Метаданные
    rated_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)  # ID тренера
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    student = relationship("Student", back_populates="skill_ratings")
    rated_by = relationship("User")
    
    def __repr__(self):
        return f"<StudentSkills student_id={self.student_id} {self.rating_month}/{self.rating_year}>"
