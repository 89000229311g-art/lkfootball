from sqlalchemy import create_engine, event
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.pool import QueuePool
from .config import settings
import logging

# Moldova timezone for PostgreSQL
POSTGRES_TIMEZONE = settings.TIMEZONE  # Europe/Chisinau

logger = logging.getLogger(__name__)

# ==================== ENGINE CONFIGURATION ====================

is_sqlite = "sqlite" in settings.SQLALCHEMY_DATABASE_URI

if is_sqlite:
    # SQLite Async
    async_database_url = settings.SQLALCHEMY_DATABASE_URI.replace("sqlite://", "sqlite+aiosqlite://")
    async_engine_args = {
        "echo": False,
        "echo_pool": False,
    }
    # SQLite Sync
    sync_engine_args = {
        "connect_args": {"check_same_thread": False},
        "echo": False,
        "echo_pool": False,
    }
else:
    # PostgreSQL Async
    async_database_url = settings.SQLALCHEMY_DATABASE_URI.replace("postgresql://", "postgresql+asyncpg://")
    async_engine_args = {
        "pool_size": settings.DB_POOL_SIZE,
        "max_overflow": settings.DB_MAX_OVERFLOW,
        "pool_recycle": settings.DB_POOL_RECYCLE,
        "pool_pre_ping": settings.DB_POOL_PRE_PING,
        "pool_timeout": 30,
        "echo": False,
        "echo_pool": False,
    }
    # PostgreSQL Sync
    sync_engine_args = {
        "poolclass": QueuePool,
        "pool_size": settings.DB_POOL_SIZE,
        "max_overflow": settings.DB_MAX_OVERFLOW,
        "pool_recycle": settings.DB_POOL_RECYCLE,
        "pool_pre_ping": settings.DB_POOL_PRE_PING,
        "pool_timeout": 30,
        "echo": False,
        "echo_pool": False,
        "connect_args": {
            "connect_timeout": 10,
            "options": f"-c timezone={POSTGRES_TIMEZONE}"
        }
    }

# ==================== ASYNC ENGINE ====================
async_engine = create_async_engine(
    async_database_url,
    **async_engine_args
)

# Async Session Factory
AsyncSessionLocal = async_sessionmaker(
    async_engine,
    class_=AsyncSession,
    expire_on_commit=False,
)

async def get_async_db() -> AsyncSession:
    """
    Async dependency для получения DB сессии (для новых эндпоинтов).
    Используется в эндпоинтах с высокой нагрузкой.
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()

# ==================== SYNC ENGINE ====================
engine = create_engine(
    settings.SQLALCHEMY_DATABASE_URI,
    **sync_engine_args
)

# Логирование событий пула (опционально для мониторинга)
@event.listens_for(engine, "connect")
def receive_connect(dbapi_conn, connection_record):
    logger.info("New database connection established")

@event.listens_for(engine, "checkout")
def receive_checkout(dbapi_conn, connection_record, connection_proxy):
    # Можно добавить метрики
    pass

# Создание фабрики сессий
SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
    expire_on_commit=False  # Оптимизация: не истекать объекты после commit
)

def get_db() -> Session:
    """
    Dependency function to get database session
    Usage in FastAPI:
        @app.get("/users/")
        def read_users(db: Session = Depends(get_db)):
            ...
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
