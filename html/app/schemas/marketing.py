from pydantic import BaseModel, ConfigDict
from typing import Optional

class MarketingCampaignBase(BaseModel):
    name: str
    status: str = "planning"
    budget: float = 0.0
    spend: float = 0.0
    leads: int = 0
    paying_students: int = 0
    revenue: float = 0.0
    source: Optional[str] = None

class MarketingCampaignCreate(MarketingCampaignBase):
    pass

class MarketingCampaignUpdate(BaseModel):
    name: Optional[str] = None
    status: Optional[str] = None
    budget: Optional[float] = None
    spend: Optional[float] = None
    leads: Optional[int] = None
    paying_students: Optional[int] = None
    revenue: Optional[float] = None
    source: Optional[str] = None

class MarketingCampaignResponse(MarketingCampaignBase):
    id: int
    total_spend: float = 0.0

    model_config = ConfigDict(from_attributes=True)
