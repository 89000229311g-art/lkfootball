#!/usr/bin/env python3
"""
🏫 Создание полной структуры детской футбольной академии:
- 1 руководитель
- 1 администратор  
- 3 тренера
- 3 группы (по 25 учеников в каждой)
- 75 учеников
- 75 родителей (связанных с учениками)
- Счета за февраль для всех учеников
"""

from sqlalchemy import create_engine, text
from passlib.context import CryptContext
from datetime import date, datetime
import random

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
PASSWORD_HASH = pwd_context.hash("111111")

engine = create_engine("sqlite:///./app.db")

# Имена для генерации
FIRST_NAMES_KIDS = [
    "Артём", "Максим", "Александр", "Михаил", "Даниил", "Дмитрий", "Кирилл", "Андрей",
    "Егор", "Иван", "Никита", "Илья", "Алексей", "Матвей", "Тимофей", "Роман",
    "Владимир", "Ярослав", "Фёдор", "Георгий", "Константин", "Лев", "Николай", "Денис",
    "Сергей", "Павел", "Марк", "Арсений", "Владислав", "Глеб", "Игорь", "Олег",
    "Виктор", "Антон", "Степан", "Богдан", "Вадим", "Григорий", "Платон", "Захар",
    "Савелий", "Тихон", "Демид", "Мирослав", "Давид", "Руслан", "Святослав", "Елисей",
    "Макар", "Семён", "Пётр", "Герман", "Леонид", "Аркадий", "Валерий", "Вячеслав",
    "Борис", "Станислав", "Юрий", "Эдуард", "Анатолий", "Василий", "Геннадий", "Евгений",
    "Кузьма", "Леон", "Мирон", "Прохор", "Радомир", "Ратмир", "Северин", "Тарас",
    "Филипп", "Харитон", "Ян"
]

LAST_NAMES = [
    "Иванов", "Петров", "Сидоров", "Козлов", "Новиков", "Морозов", "Волков", "Соколов",
    "Попов", "Лебедев", "Кузнецов", "Смирнов", "Васильев", "Павлов", "Семёнов", "Голубев",
    "Виноградов", "Богданов", "Воробьёв", "Фёдоров", "Михайлов", "Беляев", "Тарасов", "Белов",
    "Комаров", "Орлов", "Киселёв", "Макаров", "Андреев", "Ковалёв", "Ильин", "Гусев",
    "Титов", "Кузьмин", "Кудрявцев", "Баранов", "Куликов", "Алексеев", "Степанов", "Яковлев",
    "Сорокин", "Сергеев", "Романов", "Захаров", "Борисов", "Королёв", "Герасимов", "Пономарёв",
    "Григорьев", "Лазарев", "Медведев", "Ершов", "Никитин", "Соболев", "Рябов", "Поляков",
    "Цветков", "Данилов", "Жуков", "Фролов", "Журавлёв", "Николаев", "Крылов", "Максимов",
    "Сидоренко", "Осипов", "Белоусов", "Федотов", "Дорофеев", "Егоров", "Матвеев", "Бобров",
    "Дмитриев", "Калинин", "Анисимов", "Петухов", "Антонов", "Тимофеев", "Никифоров", "Веселов"
]

PARENT_FIRST_NAMES_M = ["Александр", "Сергей", "Андрей", "Дмитрий", "Алексей", "Максим", "Евгений", "Владимир", "Николай", "Михаил", "Игорь", "Олег", "Виктор", "Павел", "Роман"]
PARENT_FIRST_NAMES_F = ["Елена", "Ольга", "Наталья", "Анна", "Мария", "Ирина", "Татьяна", "Светлана", "Юлия", "Екатерина", "Марина", "Людмила", "Галина", "Валентина", "Надежда"]

def clear_data():
    """Очистка старых данных"""
    print("🗑️  Очистка старых данных...")
    tables = ['student_guardians', 'payments', 'attendance', 'students', 'events', 'groups', 'users']
    with engine.connect() as conn:
        for table in tables:
            try:
                conn.execute(text(f"DELETE FROM {table}"))
            except:
                pass  # Таблица может не существовать
        conn.commit()
    print("   ✅ Данные очищены")

