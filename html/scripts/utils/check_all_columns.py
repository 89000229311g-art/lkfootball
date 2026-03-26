#!/usr/bin/env python3
"""
Скрипт для проверки соответствия моделей SQLAlchemy и структуры БД PostgreSQL
"""
import sys
sys.path.insert(0, '/app')

from sqlalchemy import inspect, text
from app.core.database import engine, SessionLocal
from app.models import Base
import app.models  # Импортируем все модели

def check_all_tables():
    """Проверяет все таблицы на соответствие моделей и БД"""
    inspector = inspect(engine)
    db_tables = set(inspector.get_table_names())
    
    # Получаем все модели из Base.metadata
    model_tables = set(Base.metadata.tables.keys())
    
    print("=" * 80)
    print("ПРОВЕРКА ТАБЛИЦ: Модели SQLAlchemy vs База данных PostgreSQL")
    print("=" * 80)
    
    # Проверяем отсутствующие таблицы в БД
    missing_in_db = model_tables - db_tables
    if missing_in_db:
        print("\n❌ ТАБЛИЦЫ ОТСУТСТВУЮТ В БАЗЕ ДАННЫХ:")
        for table in sorted(missing_in_db):
            print(f"   - {table}")
    else:
        print("\n✅ Все таблицы из моделей присутствуют в БД")
    
    # Проверяем лишние таблицы в БД
    extra_in_db = db_tables - model_tables
    if extra_in_db:
        print("\n⚠️  ТАБЛИЦЫ ЕСТЬ В БД, НО НЕТ В МОДЕЛЯХ (возможно, устаревшие):")
        for table in sorted(extra_in_db):
            print(f"   - {table}")
    
    # Проверяем колонки для каждой таблицы
    print("\n" + "=" * 80)
    print("ПРОВЕРКА КОЛОНОК ПО ТАБЛИЦАМ")
    print("=" * 80)
    
    issues_found = []
    
    for table_name in sorted(model_tables & db_tables):  # Пересечение - таблицы и в моделях и в БД
        model_table = Base.metadata.tables[table_name]
        model_columns = set(model_table.columns.keys())
        
        db_columns_info = inspector.get_columns(table_name)
        db_columns = set(col['name'] for col in db_columns_info)
        
        missing_columns = model_columns - db_columns
        extra_columns = db_columns - model_columns
        
        if missing_columns or extra_columns:
            print(f"\n📋 Таблица: {table_name}")
            
            if missing_columns:
                print(f"   ❌ Отсутствуют в БД ({len(missing_columns)}):")
                for col in sorted(missing_columns):
                    col_type = model_table.columns[col].type
                    print(f"      - {col} ({col_type})")
                    issues_found.append((table_name, col, 'missing'))
            
            if extra_columns:
                print(f"   ⚠️  Лишние в БД ({len(extra_columns)}):")
                for col in sorted(extra_columns):
                    print(f"      - {col}")
    
    # Итог
    print("\n" + "=" * 80)
    if issues_found:
        print(f"❌ НАЙДЕНО ПРОБЛЕМ: {len(issues_found)} отсутствующих колонок")
        print("\nSQL для исправления:")
        print("-" * 80)
        
        # Группируем по таблицам
        from collections import defaultdict
        table_issues = defaultdict(list)
        for table, col, issue in issues_found:
            if issue == 'missing':
                table_issues[table].append(col)
        
        for table_name, columns in sorted(table_issues.items()):
            model_table = Base.metadata.tables[table_name]
            print(f"\n-- Таблица: {table_name}")
            for col_name in columns:
                col = model_table.columns[col_name]
                col_type = str(col.type)
                nullable = "NULL" if col.nullable else "NOT NULL"
                default = ""
                if col.default is not None and hasattr(col.default, 'arg'):
                    default_val = col.default.arg
                    if isinstance(default_val, str):
                        default = f" DEFAULT '{default_val}'"
                    else:
                        default = f" DEFAULT {default_val}"
                print(f"ALTER TABLE {table_name} ADD COLUMN {col_name} {col_type} {nullable}{default};")
    else:
        print("✅ ВСЕ КОЛОНКИ НА МЕСТЕ!")
        print("Все модели SQLAlchemy соответствуют структуре базы данных.")
    
    print("=" * 80)
    return len(issues_found) == 0

if __name__ == "__main__":
    success = check_all_tables()
    sys.exit(0 if success else 1)
