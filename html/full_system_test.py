#!/usr/bin/env python3
"""
🧪 Комплексное тестирование системы перед деплоем
Проверяет все API endpoints, структуру БД, производительность
"""
import requests
import time
import json
from datetime import datetime, timedelta
from concurrent.futures import ThreadPoolExecutor, as_completed

BASE_URL = "http://localhost:8000"
API_PREFIX = f"{BASE_URL}/api/v1"

# Test results
results = {
    "passed": [],
    "failed": [],
    "warnings": []
}

def log_pass(test_name, details=""):
    results["passed"].append(f"✅ {test_name}: {details}")
    print(f"✅ {test_name}: {details}")

def log_fail(test_name, details=""):
    results["failed"].append(f"❌ {test_name}: {details}")
    print(f"❌ {test_name}: {details}")

def log_warn(test_name, details=""):
    results["warnings"].append(f"⚠️ {test_name}: {details}")
    print(f"⚠️ {test_name}: {details}")

def get_token(phone, password):
    """Получить токен авторизации"""
    try:
        r = requests.post(f"{API_PREFIX}/auth/login", data={"username": phone, "password": password})
        if r.status_code == 200:
            return r.json().get("access_token")
    except Exception as e:
        print(f"Auth error: {e}")
    return None

def api_call(endpoint, token, method="GET", data=None):
    """Универсальный API вызов"""
    headers = {"Authorization": f"Bearer {token}"}
    try:
        if method == "GET":
            return requests.get(f"{API_PREFIX}{endpoint}", headers=headers, timeout=10)
        elif method == "POST":
            return requests.post(f"{API_PREFIX}{endpoint}", headers=headers, json=data, timeout=10)
        elif method == "PUT":
            return requests.put(f"{API_PREFIX}{endpoint}", headers=headers, json=data, timeout=10)
        elif method == "DELETE":
            return requests.delete(f"{API_PREFIX}{endpoint}", headers=headers, timeout=10)
    except Exception as e:
        return None

# ==================== ТЕСТЫ ====================

def test_health():
    """Тест здоровья сервера"""
    try:
        r = requests.get(f"{BASE_URL}/health", timeout=5)
        if r.status_code == 200 and r.json().get("status") == "healthy":
            log_pass("Health Check", f"Database: {r.json().get('checks',{}).get('database')}")
            return True
    except:
        pass
    log_fail("Health Check", "Server not responding")
    return False

def test_auth_endpoints(token):
    """Тест авторизации и пользователей"""
    # Get users list
    r = api_call("/auth/users", token)
    if r and r.status_code == 200:
        data = r.json()
        users = data.get("data", []) if isinstance(data, dict) else data
        log_pass("GET /auth/users", f"{len(users)} пользователей")
        
        # Check user roles distribution
        roles = {}
        for u in users:
            if isinstance(u, dict):
                role = u.get("role", "unknown")
                roles[role] = roles.get(role, 0) + 1
        log_pass("User roles", f"{roles}")
        return True
    log_fail("GET /auth/users", r.text if r else "No response")
    return False

def test_groups(token):
    """Тест групп"""
    r = api_call("/groups", token)
    if r and r.status_code == 200:
        data = r.json()
        groups = data.get("data", data) if isinstance(data, dict) else data
        if not isinstance(groups, list):
            groups = []
        log_pass("GET /groups", f"{len(groups)} групп")
        
        # Check each group has required fields
        for g in groups[:3]:
            if isinstance(g, dict) and "students_count" not in g:
                log_warn("Groups", f"Группа {g.get('name')} без students_count")
        return len(groups)
    log_fail("GET /groups", r.text if r else "No response")
    return 0

def test_students(token):
    """Тест учеников"""
    r = api_call("/students", token)
    if r and r.status_code == 200:
        data = r.json()
        students = data.get("data", data) if isinstance(data, dict) else data
        if not isinstance(students, list):
            students = []
        log_pass("GET /students", f"{len(students)} учеников")
        
        # Check for soft-deleted students not appearing
        active = [s for s in students if isinstance(s, dict) and not s.get("deleted_at")]
        if len(active) != len(students):
            log_warn("Students", f"Найдены удаленные ученики в списке")
        return len(students)
    log_fail("GET /students", r.text if r else "No response")
    return 0

def test_events(token):
    """Тест событий/расписания"""
    r = api_call("/events", token)
    if r and r.status_code == 200:
        data = r.json()
        events = data.get("data", data) if isinstance(data, dict) else data
        if not isinstance(events, list):
            events = []
        log_pass("GET /events", f"{len(events)} событий")
        return len(events)
    log_fail("GET /events", r.text if r else "No response")
    return 0

