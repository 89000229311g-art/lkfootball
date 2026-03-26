#!/usr/bin/env python3
"""
🎯 Генерация тестовых данных: 500 родителей + ученики + 10 тренеров
Для комплексного тестирования системы
"""

import random
from datetime import date, timedelta
from app.core.database import SessionLocal
from app.core.security import get_password_hash
from app.models import User, Student, Group, StudentGuardian, Payment, Attendance, Event

# Имена для генерации
FIRST_NAMES_MALE = [
    "Александр", "Михаил", "Максим", "Артём", "Даниил", "Иван", "Дмитрий", 
    "Кирилл", "Андрей", "Егор", "Никита", "Илья", "Алексей", "Матвей", "Тимофей",
    "Роман", "Владимир", "Ярослав", "Фёдор", "Георгий", "Константин", "Лев",
    "Николай", "Степан", "Марк", "Павел", "Арсений", "Денис", "Тимур", "Владислав"
]

FIRST_NAMES_FEMALE = [
    "Анна", "Мария", "Елена", "Ольга", "Наталья", "Ирина", "Татьяна", "Светлана",
    "Екатерина", "Юлия", "Анастасия", "Виктория", "Дарья", "Полина", "Алиса",
    "Ксения", "Валерия", "София", "Вероника", "Александра", "Кристина", "Марина"
]

LAST_NAMES = [
    "Иванов", "Петров", "Сидоров", "Козлов", "Новиков", "Морозов", "Волков",
    "Соловьёв", "Васильев", "Зайцев", "Павлов", "Семёнов", "Голубев", "Виноградов",
    "Богданов", "Воробьёв", "Фёдоров", "Михайлов", "Беляев", "Тарасов", "Белов",
    "Комаров", "Орлов", "Киселёв", "Макаров", "Андреев", "Ковалёв", "Ильин",
    "Гусев", "Титов", "Кузьмин", "Кудрявцев", "Баранов", "Куликов", "Алексеев",
    "Степанов", "Яковлев", "Сорокин", "Сергеев", "Романов", "Захаров", "Борисов"
]

COACH_SPECIALIZATIONS = [
    "Вратарь", "Защита", "Полузащита", "Нападение", "Физподготовка",
    "Техника", "Тактика", "Юниоры U-8", "Юниоры U-10", "Юниоры U-12"
]


def generate_phone():
    """Генерация уникального номера телефона"""
    return f"+373{random.randint(60000000, 69999999)}"


def generate_email(first_name, last_name, index):
    """Генерация email"""
    domains = ["gmail.com", "mail.ru", "yandex.ru", "outlook.com"]
    return f"{first_name.lower()}.{last_name.lower()}{index}@{random.choice(domains)}"


def create_coaches(db, count=10):
    """Создание тренеров"""
    print(f"\n👨‍🏫 Создание {count} тренеров...")
    coaches = []
    
    for i in range(count):
        first_name = random.choice(FIRST_NAMES_MALE)
        last_name = random.choice(LAST_NAMES)
        phone = generate_phone()
        
        # Проверяем уникальность телефона
        existing = db.query(User).filter(User.phone == phone).first()
        if existing:
            continue
        
        coach = User(
            phone=phone,
            password_hash=get_password_hash("coach123"),
            full_name=f"{first_name} {last_name}",
            role="coach"
        )
        db.add(coach)
        coaches.append(coach)
        
        if (i + 1) % 5 == 0:
            print(f"   ✅ Создано {i + 1}/{count} тренеров")
    
    db.commit()
    print(f"   ✅ Всего создано тренеров: {len(coaches)}")
    return coaches


def create_groups_for_coaches(db, coaches, count=10):
    """Создание фиксированного количества групп для тренеров"""
    print(f"\n📋 Создание групп для тренеров (всего {count})...")
    
    age_groups = ["U-6", "U-8", "U-10", "U-12", "U-14", "U-16"]
    groups = []
    
    # Создаём не более count групп, по одной на тренера
    for i, coach in enumerate(coaches):
        if i >= count:
            break
        age_group = age_groups[i % len(age_groups)]
        group_name = f"{age_group} Группа {chr(65 + (i % 3))}"
        
        # Проверяем существование группы
        existing = db.query(Group).filter(Group.name == group_name).first()
        if existing:
            groups.append(existing)
            continue
        
        group = Group(
            name=group_name,
            coach_id=coach.id,
            max_capacity=20,
            monthly_fee=1200.0,
            age_group=age_group
        )
        db.add(group)
        groups.append(group)
    
    db.commit()
    print(f"   ✅ Создано групп: {len(groups)}")
    return groups


