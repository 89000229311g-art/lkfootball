from typing import Generator, Optional, AsyncGenerator
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import jwt
from sqlalchemy.orm import Session
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from .database import SessionLocal, AsyncSessionLocal, get_async_db
from .security import ALGORITHM, verify_token
from app.models import User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/v1/auth/login")

# ==================== SYNC VERSION (legacy) ====================
def get_db() -> Generator:
    """Dependency for getting database session (sync - for old endpoints)."""
    try:
        db = SessionLocal()
        yield db
    finally:
        db.close()

async def get_current_user(
    db: Session = Depends(get_db),
    token: str = Depends(oauth2_scheme)
) -> User:
    """Dependency for getting current authenticated user (sync version)."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    payload = verify_token(token)
    if payload is None:
        raise credentials_exception
    
    phone: str = payload.get("sub")
    if phone is None:
        raise credentials_exception
    
    user = db.query(User).filter(User.phone == phone).first()
    if user is None:
        raise credentials_exception
    
    # Check if user is active/not deleted
    if not user.is_active or user.deleted_at is not None:
         raise credentials_exception
    
    return user

# ==================== ASYNC VERSION (optimized for 1000+ users) ====================
async def get_current_user_async(
    db: AsyncSession = Depends(get_async_db),
    token: str = Depends(oauth2_scheme)
) -> User:
    """
    Async dependency для получения текущего пользователя.
    Оптимизировано для высокой нагрузки.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    payload = verify_token(token)
    if payload is None:
        raise credentials_exception
    
    phone: str = payload.get("sub")
    if phone is None:
        raise credentials_exception
    
    # ASYNC QUERY
    result = await db.execute(select(User).filter(User.phone == phone))
    user = result.scalar_one_or_none()
    
    if user is None:
        raise credentials_exception
        
    # Check if user is active/not deleted
    if not user.is_active or user.deleted_at is not None:
         raise credentials_exception
    
    return user

async def get_current_active_superuser(
    current_user: User = Depends(get_current_user),
) -> User:
    """Dependency for getting current superuser."""
    if current_user.role != "super_admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="The user doesn't have enough privileges"
        )
    return current_user