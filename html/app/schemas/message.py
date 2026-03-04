from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List
from datetime import datetime
from app.models.message import ChatType

class MessageBase(BaseModel):
    content: str = Field(..., min_length=1, max_length=2000)
    recipient_id: Optional[int] = Field(None, description="Recipient user ID for direct messages")
    group_id: Optional[int] = Field(None, description="Group ID for group messages/announcements")
    chat_type: Optional[ChatType] = Field(ChatType.announcement, description="Type: announcement, group_chat, direct")
    is_general: Optional[bool] = Field(False, description="True = general announcement for all")

class MessageCreate(MessageBase):
    group_ids: Optional[List[int]] = Field(None, description="Multiple group IDs for announcements")

class AnnouncementCreate(BaseModel):
    content: str = Field(..., min_length=1, max_length=2000)
    is_general: bool = Field(False, description="True = for all, False = for specific groups")
    group_ids: Optional[List[int]] = Field(None, description="Group IDs if not general")

class MessageResponse(BaseModel):
    id: int
    sender_id: int
    recipient_id: Optional[int]
    group_id: Optional[int]
    chat_type: str
    content: str
    is_general: bool = False
    created_at: datetime
    is_read: bool
    sender_name: Optional[str] = None
    sender_role: Optional[str] = None
    group_name: Optional[str] = None
    is_pinned: bool = False
    poll_id: Optional[int] = None
    model_config = ConfigDict(from_attributes=True)

class BulkSMSRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=500)
    all_students: bool = False
    debtors_only: bool = False
    group_ids: Optional[List[int]] = None
    student_ids: Optional[List[int]] = None

class SMSTemplate(BaseModel):
    id: str
    name: str
    content: str
