from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import field_validator, ValidationError
import os
from typing import List, Union, Optional
from pathlib import Path
import secrets

class Settings(BaseSettings):
    # Base
    PROJECT_NAME: str = "Sunny Football Academy"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api/v1"
    
    # Timezone - Moldova (Europe/Chisinau)
    TIMEZONE: str = "Europe/Chisinau"
    
    # Database - PostgreSQL (Production-ready)
    POSTGRES_SERVER: str = "localhost"
    POSTGRES_USER: str = "macbook"
    POSTGRES_PASSWORD: str = ""
    POSTGRES_DB: str = "football_academy"
    POSTGRES_PORT: str = "5432"
    
    # Connection Pool Settings (для 1000+ пользователей)
    DB_POOL_SIZE: int = 50  # Базовый размер пула (увеличено для 500+ одновременных)
    DB_MAX_OVERFLOW: int = 50  # Дополнительные соединения при пиковой нагрузке
    DB_POOL_RECYCLE: int = 3600  # Переиспользование соединений (1 час)
    DB_POOL_PRE_PING: bool = True  # Проверка соединения перед использованием
    
    # Database URL override
    DATABASE_URL: Optional[str] = None

    @property
    def SQLALCHEMY_DATABASE_URI(self) -> str:
        """Построение PostgreSQL URI из компонентов или использование переопределения"""
        if self.DATABASE_URL:
            return self.DATABASE_URL
        return f"postgresql://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}@{self.POSTGRES_SERVER}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"

    # JWT - SECURITY: Must be set in .env file!
    SECRET_KEY: str
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 8  # 8 days
    
    @field_validator("SECRET_KEY", mode="before")
    @classmethod
    def validate_secret_key(cls, v: Optional[str]) -> str:
        if not v:
            raise ValueError(
                "SECRET_KEY must be set in .env file! "
                "Generate one with: python -c 'import secrets; print(secrets.token_urlsafe(32))'"
            )
        if len(v) < 32:
            raise ValueError("SECRET_KEY must be at least 32 characters long for security")
        if v in ["your-super-secret-key-for-jwt-tokens-CHANGE-IN-PRODUCTION", "changeme", "secret"]:
            raise ValueError(
                "SECRET_KEY cannot use default/weak value! "
                "Generate a strong key: python -c 'import secrets; print(secrets.token_urlsafe(32))'"
            )
        return v
    
    # CORS - Security: Do NOT use "*" in production!
    # Store as string, parse to list via property
    BACKEND_CORS_ORIGINS: str = "http://localhost:3000,http://localhost:3001,http://localhost:3002,http://localhost:3003,http://localhost:8000,http://localhost:8001,http://localhost:8080,http://192.168.0.13:8080"
    
    @property
    def BACKEND_CORS_ORIGINS_LIST(self) -> List[str]:
        """Parse CORS origins from comma-separated string to list"""
        origins = self.BACKEND_CORS_ORIGINS
        if origins.startswith("[") and origins.endswith("]"):
            try:
                import json
                return json.loads(origins)
            except json.JSONDecodeError:
                pass
        return [i.strip() for i in origins.split(",") if i.strip()]
    
    # Data Retention Settings
    AUDIT_LOG_RETENTION_DAYS: int = 180  # 6 months
    NOTIFICATION_RETENTION_DAYS: int = 30  # 30 days
    
    # Messenger Integration
    TELEGRAM_BOT_TOKEN: Optional[str] = None
    
    @field_validator("BACKEND_CORS_ORIGINS", mode="after")
    @classmethod
    def validate_cors_origins(cls, v: str) -> str:
        # Parse to check for wildcard
        origins = [i.strip() for i in v.split(",") if i.strip()]
        if "*" in origins:
            # Allow in development only
            is_production = os.getenv("ENVIRONMENT", "development") == "production"
            if is_production:
                raise ValueError(
                    "CORS wildcard '*' is NOT allowed in production! "
                    "Please specify exact origins in BACKEND_CORS_ORIGINS"
                )
            print("⚠️  WARNING: CORS wildcard '*' detected. This is ONLY for development!")
        return v

    model_config = SettingsConfigDict(
        case_sensitive=True,
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

settings = Settings()
