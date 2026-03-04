from typing import Optional
from pydantic import BaseModel


class HRFunnelStageBase(BaseModel):
    key: str
    title: str
    color: Optional[str] = "bg-gray-500"
    order: Optional[int] = 0


class HRFunnelStageCreate(HRFunnelStageBase):
    pass


class HRFunnelStageUpdate(BaseModel):
    title: Optional[str] = None
    color: Optional[str] = None
    order: Optional[int] = None


class HRFunnelStageResponse(HRFunnelStageBase):
    id: int
    is_system: bool

    class Config:
        from_attributes = True

