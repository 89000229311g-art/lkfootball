from sqlalchemy import Column, Integer, Float, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from datetime import datetime
from .base import Base

class SeasonSummary(Base):
    """
    Архив/Снэпшот успеваемости за год (Season Summary).
    Хранит итоговые средние баллы (GPA) за сезон для быстрого доступа.
    """
    __tablename__ = "season_summaries"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("students.id", ondelete="CASCADE"), nullable=False, index=True)
    
    season_year = Column(Integer, nullable=False)  # e.g., 2024 (covers 2024 season)
    
    # GPA за сезон (Average 1-10)
    gpa_technique = Column(Float, default=0.0)
    gpa_tactics = Column(Float, default=0.0)
    gpa_physical = Column(Float, default=0.0)
    gpa_discipline = Column(Float, default=0.0)
    gpa_speed = Column(Float, default=0.0)
    
    # Общий средний балл за сезон
    total_gpa = Column(Float, default=0.0)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    student = relationship("Student")

    def __repr__(self):
        return f"<SeasonSummary student={self.student_id} year={self.season_year} gpa={self.total_gpa}>"