def create_users():
    """Создание пользователей"""
    print("\n👥 Создание пользователей...")
    users = []
    
    # 1. Руководитель
    users.append({
        'full_name': 'Виктор Александрович Солнцев',
        'phone': '+37360000001',
        'role': 'super_admin'
    })
    
    # 2. Администратор
    users.append({
        'full_name': 'Марина Игоревна Светлова',
        'phone': '+37360000002',
        'role': 'admin'
    })
    
    # 3. Тренеры (3 штуки)
    coaches_data = [
        ('Алексей Петрович Орлов', '+37361000001'),
        ('Михаил Сергеевич Соколов', '+37361000002'),
        ('Дмитрий Андреевич Волков', '+37361000003'),
    ]
    for name, phone in coaches_data:
        users.append({
            'full_name': name,
            'phone': phone,
            'role': 'coach'
        })
    
    # 4. Родители (75 штук)
    used_names = set()
    for i in range(75):
        # Чередуем мужские и женские имена
        if i % 2 == 0:
            first_name = random.choice(PARENT_FIRST_NAMES_F)
            patronymic = random.choice(['Александровна', 'Сергеевна', 'Ивановна', 'Петровна', 'Михайловна'])
        else:
            first_name = random.choice(PARENT_FIRST_NAMES_M)
            patronymic = random.choice(['Александрович', 'Сергеевич', 'Иванович', 'Петрович', 'Михайлович'])
        
        last_name = random.choice(LAST_NAMES)
        # Женская фамилия
        if i % 2 == 0 and not last_name.endswith('о'):
            last_name = last_name + 'а' if not last_name.endswith('а') else last_name
        
        full_name = f"{last_name} {first_name} {patronymic}"
        
        # Уникальность
        while full_name in used_names:
            last_name = random.choice(LAST_NAMES)
            if i % 2 == 0 and not last_name.endswith('о'):
                last_name = last_name + 'а' if not last_name.endswith('а') else last_name
            full_name = f"{last_name} {first_name} {patronymic}"
        
        used_names.add(full_name)
        
        users.append({
            'full_name': full_name,
            'phone': f'+37376{str(i+1).zfill(6)}',
            'role': 'parent'
        })
    
    # Вставка в БД
    with engine.connect() as conn:
        for u in users:
            conn.execute(text("""
                INSERT INTO users (full_name, phone, role, password_hash, created_at, is_active, preferred_language, can_view_history)
                VALUES (:full_name, :phone, :role, :password_hash, :created_at, 1, 'ru', 0)
            """), {
                'full_name': u['full_name'],
                'phone': u['phone'],
                'role': u['role'],
                'password_hash': PASSWORD_HASH,
                'created_at': datetime.now()
            })
        conn.commit()
        
        # Получаем ID созданных пользователей
        result = conn.execute(text("SELECT id, full_name, phone, role FROM users ORDER BY id"))
        all_users = result.fetchall()
    
    print(f"   ✅ Создано пользователей: {len(all_users)}")
    return all_users

def create_groups_and_assign_coaches(users):
    """Создание групп и назначение тренеров"""
    print("\n📋 Создание групп...")
    
    coaches = [u for u in users if u[3] == 'coach']
    
    groups_data = [
        ('U-8 Младшая группа', '2017-2018', coaches[0][0], 1200),
        ('U-10 Средняя группа', '2015-2016', coaches[1][0], 1400),
        ('U-12 Старшая группа', '2013-2014', coaches[2][0], 1600),
    ]
    
    with engine.connect() as conn:
        for name, age_group, coach_id, fee in groups_data:
            conn.execute(text("""
                INSERT INTO groups (name, age_group, coach_id, monthly_fee, subscription_type, classes_per_month)
                VALUES (:name, :age_group, :coach_id, :monthly_fee, :subscription_type, :classes_per_month)
            """), {
                'name': name,
                'age_group': age_group,
                'coach_id': coach_id,
                'monthly_fee': fee,
                'subscription_type': 'by_calendar',
                'classes_per_month': 12
            })
        conn.commit()
        
        result = conn.execute(text("SELECT id, name, coach_id, monthly_fee FROM groups ORDER BY id"))
        all_groups = result.fetchall()
    
    print(f"   ✅ Создано групп: {len(all_groups)}")
    for g in all_groups:
        coach_name = next((u[1] for u in coaches if u[0] == g[2]), 'N/A')
        print(f"      - {g[1]} | Тренер: {coach_name} | {g[3]} MDL/мес")
    
    return all_groups

