from sqlalchemy import Column, Integer, String, Boolean, ForeignKey
from .base import Base


class HRFunnelStage(Base):
    __tablename__ = "hr_funnel_stages"

    id = Column(Integer, primary_key=True, index=True)
    academy_id = Column(Integer, ForeignKey("academies.id", ondelete="CASCADE"), nullable=True, index=True)
    key = Column(String, index=True, nullable=False)
    title = Column(String, nullable=False)
    color = Column(String, default="bg-gray-500")
    order = Column(Integer, default=0)
    is_system = Column(Boolean, default=False)

