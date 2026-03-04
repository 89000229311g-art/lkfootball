"""
Скрипт для создания тестовых пользователей с простыми паролями
Роли: Руководитель, Администратор, Тренер, Родитель
"""
from sqlalchemy.orm import Session
from app.core.database import SessionLocal
from app.core.security import get_password_hash
from app.models import User, UserRole

def setup_test_users():
    db = SessionLocal()
    try:
        # Список тестовых пользователей
        test_users = [
            {
                "phone": "+373777777",  # Руководитель
                "password": "1",
                "full_name": "Руководитель Академии",
                "role": UserRole.SUPER_ADMIN
            },
            {
                "phone": "+373888888",  # Администратор
                "password": "2",
                "full_name": "Администратор Системы",
                "role": UserRole.ADMIN
            },
            {
                "phone": "+373999999",  # Тренер
                "password": "3",
                "full_name": "Тренер Иванов",
                "role": UserRole.COACH
            },
            {
                "phone": "+373666666",  # Родитель
                "password": "4",
                "full_name": "Родитель Петров",
                "role": UserRole.PARENT
            }
        ]
        
        print("\n" + "="*60)
        print("УСТАНОВКА ТЕСТОВЫХ ПОЛЬЗОВАТЕЛЕЙ")
        print("="*60 + "\n")
        
        for user_data in test_users:
            # Проверяем, существует ли пользователь
            existing_user = db.query(User).filter(User.phone == user_data["phone"]).first()
            
            if existing_user:
                # Обновляем пароль существующего пользователя
                existing_user.password_hash = get_password_hash(user_data["password"])
                existing_user.full_name = user_data["full_name"]
                existing_user.role = user_data["role"]
                db.commit()
                print(f"✅ Обновлен: {user_data['full_name']}")
            else:
                # Создаем нового пользователя
                new_user = User(
                    phone=user_data["phone"],
                    password_hash=get_password_hash(user_data["password"]),
                    full_name=user_data["full_name"],
                    role=user_data["role"]
                )
                db.add(new_user)
                db.commit()
                print(f"✅ Создан: {user_data['full_name']}")
            
            print(f"   📱 Телефон: {user_data['phone']}")
            print(f"   🔑 Пароль: {user_data['password']}")
            print(f"   👤 Роль: {user_data['role'].value}\n")
        
        print("="*60)
        print("ДАННЫЕ ДЛЯ ВХОДА:")
        print("="*60)
        print("\n🔐 ВЕБ-ВЕРСИЯ и МОБИЛЬНОЕ ПРИЛОЖЕНИЕ:\n")
        print("Руководитель:     +373777777 / 1")
        print("Администратор:   +373888888 / 2")
        print("Тренер:          +373999999 / 3")
        print("Родитель:        +373666666 / 4")
        print("\n" + "="*60 + "\n")
        
    except Exception as e:
        print(f"❌ Ошибка: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    setup_test_users()