def create_students_and_link_parents(users, groups):
    """Создание учеников и привязка родителей"""
    print("\n👦 Создание учеников...")
    
    parents = [u for u in users if u[3] == 'parent']
    
    students_created = []
    used_names = set()
    
    with engine.connect() as conn:
        parent_idx = 0
        
        for group in groups:
            group_id = group[0]
            group_name = group[1]
            
            # Определяем год рождения по группе
            if 'U-8' in group_name:
                birth_years = [2017, 2018]
            elif 'U-10' in group_name:
                birth_years = [2015, 2016]
            else:
                birth_years = [2013, 2014]
            
            print(f"\n   📁 Группа: {group_name}")
            
            for i in range(25):
                # Генерируем уникальное имя
                first_name = random.choice(FIRST_NAMES_KIDS)
                last_name = random.choice(LAST_NAMES)
                full_name = f"{first_name} {last_name}"
                
                while full_name in used_names:
                    first_name = random.choice(FIRST_NAMES_KIDS)
                    last_name = random.choice(LAST_NAMES)
                    full_name = f"{first_name} {last_name}"
                
                used_names.add(full_name)
                
                # Дата рождения
                birth_year = random.choice(birth_years)
                birth_month = random.randint(1, 12)
                birth_day = random.randint(1, 28)
                dob = date(birth_year, birth_month, birth_day)
                
                # Родитель
                parent = parents[parent_idx]
                parent_idx += 1
                
                # Вставляем ученика
                result = conn.execute(text("""
                    INSERT INTO students (first_name, last_name, dob, group_id, status, parent_phone, created_at)
                    VALUES (:first_name, :last_name, :dob, :group_id, :status, :parent_phone, :created_at)
                """), {
                    'first_name': first_name,
                    'last_name': last_name,
                    'dob': dob,
                    'group_id': group_id,
                    'status': 'active',
                    'parent_phone': parent[2],
                    'created_at': datetime.now()
                })
                
                # Получаем ID ученика
                student_id = conn.execute(text("SELECT last_insert_rowid()")).fetchone()[0]
                
                # Связываем ученика с родителем
                conn.execute(text("""
                    INSERT INTO student_guardians (student_id, user_id, relationship_type, created_at)
                    VALUES (:student_id, :user_id, :relationship_type, :created_at)
                """), {
                    'student_id': student_id,
                    'user_id': parent[0],
                    'relationship_type': 'parent',
                    'created_at': datetime.now()
                })
                
                students_created.append({
                    'id': student_id,
                    'name': full_name,
                    'group_id': group_id,
                    'parent_id': parent[0],
                    'parent_name': parent[1]
                })
            
            print(f"      ✅ Добавлено 25 учеников с родителями")
        
        conn.commit()
    
    print(f"\n   ✅ Всего создано учеников: {len(students_created)}")
    return students_created

