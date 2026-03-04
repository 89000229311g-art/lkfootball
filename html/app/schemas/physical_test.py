from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel

# Physical Test Schemas
class PhysicalTestBase(BaseModel):
    name: str
    description: Optional[str] = None
    unit: Optional[str] = None
    category: Optional[str] = None
    min_age: Optional[int] = None
    max_age: Optional[int] = None
    is_active: bool = True

class PhysicalTestCreate(PhysicalTestBase):
    pass

class PhysicalTestUpdate(PhysicalTestBase):
    name: Optional[str] = None
    is_active: Optional[bool] = None

class PhysicalTest(PhysicalTestBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True

# Student Result Schemas
class PhysicalTestResultBase(BaseModel):
    test_id: int
    value: float
    quarter: int
    year: int
    date: Optional[datetime] = None

class PhysicalTestResultCreate(PhysicalTestResultBase):
    student_id: Optional[int] = None

class PhysicalTestResult(PhysicalTestResultBase):
    id: int
    student_id: int
    coach_id: Optional[int] = None
    created_at: datetime
    test: Optional[PhysicalTest] = None

    class Config:
        from_attributes = True

class StudentPhysicalStats(BaseModel):
    student_id: int
    results: List[PhysicalTestResult]
