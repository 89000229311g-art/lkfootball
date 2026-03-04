"""
Примеры использования SMS и Google Sheets интеграций
Запуск: python examples/integration_examples.py
"""
import asyncio
import sys
import os

# Добавляем путь к проекту
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.core.sms_service import sms_service, SMSTemplates
from app.core.sheets_service import sheets_service


async def example_1_send_payment_notification():
    """Пример 1: Отправка уведомления о платеже"""
    print("\n" + "="*60)
    print("📱 ПРИМЕР 1: Уведомление о платеже")
    print("="*60)
    
    phone = "+37368123456"
    amount = 250.0
    month = "Ianuarie 2026"
    
    # RO версия
    print("\n🇲🇩 Română:")
    message_ro = SMSTemplates.payment_received(amount, month, "ro")
    print(f"   Текст: {message_ro}")
    result = await sms_service.send_sms(phone, message_ro)
    print(f"   Результат: {result}")
    
    # RU версия
    print("\n🇷🇺 Русский:")
    message_ru = SMSTemplates.payment_received(amount, month, "ru")
    print(f"   Текст: {message_ru}")
    result = await sms_service.send_sms(phone, message_ru)
    print(f"   Результат: {result}")


async def example_2_debt_reminder():
    """Пример 2: Напоминание о задолженности"""
    print("\n" + "="*60)
    print("⚠️  ПРИМЕР 2: Напоминание о задолженности")
    print("="*60)
    
    phone = "+37368789012"
    debt = 500.0
    month = "Decembrie 2025"
    
    # RO версия
    print("\n🇲🇩 Română:")
    message_ro = SMSTemplates.debt_reminder(debt, month, "ro")
    print(f"   Текст: {message_ro}")
    result = await sms_service.send_sms(phone, message_ro)
    print(f"   Результат: {result}")


async def example_3_training_reminder():
    """Пример 3: Напоминание о тренировке"""
    print("\n" + "="*60)
    print("⚽ ПРИМЕР 3: Напоминание о тренировке")
    print("="*60)
    
    phone = "+37368345678"
    time = "18:00"
    date = "13.01.2026"
    
    # RU версия
    print("\n🇷🇺 Русский:")
    message_ru = SMSTemplates.training_reminder(time, date, "ru")
    print(f"   Текст: {message_ru}")
    result = await sms_service.send_sms(phone, message_ru)
    print(f"   Результат: {result}")


async def example_4_google_sheets_payment():
    """Пример 4: Синхронизация платежа с Google Sheets"""
    print("\n" + "="*60)
    print("📊 ПРИМЕР 4: Синхронизация платежа с Google Sheets")
    print("="*60)
    
    payment_data = {
        "id": 999,
        "student_id": 1,
        "student_name": "Ivanov Ion",
        "amount": 250.0,
        "payment_date": "2026-01-12",
        "payment_period": "2026-01-01",
        "status": "completed",
        "notes": "Test payment from API"
    }
    
    print(f"\n   Данные платежа: {payment_data}")
    result = await sheets_service.sync_payment(payment_data, "create")
    print(f"   Результат: {result}")
    
    if result.get("success"):
        print("   ✅ Данные успешно добавлены в Google Sheet!")
    elif result.get("reason") == "disabled":
        print("   ℹ️  Google Sheets отключен (установите GOOGLE_SHEETS_ENABLED=true)")
    else:
        print(f"   ❌ Ошибка: {result.get('error')}")


async def example_5_google_sheets_student():
    """Пример 5: Синхронизация студента с Google Sheets"""
    print("\n" + "="*60)
    print("👨‍🎓 ПРИМЕР 5: Синхронизация студента с Google Sheets")
    print("="*60)
    
    student_data = {
        "id": 100,
        "first_name": "Popescu",
        "last_name": "Maria",
        "dob": "2010-05-15",
        "parent_phone": "+37368111222",
        "group_name": "U14 Elite",
        "status": "active"
    }
    
    print(f"\n   Данные студента: {student_data}")
    result = await sheets_service.sync_student(student_data, "create")
    print(f"   Результат: {result}")


async def example_6_batch_notifications():
    """Пример 6: Массовая отправка уведомлений"""
    print("\n" + "="*60)
    print("📨 ПРИМЕР 6: Массовая отправка уведомлений")
    print("="*60)
    
    parents = [
        {"phone": "+37368111111", "name": "Parent 1", "lang": "ro"},
        {"phone": "+37368222222", "name": "Parent 2", "lang": "ru"},
        {"phone": "+37368333333", "name": "Parent 3", "lang": "ro"},
    ]
    
    event_date = "15.01.2026"
    event_time = "17:00"
    
    print(f"\n   Отправка {len(parents)} уведомлений о тренировке...")
    
    tasks = []
    for parent in parents:
        message = SMSTemplates.training_reminder(event_time, event_date, parent["lang"])
        task = sms_service.send_sms(parent["phone"], message)
        tasks.append(task)
    
    # Параллельная отправка
    results = await asyncio.gather(*tasks)
    
    success_count = sum(1 for r in results if r.get("success"))
    print(f"\n   ✅ Успешно отправлено: {success_count}/{len(parents)}")


async def main():
    """Запуск всех примеров"""
    print("\n" + "="*60)
    print("🚀 ПРИМЕРЫ ИНТЕГРАЦИЙ: SMS + GOOGLE SHEETS")
    print("="*60)
    
    print(f"\n   SMS Provider: {sms_service.provider}")
    print(f"   Google Sheets: {'Enabled' if sheets_service.enabled else 'Disabled'}")
    
    try:
        # SMS примеры
        await example_1_send_payment_notification()
        await asyncio.sleep(1)
        
        await example_2_debt_reminder()
        await asyncio.sleep(1)
        
        await example_3_training_reminder()
        await asyncio.sleep(1)
        
        # Google Sheets примеры
        await example_4_google_sheets_payment()
        await asyncio.sleep(1)
        
        await example_5_google_sheets_student()
        await asyncio.sleep(1)
        
        # Batch пример
        await example_6_batch_notifications()
        
        print("\n" + "="*60)
        print("✅ ВСЕ ПРИМЕРЫ ВЫПОЛНЕНЫ!")
        print("="*60 + "\n")
        
    except KeyboardInterrupt:
        print("\n\n⚠️  Прервано пользователем")
    except Exception as e:
        print(f"\n\n❌ Ошибка: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    asyncio.run(main())
