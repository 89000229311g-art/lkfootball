#!/usr/bin/env python3
"""
🔄 ПОЛНЫЙ СБРОС ДАННЫХ ПРОЕКТА
Удаляет всех пользователей, учеников, группы, события и т.д.
Оставляет только одного super_admin для входа
"""

from app.core.database import SessionLocal
from app.core.security import get_password_hash
from sqlalchemy import text

def reset_all_data():
    db = SessionLocal()
    
    print("=" * 60)
    print("🔄 НАЧАЛО ПОЛНОГО СБРОСА ДАННЫХ")
    print("=" * 60)
    
    try:
        # Порядок удаления важен из-за foreign keys
        tables_to_clear = [
            # Сначала зависимые таблицы
            "poll_votes",
            "polls", 
            "post_reactions",
            "posts",
            "announcement_reads",
            "payment_reminders",
            "coach_recommendations",
            "trial_sessions",
            "expenses",
            "expense_categories",
            "absence_requests",
            "student_photos",
            "achievements",
            "student_skills",
            "student_group_history",
            "attendances",
            "training_plans",
            "media_reports",
            "generated_events",
            "schedule_templates",
            "payments",
            "messages",
            "student_guardians",
            "students",
            "events",
            "groups",
            "user_credentials",
            "users",
        ]
        
        # Удаляем данные из каждой таблицы (по одной с коммитом)
        for table in tables_to_clear:
            try:
                result = db.execute(text(f"DELETE FROM {table}"))
                db.commit()  # Коммит после каждой таблицы
                count = result.rowcount
                if count > 0:
                    print(f"✅ {table}: удалено {count} записей")
                else:
                    print(f"⬚ {table}: пусто")
            except Exception as e:
                db.rollback()  # Откат при ошибке
                if "does not exist" in str(e):
                    print(f"⚠️ {table}: таблица не существует (пропускаем)")
                else:
                    print(f"⚠️ {table}: ошибка (пропускаем)")
        
        print("\n" + "=" * 60)
        print("✅ ВСЕ ДАННЫЕ УДАЛЕНЫ")
        print("=" * 60)
        
        # Создаём одного super_admin для входа
        print("\n🔐 Создание администратора для входа...")
        
        from app.models import User
        
        admin = User(
            phone="+37360000001",
            password_hash=get_password_hash("admin123"),
            full_name="Администратор",
            role="super_admin"
        )
        db.add(admin)
        db.commit()
        
        print("\n" + "=" * 60)
        print("✅ АДМИНИСТРАТОР СОЗДАН")
        print("=" * 60)
        print(f"📱 Телефон: +37360000001")
        print(f"🔑 Пароль: admin123")
        print(f"👤 Роль: super_admin")
        print("=" * 60)
        
        # Сброс sequences (автоинкремент)
        sequences = [
            ("users", "id"),
            ("groups", "id"),
            ("students", "id"),
            ("events", "id"),
            ("payments", "id"),
            ("attendances", "id"),
            ("messages", "id"),
        ]
        
        print("\n🔢 Сброс счётчиков ID...")
        for table, column in sequences:
            try:
                # Для PostgreSQL
                db.execute(text(f"SELECT setval(pg_get_serial_sequence('{table}', '{column}'), COALESCE((SELECT MAX({column}) FROM {table}), 1), true)"))
            except Exception as e:
                pass  # Игнорируем ошибки sequences
        
        db.commit()
        
        print("\n" + "=" * 60)
        print("🎉 ПРОЕКТ ГОТОВ К ТЕСТИРОВАНИЮ С НУЛЯ!")
        print("=" * 60)
        print("\nТеперь вы можете:")
        print("1. Войти как администратор (+37360000001 / admin123)")
        print("2. Создавать новых тренеров, родителей, группы")
        print("3. Добавлять учеников и события")
        print("4. Тестировать все функции с чистого листа")
        print("=" * 60)
        
    except Exception as e:
        db.rollback()
        print(f"❌ ОШИБКА: {e}")
        raise
    finally:
        db.close()

if __name__ == "__main__":
    # Подтверждение
    print("\n⚠️  ВНИМАНИЕ! Это действие удалит ВСЕ данные:")
    print("   - Всех пользователей (тренеры, родители, админы)")
    print("   - Всех учеников")
    print("   - Все группы")
    print("   - Все события и расписание")
    print("   - Все платежи")
    print("   - Все посещения")
    print("   - Все сообщения")
    print()
    
    confirm = input("Введите 'ДА' для подтверждения: ")
    
    if confirm.upper() in ['ДА', 'DA', 'YES']:
        reset_all_data()
    else:
        print("❌ Операция отменена")