def create_february_invoices(students, groups):
    """Создание счетов за февраль"""
    print("\n💰 Создание счетов за февраль 2026...")
    
    # Создаём словарь группа -> стоимость
    group_fees = {g[0]: g[3] for g in groups}
    
    with engine.connect() as conn:
        for student in students:
            group_id = student['group_id']
            amount = group_fees.get(group_id, 1200)
            
            conn.execute(text("""
                INSERT INTO payments (student_id, amount, payment_period, status, created_at)
                VALUES (:student_id, :amount, :payment_period, :status, :created_at)
            """), {
                'student_id': student['id'],
                'amount': amount,
                'payment_period': '2026-02-01',
                'status': 'pending',
                'created_at': datetime.now()
            })
        
        conn.commit()
        
        # Подсчёт
        result = conn.execute(text("""
            SELECT COUNT(*), SUM(amount) FROM payments WHERE payment_period = '2026-02'
        """)).fetchone()
    
    print(f"   ✅ Выставлено счетов: {result[0]}")
    print(f"   💵 На общую сумму: {result[1]} MDL")

def print_summary(users, groups, students):
    """Итоговая сводка"""
    print("\n" + "=" * 70)
    print("📊 ИТОГОВАЯ СТРУКТУРА АКАДЕМИИ")
    print("=" * 70)
    
    # Руководство
    admins = [u for u in users if u[3] in ['super_admin', 'admin']]
    coaches = [u for u in users if u[3] == 'coach']
    parents = [u for u in users if u[3] == 'parent']
    
    print("\n👑 РУКОВОДСТВО:")
    for u in admins:
        role_name = "Руководитель" if u[3] == 'super_admin' else "Администратор"
        print(f"   {role_name}: {u[1]} | Тел: {u[2]}")
    
    print("\n🏃 ТРЕНЕРЫ:")
    for coach in coaches:
        # Находим группу тренера
        coach_group = next((g for g in groups if g[2] == coach[0]), None)
        group_name = coach_group[1] if coach_group else "Без группы"
        students_count = len([s for s in students if s['group_id'] == coach_group[0]]) if coach_group else 0
        print(f"   {coach[1]} | {group_name} | {students_count} учеников | Тел: {coach[2]}")
    
    print("\n📋 ГРУППЫ:")
    for g in groups:
        coach = next((c for c in coaches if c[0] == g[2]), None)
        coach_name = coach[1] if coach else "Не назначен"
        students_count = len([s for s in students if s['group_id'] == g[0]])
        print(f"   {g[1]} | Тренер: {coach_name} | Учеников: {students_count} | {g[3]} MDL/мес")
    
    print("\n👨‍👩‍👧 РОДИТЕЛИ: " + str(len(parents)) + " человек")
    print("👦 УЧЕНИКИ: " + str(len(students)) + " человек")
    print("🔗 СВЯЗИ ученик-родитель: " + str(len(students)) + " связей")
    
    print("\n" + "=" * 70)
    print("🔑 ДАННЫЕ ДЛЯ ВХОДА (пароль для всех: 111111)")
    print("=" * 70)
    print(f"\n👑 Руководитель: {admins[0][2]}")
    print(f"🔧 Администратор: {admins[1][2]}")
    print(f"\n🏃 Тренеры:")
    for c in coaches:
        print(f"   {c[1]}: {c[2]}")
    print(f"\n👨‍👩‍👧 Родители (первые 5):")
    for p in parents[:5]:
        print(f"   {p[1]}: {p[2]}")
    print(f"   ... и ещё {len(parents)-5} родителей")
    
    print("\n" + "=" * 70)
    print("✅ ГОТОВО! Откройте http://localhost:3000/ для тестирования")
    print("=" * 70)

def main():
    print("🏫 СОЗДАНИЕ СТРУКТУРЫ ДЕТСКОЙ ФУТБОЛЬНОЙ АКАДЕМИИ")
    print("=" * 70)
    
    # 1. Очистка
    clear_data()
    
    # 2. Пользователи
    users = create_users()
    
    # 3. Группы
    groups = create_groups_and_assign_coaches(users)
    
    # 4. Ученики + родители
    students = create_students_and_link_parents(users, groups)
    
    # 5. Счета за февраль
    create_february_invoices(students, groups)
    
    # 6. Итог
    print_summary(users, groups, students)

if __name__ == '__main__':
    main()
