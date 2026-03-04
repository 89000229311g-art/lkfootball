from pydantic import BaseModel
from typing import Optional

class PushKeys(BaseModel):
    p256dh: str
    auth: str

class PushSubscriptionCreate(BaseModel):
    endpoint: str
    keys: PushKeys
    user_agent: Optional[str] = None

class VapidKeysResponse(BaseModel):
    public_key: str
