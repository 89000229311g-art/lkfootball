from typing import Optional, List
from pydantic import BaseModel, ConfigDict
from datetime import datetime

# Training Plan Schemas
class TrainingPlanBase(BaseModel):
    objectives: Optional[str] = None
    theme: Optional[str] = None

class TrainingPlanCreate(TrainingPlanBase):
    event_id: int

class TrainingPlanUpdate(TrainingPlanBase):
    pass

class TrainingPlan(TrainingPlanBase):
    id: int
    event_id: int
    coach_id: Optional[int]
    model_config = ConfigDict(from_attributes=True)

# Media Report Schemas
class MediaReportBase(BaseModel):
    url: str
    type: str = "photo"

class MediaReportCreate(MediaReportBase):
    event_id: int

class MediaReport(MediaReportBase):
    id: int
    event_id: int
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)
