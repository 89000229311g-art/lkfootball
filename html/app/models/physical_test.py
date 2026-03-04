from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime, Text, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime
from .base import Base

class PhysicalTest(Base):
    """
    Definitions of physical tests (e.g., 30m sprint, Long Jump).
    """
    __tablename__ = "physical_tests"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    unit = Column(String, nullable=True) # e.g., "sec", "cm", "count", "kg"
    
    # Optional: Categories like "Speed", "Endurance", "Strength"
    category = Column(String, nullable=True) 
    
    # Age group targeting (optional, mainly for UI filtering/suggestions)
    min_age = Column(Integer, nullable=True)
    max_age = Column(Integer, nullable=True)
    
    is_active = Column(Boolean, default=True) # Soft delete/hide
    
    created_at = Column(DateTime, default=datetime.utcnow)
    
    results = relationship("StudentPhysicalTestResult", back_populates="test", cascade="all, delete-orphan")

class StudentPhysicalTestResult(Base):
    """
    Actual records of a student's performance in a test.
    Recorded quarterly.
    """
    __tablename__ = "student_physical_test_results"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("students.id", ondelete="CASCADE"), nullable=False, index=True)
    test_id = Column(Integer, ForeignKey("physical_tests.id", ondelete="CASCADE"), nullable=False)
    
    value = Column(Float, nullable=False)
    
    # Time period
    date = Column(DateTime, default=datetime.utcnow)
    quarter = Column(Integer, nullable=False) # 1, 2, 3, 4
    year = Column(Integer, nullable=False)    # e.g., 2025
    
    # Metadata
    coach_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    student = relationship("Student", back_populates="physical_test_results")
    test = relationship("PhysicalTest", back_populates="results")
    coach = relationship("User")