def test_payments(token):
    """Тест платежей"""
    r = api_call("/payments", token)
    if r and r.status_code == 200:
        data = r.json()
        payments = data.get("data", []) if isinstance(data, dict) else data
        log_pass("GET /payments", f"{len(payments)} платежей")
        return True
    log_fail("GET /payments", r.text if r else "No response")
    return False

def test_analytics(token):
    """Тест аналитики"""
    r = api_call("/admin/quick/dashboard-stats", token)
    if r and r.status_code == 200:
        data = r.json()
        log_pass("GET /admin/quick/dashboard-stats", f"Учеников: {data.get('total_students')}, Групп: {data.get('total_groups')}")
        return True
    log_fail("GET /admin/quick/dashboard-stats", r.text if r else "No response")
    return False

def test_schedule_templates(token):
    """Тест шаблонов расписания"""
    r = api_call("/schedule/templates", token)
    if r and r.status_code == 200:
        templates = r.json()
        log_pass("GET /schedule/templates", f"{len(templates)} шаблонов")
        return True
    log_fail("GET /schedule/templates", r.text if r else "No response")
    return False

def test_schedule_changes(token):
    """Тест изменений расписания"""
    r = api_call("/schedule/changes?limit=10", token)
    if r and r.status_code == 200:
        data = r.json()
        changes = data.get("data", [])
        log_pass("GET /schedule/changes", f"{len(changes)} изменений")
        return True
    log_fail("GET /schedule/changes", r.text if r else "No response")
    return False

def test_messages(token):
    """Тест сообщений"""
    # Announcements
    r = api_call("/messages/announcements", token)
    if r and r.status_code == 200:
        log_pass("GET /messages/announcements", "OK")
    else:
        log_fail("GET /messages/announcements", r.text if r else "No response")
    
    # Chat users
    r = api_call("/messages/users", token)
    if r and r.status_code == 200:
        users = r.json()
        log_pass("GET /messages/users", f"{len(users)} пользователей для чата")
    else:
        log_warn("GET /messages/users", "Не работает")
    return True

def test_salaries(token):
    """Тест зарплатной системы"""
    # Contracts
    r = api_call("/salaries/contracts", token)
    if r and r.status_code == 200:
        contracts = r.json()
        log_pass("GET /salaries/contracts", f"{len(contracts)} контрактов")
    else:
        log_fail("GET /salaries/contracts", r.text if r else "No response")
        return False
    
    # Staff list
    r = api_call("/salaries/staff", token)
    if r and r.status_code == 200:
        staff = r.json()
        log_pass("GET /salaries/staff", f"{len(staff)} сотрудников")
    else:
        log_warn("GET /salaries/staff", "Не работает")
    
    return True

def test_attendance(token):
    """Тест посещаемости"""
    # First get a group ID
    r = api_call("/groups", token)
    if r and r.status_code == 200:
        data = r.json()
        groups = data.get("data", data) if isinstance(data, dict) else data
        if groups and len(groups) > 0:
            group_id = groups[0].get("id") if isinstance(groups[0], dict) else None
            if group_id:
                r2 = api_call(f"/attendance/monthly-report?group_id={group_id}&year=2026&month=1", token)
                if r2 and r2.status_code == 200:
                    log_pass("GET /attendance/monthly-report", "OK")
                    return True
                else:
                    log_warn("GET /attendance/monthly-report", r2.text if r2 else "No response")
                    return True  # Not critical
    log_warn("GET /attendance/monthly-report", "Нет групп для теста")
    return True

def test_debtors(token):
    """Тест должников"""
    r = api_call("/admin/debtors", token)
    if r and r.status_code == 200:
        data = r.json()
        debtors = data.get("debtors", data) if isinstance(data, dict) else data
        if not isinstance(debtors, list):
            debtors = []
        log_pass("GET /admin/debtors", f"{len(debtors)} должников")
        return True
    log_fail("GET /admin/debtors", r.text if r else "No response")
    return False

def test_archived_users(token):
    """Тест архивных пользователей"""
    r = api_call("/auth/users/archived", token)
    if r and r.status_code == 200:
        archived = r.json()
        log_pass("GET /auth/users/archived", f"{len(archived)} архивных")
        return True
    log_fail("GET /auth/users/archived", r.text if r else "No response")
    return False

