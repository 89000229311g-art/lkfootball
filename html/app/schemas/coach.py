from pydantic import BaseModel
from typing import List, Optional
from datetime import date

class ParentInfo(BaseModel):
    id: int
    full_name: str
    phone: str
    phone_secondary: Optional[str] = None
    avatar_url: Optional[str] = None

class StudentWithParents(BaseModel):
    id: int
    first_name: str
    last_name: str
    dob: Optional[date] = None
    avatar_url: Optional[str] = None
    status: str
    parents: List[ParentInfo] = []

class GroupWithStudentsAndParents(BaseModel):
    id: int
    name: str
    students: List[StudentWithParents] = []
    
    class Config:
        orm_mode = True