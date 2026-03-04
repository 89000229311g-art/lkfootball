import asyncio
from app.core.security import get_password_hash
from app.models.user import User, UserRole
from app.core.database import SessionLocal

async def create_users():
    db = SessionLocal()
    
    users_to_create = [
        {
            "role": UserRole.SUPER_ADMIN,
            "phone": "owner",
            "password": "123",
            "full_name": "Owner (Руководитель)"
        },
        {
            "role": UserRole.ADMIN,
            "phone": "admin",
            "password": "123",
            "full_name": "Admin (Администратор)"
        },
        {
            "role": UserRole.COACH,
            "phone": "coach",
            "password": "123",
            "full_name": "Coach (Тренер)"
        },
        {
            "role": UserRole.PARENT,
            "phone": "parent",
            "password": "123",
            "full_name": "Parent (Родитель)"
        }
    ]

    try:
        print("--- Начало создания/обновления пользователей ---")
        for user_data in users_to_create:
            user = db.query(User).filter(User.phone == user_data["phone"]).first()
            
            hashed_pw = get_password_hash(user_data["password"])
            role_value = user_data["role"].value
            
            if user:
                print(f"Обновление пользователя: {user_data['full_name']} ({role_value})")
                user.password_hash = hashed_pw
                user.full_name = user_data["full_name"]
                user.role = role_value
            else:
                print(f"Создание пользователя: {user_data['full_name']} ({role_value})")
                user = User(
                    phone=user_data["phone"],
                    password_hash=hashed_pw,
                    full_name=user_data["full_name"],
                    role=role_value
                )
                db.add(user)
            
        db.commit()
        print("\n" + "="*70)
        print("✅ ВСЕ ПОЛЬЗОВАТЕЛИ УСПЕШНО ОБНОВЛЕНЫ!")
        print("="*70)
        print("\n🔑 ТЕСТОВЫЕ АККАУНТЫ (Логин: Пароль):\n")
        print("-" * 70)
        for u in users_to_create:
            role_emoji = {
                "super_admin": "👔",
                "admin": "🔧",
                "coach": "🏃",
                "parent": "👨‍👩‍👧"
            }.get(u['role'].value, "👤")
            print(f"{role_emoji} {u['role'].value.upper():<12} | Login: {u['phone']:<8} | Password: {u['password']}")
        print("-" * 70)
        print("\n📱 Мобильное приложение: flutter run")
        print("🌐 Веб-приложение: http://localhost:3000")
        print("🚀 Backend API: http://localhost:8000/docs\n")
            
    except Exception as e:
        print(f"Ошибка: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    asyncio.run(create_users())
