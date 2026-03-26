"""
Audit Log model for tracking all changes in the system.
Provides version history and undo functionality.
"""
from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, JSON
from sqlalchemy.dialects.postgresql import ARRAY as PG_ARRAY
from sqlalchemy.orm import relationship

from app.models.base import Base
from app.core.timezone import now_naive


class AuditLog(Base):
    """
    Stores all changes to entities for version history and undo functionality.
    
    Actions:
    - create: New entity created
    - update: Entity modified
    - delete: Entity soft-deleted (moved to trash)
    - restore: Entity restored from trash
    - permanent_delete: Entity permanently deleted
    """
    __tablename__ = "audit_log"
    
    id = Column(Integer, primary_key=True, index=True)
    
    # What was changed
    entity_type = Column(String(50), nullable=False, index=True)  # group, student, payment, etc.
    entity_id = Column(Integer, nullable=False)
    entity_name = Column(String(255), nullable=True)  # Readable name for display
    
    # Type of change
    action = Column(String(20), nullable=False, index=True)  # create, update, delete, restore
    
    # Data snapshots
    old_data = Column(JSON, nullable=True)  # State before change (null for create)
    new_data = Column(JSON, nullable=True)  # State after change (null for delete)
    changed_fields = Column(PG_ARRAY(String).with_variant(JSON(), "sqlite"), nullable=True)  # List of fields that changed
    
    # Who made the change
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    user_name = Column(String(255), nullable=True)  # Cached for display even if user deleted
    
    # Additional info
    reason = Column(String(500), nullable=True)  # Optional reason for change
    ip_address = Column(String(50), nullable=True)  # For security audit
    
    # Timestamp
    created_at = Column(DateTime, default=now_naive, nullable=False, index=True)
    
    # Relationships
    user = relationship("User", foreign_keys=[user_id])
    
    # Entity type constants
    ENTITY_GROUP = "group"
    ENTITY_STUDENT = "student"
    ENTITY_USER = "user"
    ENTITY_PAYMENT = "payment"
    ENTITY_EVENT = "event"
    ENTITY_SCHEDULE = "schedule_template"
    ENTITY_ATTENDANCE = "attendance"
    ENTITY_CONTRACT = "employee_contract"
    ENTITY_SALARY = "salary_payment"
    ENTITY_MESSAGE = "message"
    
    # Action type constants
    ACTION_CREATE = "create"
    ACTION_UPDATE = "update"
    ACTION_DELETE = "delete"
    ACTION_RESTORE = "restore"
    ACTION_PERMANENT_DELETE = "permanent_delete"
    
    # Entity type labels (Russian)
    ENTITY_LABELS = {
        "group": "Группа",
        "student": "Ученик",
        "user": "Пользователь",
        "payment": "Платёж",
        "event": "Событие",
        "schedule_template": "Расписание",
        "attendance": "Посещаемость",
        "employee_contract": "Контракт",
        "salary_payment": "Зарплата",
        "message": "Сообщение",
    }
    
    # Action labels (Russian)
    ACTION_LABELS = {
        "create": "Создание",
        "update": "Изменение",
        "delete": "Удаление",
        "restore": "Восстановление",
        "permanent_delete": "Полное удаление",
    }
    
    def to_dict(self):
        """Convert to dictionary for API response"""
        return {
            "id": self.id,
            "entity_type": self.entity_type,
            "entity_type_label": self.ENTITY_LABELS.get(self.entity_type, self.entity_type),
            "entity_id": self.entity_id,
            "entity_name": self.entity_name,
            "action": self.action,
            "action_label": self.ACTION_LABELS.get(self.action, self.action),
            "old_data": self.old_data,
            "new_data": self.new_data,
            "changed_fields": self.changed_fields,
            "user_id": self.user_id,
            "user_name": self.user_name,
            "reason": self.reason,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
