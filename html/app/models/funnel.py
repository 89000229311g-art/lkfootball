from sqlalchemy import Column, Integer, String, Boolean
from .base import Base

class FunnelStage(Base):
    __tablename__ = "funnel_stages"

    id = Column(Integer, primary_key=True, index=True)
    key = Column(String, unique=True, index=True, nullable=False)
    title = Column(String, nullable=False)
    color = Column(String, default="bg-gray-500")
    order = Column(Integer, default=0)
    is_system = Column(Boolean, default=False)
