from pydantic import BaseModel
from typing import Optional

class SchoolSettingsBase(BaseModel):
    key: str
    value: str
    description: Optional[str] = None
    group: Optional[str] = "general"

class SchoolSettingsCreate(SchoolSettingsBase):
    pass

class SchoolSettingsUpdate(BaseModel):
    value: str
    description: Optional[str] = None

class SchoolSettingsResponse(SchoolSettingsBase):
    pass
