"""
Скрипт для ежедневного запуска задач по расписанию
"""
import asyncio
import sys
from pathlib import Path

# Добавляем корневую директорию в путь
sys.path.insert(0, str(Path(__file__).parent))

from app.core.scheduler import start_scheduler


async def main():
    """Главная функция для запуска планировщика"""
    print("🚀 Starting scheduler...")
    
    # Запускаем планировщик (добавляет задачи и стартует)
    start_scheduler()
    print("✅ Scheduler started successfully")
    
    # Держим скрипт запущенным
    while True:
        await asyncio.sleep(60)


if __name__ == "__main__":
    asyncio.run(main())