def create_parents_with_students(db, groups, count=500):
    """Создание ровно count родителей и count учеников (1 ребёнок на родителя)
    и равномерное распределение: в каждой группе по 50 учеников"""
    print(f"\n👨‍👩‍👧‍👦 Создание {count} родителей и {count} учеников (по 50 на группу)...")
    
    parents = []
    students = []
    student_index = 0  # для равномерного распределения по группам
    groups_count = len(groups) or 1
    
    while len(parents) < count:
        # Создаём родителя
        is_mother = random.random() > 0.3  # 70% матерей
        first_name = random.choice(FIRST_NAMES_FEMALE if is_mother else FIRST_NAMES_MALE)
        last_name = random.choice(LAST_NAMES)
        phone = generate_phone()
        
        # Проверяем уникальность телефона
        existing = db.query(User).filter(User.phone == phone).first()
        if existing:
            continue
        
        parent = User(
            phone=phone,
            password_hash=get_password_hash("parent123"),
            full_name=f"{first_name} {last_name}" + ("а" if is_mother and last_name.endswith("ов") else ""),
            role="parent"
        )
        db.add(parent)
        db.flush()  # Получаем ID
        
        # Создаём ОДНОГО ребёнка для родителя
        child_first_name = random.choice(FIRST_NAMES_MALE)
        child_last_name = last_name
        
        # Возраст ребёнка 5-16 лет
        age = random.randint(5, 16)
        birth_date = date.today() - timedelta(days=age * 365 + random.randint(0, 364))
        
        # Равномерно распределяем по группам
        group = groups[student_index % groups_count]
        
        student = Student(
            first_name=child_first_name,
            last_name=child_last_name,
            dob=birth_date,
            group_id=group.id,
            status="active",
            parent_phone=phone,
            balance=0.0,
            is_debtor=False
        )
        db.add(student)
        db.flush()
        
        # Создаём привязку родитель-ребёнок
        guardian = StudentGuardian(
            student_id=student.id,
            user_id=parent.id,
            relationship_type="mother" if is_mother else "father"
        )
        db.add(guardian)
        
        parents.append(parent)
        students.append(student)
        student_index += 1
        
        # Коммит каждые 50 записей
        if len(parents) % 50 == 0:
            db.commit()
            print(f"   ✅ Создано {len(parents)}/{count} родителей и учеников")
    
    db.commit()
    print(f"   ✅ Всего создано родителей: {len(parents)}")
    print(f"   ✅ Всего создано учеников: {len(students)}")
    return parents, students


def create_payments_history(db, students, year=None, month=2, amount=1200.0):
    """Создание платежей за указанный месяц (по умолчанию февраль) для КАЖДОГО ученика"""
    print(f"\n💰 Создание платежей за месяц {month}...")
    
    if year is None:
        year = date.today().year
    payment_period = date(year, month, 1)
    
    payments_count = 0
    for student in students:
        payment_date = date(year, month, 5)
        payment = Payment(
            student_id=student.id,
            amount=amount,
            payment_date=payment_date,
            payment_period=payment_period,
            method="cash",
            status="completed",
            description=f"Оплата за Февраль {year}"
        )
        db.add(payment)
        payments_count += 1
    
    db.commit()
    print(f"   ✅ Создано платежей: {payments_count}")


def create_attendance_records(db, students, groups):
    """Создание записей посещаемости"""
    print(f"\n📅 Создание записей посещаемости...")
    
    # Создаём события (тренировки) за последний месяц
    events = []
    from datetime import datetime
    for group in groups:
        for day_offset in range(30):
            event_date = date.today() - timedelta(days=day_offset)
            # 3 тренировки в неделю
            if event_date.weekday() in [0, 2, 4]:  # Пн, Ср, Пт
                event_datetime = datetime.combine(event_date, datetime.min.time())
                event = Event(
                    group_id=group.id,
                    type="training",
                    start_time=event_datetime,
                    end_time=event_datetime,
                    location="Главное поле",
                    status="scheduled"
                )
                db.add(event)
                events.append(event)
    
    db.commit()
    print(f"   ✅ Создано событий: {len(events)}")
    
    # Создаём записи посещаемости
    attendance_count = 0
    for student in students[:200]:  # Для первых 200 учеников
        student_events = [e for e in events if e.group_id == student.group_id][:10]
        
        for event in student_events:
            # 85% присутствовали, 10% отсутствовали, 5% опоздали
            status = random.choices(
                ["PRESENT", "ABSENT", "LATE", "SICK"],
                weights=[85, 7, 5, 3]
            )[0]
            
            attendance = Attendance(
                student_id=student.id,
                event_id=event.id,
                status=status
            )
            db.add(attendance)
            attendance_count += 1
    
    db.commit()
    print(f"   ✅ Создано записей посещаемости: {attendance_count}")


def main():
    print("=" * 60)
    print("🎯 ГЕНЕРАЦИЯ ТЕСТОВЫХ ДАННЫХ")
    print("=" * 60)
    
    db = SessionLocal()
    
    try:
        # 1. Создаём тренеров
        coaches = create_coaches(db, count=10)
        
        # 2. Создаём группы
        groups = create_groups_for_coaches(db, coaches)
        
        # 3. Создаём родителей с учениками
        parents, students = create_parents_with_students(db, groups, count=500)
        
        # 4. Создаём историю платежей
        create_payments_history(db, students)
        
        # 5. Создаём посещаемость
        create_attendance_records(db, students, groups)
        
        print("\n" + "=" * 60)
        print("✅ ГЕНЕРАЦИЯ ЗАВЕРШЕНА!")
        print("=" * 60)
        
        # Итоговая статистика
        total_users = db.query(User).count()
        total_students = db.query(Student).count()
        total_groups = db.query(Group).count()
        total_payments = db.query(Payment).count()
        
        print(f"\n📊 ИТОГОВАЯ СТАТИСТИКА:")
        print(f"   👥 Пользователей: {total_users}")
        print(f"   🎒 Учеников: {total_students}")
        print(f"   📋 Групп: {total_groups}")
        print(f"   💰 Платежей: {total_payments}")
        print(f"\n📱 Тестовые пароли:")
        print(f"   Тренеры: coach123")
        print(f"   Родители: parent123")
        
    except Exception as e:
        print(f"\n❌ Ошибка: {e}")
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
