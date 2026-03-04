"""
Credential model for storing user credentials.
Passwords are stored ENCRYPTED using AES-256-GCM.

Access: Only for super_admin and admin.
IMPORTANT: Set CREDENTIALS_ENCRYPTION_KEY in .env for encryption to work.
"""
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.models.base import Base


class UserCredential(Base):
    """
    🔐 Хранение учетных данных пользователей.
    
    Эта таблица хранит логин/пароль каждого пользователя для возможности
    просмотра администраторами и руководителями.
    
    БЕЗОПАСНОСТЬ:
    - Пароли хранятся в зашифрованном виде (AES-256-GCM)
    - Ключ шифрования хранится отдельно в .env
    - Логируется каждый просмотр пароля
    
    Доступ:
    - 🏆 Руководитель (super_admin) - может просматривать ВСЕ учетные данные
    - 🛡️ Администратор (admin) - может просматривать данные coach и parent
    """
    __tablename__ = "user_credentials"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False)
    
    # Логин (телефон) - дублируется для удобства
    login = Column(String(50), nullable=False)
    
    # 🔐 Пароль в ЗАШИФРОВАННОМ виде (AES-256-GCM)
    # При чтении автоматически расшифровывается через property
    password_encrypted = Column(String(500), nullable=False)
    
    # Метаданные создания
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    created_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    updated_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    
    # 📊 Аудит просмотров
    last_viewed_at = Column(DateTime(timezone=True), nullable=True)
    last_viewed_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    view_count = Column(Integer, default=0)  # Сколько раз просматривали
    
    # Заметка (опционально)
    note = Column(Text, nullable=True)
    
    # Relationships
    user = relationship("User", foreign_keys=[user_id], backref="credential")
    created_by = relationship("User", foreign_keys=[created_by_id])
    updated_by = relationship("User", foreign_keys=[updated_by_id])
    last_viewed_by = relationship("User", foreign_keys=[last_viewed_by_id])
    
    @property
    def password_plain(self) -> str:
        """
        🔓 Расшифровывает пароль для отображения.
        Обратная совместимость со старым кодом.
        """
        from app.core.encryption import decrypt_password
        if self.password_encrypted:
            return decrypt_password(self.password_encrypted)
        return ""
    
    @password_plain.setter
    def password_plain(self, value: str):
        """
        🔐 Шифрует пароль при установке.
        Обратная совместимость со старым кодом.
        """
        from app.core.encryption import encrypt_password
        self.password_encrypted = encrypt_password(value)
    
    def record_view(self, viewer_id: int):
        """
        📊 Записывает факт просмотра пароля.
        Вызывается при каждом чтении пароля администратором.
        """
        from datetime import datetime, timezone
        self.last_viewed_at = datetime.now(timezone.utc)
        self.last_viewed_by_id = viewer_id
        self.view_count = (self.view_count or 0) + 1
    
    def __repr__(self):
        return f"<UserCredential(user_id={self.user_id}, login={self.login})>"