def test_concurrent_requests(token, num_requests=50):
    """Тест одновременных запросов (нагрузочный)"""
    endpoints = ["/groups", "/students", "/events", "/payments"]
    
    def make_request(endpoint):
        start = time.time()
        r = api_call(endpoint, token)
        elapsed = time.time() - start
        return (r.status_code if r else 0, elapsed)
    
    print(f"\n🔥 Нагрузочный тест: {num_requests} запросов...")
    start_time = time.time()
    
    with ThreadPoolExecutor(max_workers=20) as executor:
        futures = []
        for i in range(num_requests):
            endpoint = endpoints[i % len(endpoints)]
            futures.append(executor.submit(make_request, endpoint))
        
        success = 0
        total_time = 0
        max_time = 0
        
        for future in as_completed(futures):
            status, elapsed = future.result()
            if status == 200:
                success += 1
            total_time += elapsed
            max_time = max(max_time, elapsed)
    
    total_elapsed = time.time() - start_time
    avg_time = total_time / num_requests
    
    if success == num_requests:
        log_pass("Load Test", f"{success}/{num_requests} успешно, avg={avg_time:.3f}s, max={max_time:.3f}s, total={total_elapsed:.2f}s")
    else:
        log_warn("Load Test", f"{success}/{num_requests} успешно (некоторые запросы не прошли)")
    
    # Check if performance is acceptable (avg < 1s, max < 3s)
    if avg_time > 1.0:
        log_warn("Performance", f"Среднее время ответа {avg_time:.3f}s > 1s")
    if max_time > 3.0:
        log_warn("Performance", f"Максимальное время ответа {max_time:.3f}s > 3s")
    
    return success >= num_requests * 0.95

def test_response_times(token):
    """Тест времени ответа критических endpoints"""
    critical_endpoints = [
        ("/auth/users", "Пользователи"),
        ("/groups", "Группы"),
        ("/students", "Ученики"),
        ("/payments", "Платежи"),
        ("/admin/quick/dashboard-stats", "Аналитика"),
    ]
    
    print("\n⏱️ Замер времени ответа...")
    all_ok = True
    
    for endpoint, name in critical_endpoints:
        start = time.time()
        r = api_call(endpoint, token)
        elapsed = time.time() - start
        
        if r and r.status_code == 200:
            if elapsed < 0.5:
                log_pass(f"Response time: {name}", f"{elapsed:.3f}s")
            elif elapsed < 1.0:
                log_warn(f"Response time: {name}", f"{elapsed:.3f}s (медленно)")
                all_ok = False
            else:
                log_fail(f"Response time: {name}", f"{elapsed:.3f}s (очень медленно)")
                all_ok = False
        else:
            log_fail(f"Response time: {name}", "Ошибка запроса")
            all_ok = False
    
    return all_ok

# ==================== MAIN ====================

def main():
    print("=" * 60)
    print("🧪 КОМПЛЕКСНОЕ ТЕСТИРОВАНИЕ СИСТЕМЫ")
    print(f"⏰ Время: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 60)
    
    # 1. Health check
    print("\n📋 1. ПРОВЕРКА ЗДОРОВЬЯ СЕРВЕРА")
    if not test_health():
        print("\n❌ Сервер не работает! Прервано.")
        return
    
    # 2. Get admin token
    print("\n📋 2. АВТОРИЗАЦИЯ")
    token = get_token("+37360000001", "admin123")
    if not token:
        log_fail("Auth", "Не удалось получить токен админа")
        return
    log_pass("Auth", "Токен получен")
    
    # 3. Test all endpoints
    print("\n📋 3. ТЕСТИРОВАНИЕ API ENDPOINTS")
    test_auth_endpoints(token)
    test_groups(token)
    test_students(token)
    test_events(token)
    test_payments(token)
    test_analytics(token)
    test_schedule_templates(token)
    test_schedule_changes(token)
    test_messages(token)
    test_salaries(token)
    test_attendance(token)
    test_debtors(token)
    test_archived_users(token)
    
    # 4. Performance tests
    print("\n📋 4. ТЕСТЫ ПРОИЗВОДИТЕЛЬНОСТИ")
    test_response_times(token)
    test_concurrent_requests(token, 50)
    
    # 5. Summary
    print("\n" + "=" * 60)
    print("📊 ИТОГИ ТЕСТИРОВАНИЯ")
    print("=" * 60)
    print(f"\n✅ Успешно: {len(results['passed'])}")
    print(f"⚠️ Предупреждения: {len(results['warnings'])}")
    print(f"❌ Ошибки: {len(results['failed'])}")
    
    if results["warnings"]:
        print("\n⚠️ ПРЕДУПРЕЖДЕНИЯ:")
        for w in results["warnings"]:
            print(f"   {w}")
    
    if results["failed"]:
        print("\n❌ ОШИБКИ:")
        for f in results["failed"]:
            print(f"   {f}")
    
    # Final verdict
    print("\n" + "=" * 60)
    if not results["failed"]:
        print("✅ СИСТЕМА ГОТОВА К ДЕПЛОЮ")
    else:
        print("❌ ЕСТЬ ПРОБЛЕМЫ - ТРЕБУЕТСЯ ИСПРАВЛЕНИЕ")
    print("=" * 60)

if __name__ == "__main__":
    main()
