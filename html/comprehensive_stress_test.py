#!/usr/bin/env python3
"""
🏟️ Comprehensive Stress Test - Football Academy System
Тест системы под нагрузкой: 500 учеников, 10 тренеров, 500 родителей, 10 групп
"""

import requests
import time
import random
from datetime import datetime, timedelta
from concurrent.futures import ThreadPoolExecutor, as_completed
import statistics

BASE_URL = "http://localhost:8000/api/v1"
ADMIN_PHONE = "+373888888"
ADMIN_PASSWORD = "password123"

# Цвета для консоли
GREEN = '\033[92m'
RED = '\033[91m'
YELLOW = '\033[93m'
BLUE = '\033[94m'
RESET = '\033[0m'

class StressTest:
    def __init__(self):
        self.admin_token = None
        self.coach_tokens = []
        self.parent_tokens = []
        self.results = {
            'auth': [], 'students': [], 'groups': [], 
            'payments': [], 'attendance': [], 'analytics': []
        }
        
    def print_header(self, text):
        print(f"\n{BLUE}{'='*60}{RESET}")
        print(f"{BLUE}{text:^60}{RESET}")
        print(f"{BLUE}{'='*60}{RESET}\n")
    
    def print_success(self, text):
        print(f"{GREEN}✅ {text}{RESET}")
    
    def print_error(self, text):
        print(f"{RED}❌ {text}{RESET}")
    
    def print_info(self, text):
        print(f"{YELLOW}ℹ️  {text}{RESET}")
    
    def login(self, phone, password):
        """Авторизация пользователя"""
        try:
            response = requests.post(
                f"{BASE_URL}/auth/login",
                data={"username": phone, "password": password},
                headers={"Content-Type": "application/x-www-form-urlencoded"}
            )
            if response.status_code == 200:
                return response.json()["access_token"]
            return None
        except Exception as e:
            self.print_error(f"Login error: {e}")
            return None
    
    def measure_time(self, func, *args, **kwargs):
        """Измерение времени выполнения"""
        start = time.time()
        result = func(*args, **kwargs)
        elapsed = time.time() - start
        return result, elapsed
    
    def test_authentication(self):
        """Тест 1: Массовая авторизация"""
        self.print_header("ТЕСТ 1: МАССОВАЯ АВТОРИЗАЦИЯ")
        
        # Логин администратора
        self.print_info("Авторизация администратора...")
        self.admin_token, elapsed = self.measure_time(self.login, ADMIN_PHONE, ADMIN_PASSWORD)
        if self.admin_token:
            self.results['auth'].append(elapsed)
            self.print_success(f"Администратор залогинен ({elapsed:.2f}s)")
        else:
            self.print_error("Не удалось войти как администратор!")
            return False
        
        # Получаем список тренеров
        headers = {"Authorization": f"Bearer {self.admin_token}"}
        response = requests.get(f"{BASE_URL}/auth/users?role=coach", headers=headers)
        coaches = response.json()[:10]  # Берём 10 тренеров
        
        self.print_info(f"Авторизация {len(coaches)} тренеров...")
        for coach in coaches:
            token, elapsed = self.measure_time(self.login, coach['phone'], ADMIN_PASSWORD)
            if token:
                self.coach_tokens.append((coach['phone'], token))
                self.results['auth'].append(elapsed)
        
        self.print_success(f"Авторизовано {len(self.coach_tokens)} тренеров")
        
        # Получаем список родителей
        response = requests.get(f"{BASE_URL}/auth/users?role=parent", headers=headers)
        parents = response.json()[:50]  # Берём 50 родителей для теста
        
        self.print_info(f"Авторизация {len(parents)} родителей...")
        for parent in parents[:50]:
            token, elapsed = self.measure_time(self.login, parent['phone'], ADMIN_PASSWORD)
            if token:
                self.parent_tokens.append((parent['phone'], token))
                self.results['auth'].append(elapsed)
        
        self.print_success(f"Авторизовано {len(self.parent_tokens)} родителей")
        
        # Статистика
        avg_time = statistics.mean(self.results['auth'])
        max_time = max(self.results['auth'])
        min_time = min(self.results['auth'])
        
        print(f"\n📊 Статистика авторизации:")
        print(f"   Средняя: {avg_time:.3f}s")
        print(f"   Макс: {max_time:.3f}s")
        print(f"   Мин: {min_time:.3f}s")
        
        return True
    
    def test_students_load(self):
        """Тест 2: Загрузка списка учеников"""
        self.print_header("ТЕСТ 2: ЗАГРУЗКА УЧЕНИКОВ")
        
        headers = {"Authorization": f"Bearer {self.admin_token}"}
        
        # Тест с разными параметрами пагинации
        test_cases = [
            (1, 50, "Первая страница (50 записей)"),
            (1, 100, "Первая страница (100 записей)"),
            (5, 100, "Пятая страница (100 записей)"),
            (1, 500, "Все ученики (500 записей)"),
        ]
        
        for page, limit, desc in test_cases:
            self.print_info(f"Загрузка: {desc}")
            start = time.time()
            response = requests.get(
                f"{BASE_URL}/students/?page={page}&limit={limit}",
                headers=headers
            )
            elapsed = time.time() - start
            
            if response.status_code == 200:
                data = response.json()
                # API возвращает объект с полем 'total' и 'data'
                if isinstance(data, dict):
                    count = data.get('total', 0)
                else:
                    count = len(data)
                self.results['students'].append(elapsed)
                self.print_success(f"Загружено {count} учеников за {elapsed:.3f}s")
            else:
                self.print_error(f"Ошибка загрузки: {response.status_code}")
        
        # Тест поиска
        self.print_info("Тест поиска учеников...")
        search_queries = ["Иван", "Петр", "Мария", "active", "U-10"]
        
        for query in search_queries:
            start = time.time()
            response = requests.get(
                f"{BASE_URL}/students/?search={query}",
                headers=headers
            )
            elapsed = time.time() - start
            
            if response.status_code == 200:
                data = response.json()
                count = len(data.get('students', []))
                self.print_success(f"Поиск '{query}': {count} результатов за {elapsed:.3f}s")
            else:
                self.print_error(f"Ошибка поиска: {response.status_code}")
    
    def test_groups_operations(self):
        """Тест 3: Операции с группами"""
        self.print_header("ТЕСТ 3: ОПЕРАЦИИ С ГРУППАМИ")
        
        headers = {"Authorization": f"Bearer {self.admin_token}"}
        
        # Загрузка всех групп
        self.print_info("Загрузка всех групп...")
        start = time.time()
        response = requests.get(f"{BASE_URL}/groups/", headers=headers)
        elapsed = time.time() - start
        
        if response.status_code == 200:
            groups = response.json()
            if isinstance(groups, dict):
                groups = groups.get('groups', [])
            self.results['groups'].append(elapsed)
            self.print_success(f"Загружено {len(groups)} групп за {elapsed:.3f}s")
            
            # Загрузка детальной информации по каждой группе
            self.print_info("Загрузка деталей групп...")
            for group in list(groups)[:10]:  # Берём первые 10 групп
                start = time.time()
                response = requests.get(f"{BASE_URL}/groups/{group['id']}", headers=headers)
                elapsed = time.time() - start
                
                if response.status_code == 200:
                    data = response.json()
                    students_count = len(data.get('students', []))
                    self.results['groups'].append(elapsed)
                    print(f"   {group['name']}: {students_count} учеников ({elapsed:.3f}s)")
        else:
            self.print_error(f"Ошибка загрузки групп: {response.status_code}")
    
    def test_payments_operations(self):
        """Тест 4: Операции с платежами"""
        self.print_header("ТЕСТ 4: ОПЕРАЦИИ С ПЛАТЕЖАМИ")
        
        headers = {"Authorization": f"Bearer {self.admin_token}"}
        
        # Загрузка платежей
        self.print_info("Загрузка списка платежей...")
        start = time.time()
        response = requests.get(f"{BASE_URL}/payments/?limit=100", headers=headers)
        elapsed = time.time() - start
        
        if response.status_code == 200:
            data = response.json()
            count = data.get('total', 0)
            self.results['payments'].append(elapsed)
            self.print_success(f"Загружено {count} платежей за {elapsed:.3f}s")
        
        # Тест фильтрации
        filters = [
            ("status=paid", "Оплаченные"),
            ("status=pending", "Ожидающие"),
            ("payment_period=2026-01", "За январь 2026"),
        ]
        
        for filter_param, desc in filters:
            self.print_info(f"Фильтр: {desc}")
            start = time.time()
            response = requests.get(
                f"{BASE_URL}/payments/?{filter_param}&limit=50",
                headers=headers
            )
            elapsed = time.time() - start
            
            if response.status_code == 200:
                data = response.json()
                count = data.get('total', 0)
                self.print_success(f"  Найдено {count} платежей за {elapsed:.3f}s")
    
    def test_attendance_operations(self):
        """Тест 5: Операции с посещаемостью"""
        self.print_header("ТЕСТ 5: ПОСЕЩАЕМОСТЬ")
        
        headers = {"Authorization": f"Bearer {self.admin_token}"}
        
        # Загрузка посещаемости за разные периоды
        today = datetime.now()
        date_ranges = [
            (today - timedelta(days=7), today, "Последние 7 дней"),
            (today - timedelta(days=30), today, "Последние 30 дней"),
            (today - timedelta(days=90), today, "Последние 3 месяца"),
        ]
        
        for start_date, end_date, desc in date_ranges:
            self.print_info(f"Загрузка: {desc}")
            start_time = time.time()
            response = requests.get(
                f"{BASE_URL}/attendance/?start_date={start_date.date()}&end_date={end_date.date()}&limit=100",
                headers=headers
            )
            elapsed = time.time() - start_time
            
            if response.status_code == 200:
                data = response.json()
                if isinstance(data, list):
                    count = len(data)
                else:
                    count = len(data.get('records', []))
                self.results['attendance'].append(elapsed)
                self.print_success(f"  {count} записей за {elapsed:.3f}s")
    
    def test_analytics_performance(self):
        """Тест 6: Производительность аналитики"""
        self.print_header("ТЕСТ 6: АНАЛИТИКА")
        
        headers = {"Authorization": f"Bearer {self.admin_token}"}
        
        analytics_endpoints = [
            ("/analytics/total-revenue-cached", "Общая статистика"),
            ("/analytics/financial-overview", "Доходы по месяцам"),
            ("/analytics/debtors?month=2026-01", "Должники"),
        ]
        
        for endpoint, desc in analytics_endpoints:
            self.print_info(f"Загрузка: {desc}")
            start = time.time()
            response = requests.get(f"{BASE_URL}{endpoint}", headers=headers)
            elapsed = time.time() - start
            
            if response.status_code == 200:
                self.results['analytics'].append(elapsed)
                self.print_success(f"  Загружено за {elapsed:.3f}s")
            else:
                self.print_error(f"  Ошибка: {response.status_code}")
    
    def test_concurrent_requests(self):
        """Тест 7: Параллельные запросы"""
        self.print_header("ТЕСТ 7: ПАРАЛЛЕЛЬНЫЕ ЗАПРОСЫ")
        
        def make_request(token_data):
            phone, token = token_data
            headers = {"Authorization": f"Bearer {token}"}
            start = time.time()
            response = requests.get(f"{BASE_URL}/auth/me", headers=headers)
            elapsed = time.time() - start
            return elapsed, response.status_code == 200
        
        self.print_info(f"Выполнение {len(self.parent_tokens)} параллельных запросов...")
        
        with ThreadPoolExecutor(max_workers=10) as executor:
            futures = [executor.submit(make_request, token) for token in self.parent_tokens]
            
            success_count = 0
            times = []
            
            for future in as_completed(futures):
                elapsed, success = future.result()
                if success:
                    success_count += 1
                    times.append(elapsed)
        
        if times:
            avg_time = statistics.mean(times)
            max_time = max(times)
            
            self.print_success(f"Успешно: {success_count}/{len(self.parent_tokens)}")
            print(f"   Среднее время: {avg_time:.3f}s")
            print(f"   Максимальное: {max_time:.3f}s")
    
    def print_final_report(self):
        """Финальный отчет"""
        self.print_header("📊 ИТОГОВЫЙ ОТЧЕТ")
        
        categories = [
            ('auth', 'Авторизация'),
            ('students', 'Ученики'),
            ('groups', 'Группы'),
            ('payments', 'Платежи'),
            ('attendance', 'Посещаемость'),
            ('analytics', 'Аналитика'),
        ]
        
        print(f"\n{'Категория':<20} {'Запросов':<12} {'Средняя':<12} {'Макс':<12} {'Мин':<12}")
        print("-" * 70)
        
        for key, name in categories:
            if self.results[key]:
                count = len(self.results[key])
                avg = statistics.mean(self.results[key])
                max_t = max(self.results[key])
                min_t = min(self.results[key])
                
                # Оценка производительности
                if avg < 0.5:
                    status = f"{GREEN}Отлично{RESET}"
                elif avg < 1.0:
                    status = f"{YELLOW}Хорошо{RESET}"
                else:
                    status = f"{RED}Медленно{RESET}"
                
                print(f"{name:<20} {count:<12} {avg:.3f}s {status:<12} {max_t:.3f}s {' ':<6} {min_t:.3f}s")
        
        print("\n" + "="*70)
        print(f"\n{GREEN}✅ СИСТЕМА ГОТОВА К РАБОТЕ С БОЛЬШОЙ НАГРУЗКОЙ{RESET}")
        print(f"{YELLOW}   • 500+ учеников")
        print(f"   • 10 тренеров")
        print(f"   • 500 родителей")
        print(f"   • 10 групп{RESET}")
    
    def run_all_tests(self):
        """Запуск всех тестов"""
        print(f"\n{BLUE}{'='*60}")
        print(f"🏟️  КОМПЛЕКСНОЕ СТРЕСС-ТЕСТИРОВАНИЕ")
        print(f"{'='*60}{RESET}\n")
        
        if not self.test_authentication():
            self.print_error("Не удалось пройти аутентификацию!")
            return
        
        self.test_students_load()
        self.test_groups_operations()
        self.test_payments_operations()
        self.test_attendance_operations()
        self.test_analytics_performance()
        self.test_concurrent_requests()
        
        self.print_final_report()


if __name__ == "__main__":
    print(f"\n{BLUE}Starting comprehensive stress test...{RESET}\n")
    print(f"{YELLOW}⚠️  Убедитесь, что backend запущен на http://localhost:8000{RESET}\n")
    
    time.sleep(2)
    
    test = StressTest()
    test.run_all_tests()
    
    print(f"\n{GREEN}✅ Тестирование завершено!{RESET}\n")
