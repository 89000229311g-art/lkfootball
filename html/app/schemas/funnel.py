from pydantic import BaseModel
from typing import Optional

class FunnelStageBase(BaseModel):
    key: str
    title: str
    color: Optional[str] = "bg-gray-500"
    order: Optional[int] = 0
    is_system: Optional[bool] = False

class FunnelStageCreate(FunnelStageBase):
    pass

class FunnelStageUpdate(BaseModel):
    title: Optional[str] = None
    color: Optional[str] = None
    order: Optional[int] = None

class FunnelStageResponse(FunnelStageBase):
    id: int

    class Config:
        from_attributes = True
