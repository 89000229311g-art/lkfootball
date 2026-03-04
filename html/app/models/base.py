from typing import Any
from sqlalchemy.ext.declarative import as_declarative, declared_attr
from sqlalchemy import Column, Integer, DateTime

# Use Moldova timezone for all timestamps
from app.core.timezone import now_naive


@as_declarative()
class Base:
    __allow_unmapped__ = True
    __name__: str

    # Generate tablename automatically
    @declared_attr
    def __tablename__(cls) -> str:
        return cls.__name__.lower()

    # Common columns for all tables (Moldova timezone)
    id = Column(Integer, primary_key=True, index=True)
    created_at = Column(DateTime, default=now_naive)
    updated_at = Column(DateTime, default=now_naive, onupdate=now_naive)