#!/usr/bin/env python3
"""
Тест для проверки данных тренера и согласованности между эндпоинтами
"""
import requests

BASE_URL = 'http://localhost:8000/api/v1'

def test_coach_data():
    print("=" * 60)
    print("🔍 ТЕСТ ДАННЫХ ТРЕНЕРА")
    print("=" * 60)
    
    # 1. Логин админа для получения списка пользователей
    print("\n1️⃣ Логин под админом...")
    admin_resp = requests.post(f'{BASE_URL}/auth/login', 
        data={'username': '+37360000001', 'password': '111111'})
    
    if admin_resp.status_code != 200:
        print(f"❌ Ошибка логина админа: {admin_resp.status_code}")
        return
    
    admin_token = admin_resp.json()['access_token']
    admin_headers = {'Authorization': f'Bearer {admin_token}'}
    print("✅ Админ авторизован")
    
    # 2. Получаем всех пользователей и находим тренеров
    print("\n2️⃣ Получаем список тренеров...")
    users_resp = requests.get(f'{BASE_URL}/auth/users', headers=admin_headers)
    users = users_resp.json().get('data', users_resp.json()) if users_resp.status_code == 200 else []
    
    coaches = [u for u in users if u.get('role', '').lower() == 'coach']
    print(f"📋 Найдено тренеров: {len(coaches)}")
    
    for coach in coaches:
        print(f"   - ID={coach['id']}: {coach.get('full_name', 'N/A')} ({coach.get('phone', 'N/A')})")
    
    # 3. Получаем все группы от админа
    print("\n3️⃣ Все группы (от админа)...")
    groups_resp = requests.get(f'{BASE_URL}/groups/', headers=admin_headers)
    all_groups = groups_resp.json().get('data', []) if groups_resp.status_code == 200 else []
    print(f"📋 Всего групп в системе: {len(all_groups)}")
    
    for g in all_groups:
        coach_name = "Не назначен"
        for c in coaches:
            if c['id'] == g.get('coach_id'):
                coach_name = c.get('full_name', 'N/A')
                break
        print(f"   - ID={g['id']}: {g['name']} | coach_id={g.get('coach_id')} ({coach_name})")
    
    # 4. Теперь проверяем каждого тренера
    print("\n4️⃣ Проверка данных для каждого тренера...")
    
    for coach in coaches:
        print(f"\n{'='*40}")
        print(f"🏃 Тренер: {coach.get('full_name', 'N/A')} (ID={coach['id']})")
        print(f"{'='*40}")
        
        # Логин тренера
        coach_login = requests.post(f'{BASE_URL}/auth/login', 
            data={'username': coach.get('phone', ''), 'password': '111111'})
        
        if coach_login.status_code != 200:
            print(f"   ❌ Не удалось войти: {coach_login.status_code}")
            continue
        
        coach_token = coach_login.json()['access_token']
        coach_headers = {'Authorization': f'Bearer {coach_token}'}
        
        # Проверка /groups/
        groups_resp = requests.get(f'{BASE_URL}/groups/', headers=coach_headers)
        coach_groups = groups_resp.json().get('data', []) if groups_resp.status_code == 200 else []
        print(f"   📊 /groups/ возвращает: {len(coach_groups)} групп")
        for g in coach_groups:
            print(f"      - {g['name']} (ID={g['id']})")
        
        # Проверка /coach/my-groups-with-students
        my_groups_resp = requests.get(f'{BASE_URL}/coach/my-groups-with-students', headers=coach_headers)
        if my_groups_resp.status_code == 200:
            my_groups = my_groups_resp.json()
            print(f"   📊 /coach/my-groups-with-students возвращает: {len(my_groups)} групп")
            for g in my_groups:
                students_count = len(g.get('students', []))
                print(f"      - {g['name']} (ID={g['id']}, учеников: {students_count})")
        else:
            print(f"   ❌ /coach/my-groups-with-students: {my_groups_resp.status_code}")
        
        # Сравнение
        groups_ids = set(g['id'] for g in coach_groups)
        my_groups_ids = set(g['id'] for g in my_groups) if my_groups_resp.status_code == 200 else set()
        
        if groups_ids == my_groups_ids:
            print(f"   ✅ Данные СОГЛАСОВАНЫ!")
        else:
            print(f"   ⚠️ НЕСООТВЕТСТВИЕ!")
            print(f"      /groups/: {groups_ids}")
            print(f"      /coach/my-groups: {my_groups_ids}")

    print("\n" + "=" * 60)
    print("✅ ТЕСТ ЗАВЕРШЁН")
    print("=" * 60)

if __name__ == '__main__':
    test_coach_data()
