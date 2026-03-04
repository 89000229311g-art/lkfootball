from sqlalchemy import Column, Integer, String, ForeignKey
from sqlalchemy.orm import relationship
from .base import Base

class StudentGuardian(Base):
    __tablename__ = "student_guardians"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("students.id", ondelete="CASCADE"))
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"))
    relationship_type = Column(String, nullable=True)  # e.g., "Father", "Mother", "Grandparent"

    # Relationships
    student = relationship("Student", back_populates="guardians")
    user = relationship("User", back_populates="student_guardians")