import asyncio
from sqlalchemy.orm import Session
from app.core.config import settings
from app.core.security import get_password_hash
from app.models import User, UserRole
from app.core.database import SessionLocal

async def create_first_superuser() -> None:
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.role == UserRole.SUPER_ADMIN).first()
        if not user:
            user = User(
                phone="+79777086823",  # Руководитель Sunny
                password_hash=get_password_hash("79777086823"),
                full_name="Руководитель Sunny",
                role=UserRole.SUPER_ADMIN
            )
            db.add(user)
            db.commit()
            print("Superuser created successfully!")
        else:
            print("Superuser already exists.")
    finally:
        db.close()

if __name__ == "__main__":
    asyncio.run(create_first_superuser())