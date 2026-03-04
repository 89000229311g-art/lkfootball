#!/usr/bin/env python3
"""
🔥 СТРЕСС-ТЕСТ: 500 одновременных входов
Проверка готовности PostgreSQL и Backend к production нагрузке

Использование:
    python stress_test.py [--users 500] [--url http://localhost:8000]
"""

import asyncio
import aiohttp
import time
import statistics
import argparse
from dataclasses import dataclass
from typing import List, Tuple
from collections import Counter

# ===== КОНФИГУРАЦИЯ =====
DEFAULT_BASE_URL = "http://localhost:8000"
DEFAULT_CONCURRENT_USERS = 500
LOGIN_ENDPOINT = "/api/v1/auth/login"

# Тестовые учетные данные (существующие пользователи)
TEST_CREDENTIALS = [
    {"username": "+37360000001", "password": "admin123"},      # super_admin
    {"username": "+37360000002", "password": "admin123"},      # admin
    {"username": "+37360000011", "password": "coach123"},      # coach (1-10)
    {"username": "+37360000012", "password": "coach123"},      
    {"username": "+37360000013", "password": "coach123"},      
    {"username": "+37360000014", "password": "coach123"},      
    {"username": "+37360000015", "password": "coach123"},      
    {"username": "+37360000016", "password": "coach123"},      
    {"username": "+37360000017", "password": "coach123"},      
    {"username": "+37360000018", "password": "coach123"},      
    {"username": "+37360000019", "password": "coach123"},      
    {"username": "+37360000020", "password": "coach123"},      
    {"username": "+37360000021", "password": "parent123"},     # parent (21-520)
]


@dataclass
class RequestResult:
    """Результат одного запроса"""
    success: bool
    status_code: int
    response_time: float  # в миллисекундах
    error: str = None


class StressTest:
    """Класс для проведения стресс-теста"""
    
    def __init__(self, base_url: str, concurrent_users: int):
        self.base_url = base_url.rstrip('/')
        self.concurrent_users = concurrent_users
        self.results: List[RequestResult] = []
        
    def _get_credentials(self, index: int) -> dict:
        """Получить учетные данные для запроса (циклически)"""
        return TEST_CREDENTIALS[index % len(TEST_CREDENTIALS)]
    
    async def _make_login_request(
        self, 
        session: aiohttp.ClientSession, 
        index: int
    ) -> RequestResult:
        """Выполнить один запрос авторизации"""
        credentials = self._get_credentials(index)
        url = f"{self.base_url}{LOGIN_ENDPOINT}"
        
        start_time = time.perf_counter()
        
        try:
            # OAuth2 form data
            data = aiohttp.FormData()
            data.add_field('username', credentials['username'])
            data.add_field('password', credentials['password'])
            
            async with session.post(url, data=data, timeout=aiohttp.ClientTimeout(total=30)) as response:
                response_time = (time.perf_counter() - start_time) * 1000  # мс
                
                return RequestResult(
                    success=response.status == 200,
                    status_code=response.status,
                    response_time=response_time,
                    error=None if response.status == 200 else f"HTTP {response.status}"
                )
                
        except asyncio.TimeoutError:
            response_time = (time.perf_counter() - start_time) * 1000
            return RequestResult(
                success=False,
                status_code=0,
                response_time=response_time,
                error="Timeout (>30s)"
            )
        except aiohttp.ClientError as e:
            response_time = (time.perf_counter() - start_time) * 1000
            return RequestResult(
                success=False,
                status_code=0,
                response_time=response_time,
                error=str(e)
            )
        except Exception as e:
            response_time = (time.perf_counter() - start_time) * 1000
            return RequestResult(
                success=False,
                status_code=0,
                response_time=response_time,
                error=f"Unknown error: {e}"
            )
    
    async def run_test(self) -> Tuple[List[RequestResult], float]:
        """Запустить стресс-тест"""
        print(f"\n{'='*60}")
        print(f"🔥 СТРЕСС-ТЕСТ: {self.concurrent_users} ОДНОВРЕМЕННЫХ ВХОДОВ")
        print(f"{'='*60}")
        print(f"📍 URL: {self.base_url}")
        print(f"📍 Endpoint: {LOGIN_ENDPOINT}")
        print(f"👥 Пользователей: {self.concurrent_users}")
        print(f"{'='*60}\n")
        
        # Создаем коннектор с большим пулом соединений
        connector = aiohttp.TCPConnector(
            limit=self.concurrent_users,
            limit_per_host=self.concurrent_users,
            force_close=False
        )
        
        async with aiohttp.ClientSession(connector=connector) as session:
            print("⏳ Запуск всех запросов одновременно...")
            
            total_start = time.perf_counter()
            
            # Создаем все задачи
            tasks = [
                self._make_login_request(session, i) 
                for i in range(self.concurrent_users)
            ]
            
            # Запускаем все одновременно
            self.results = await asyncio.gather(*tasks)
            
            total_time = time.perf_counter() - total_start
            
        return self.results, total_time
    
    def print_report(self, total_time: float):
        """Вывести отчет о результатах"""
        successful = [r for r in self.results if r.success]
        failed = [r for r in self.results if not r.success]
        
        response_times = [r.response_time for r in self.results]
        successful_times = [r.response_time for r in successful] if successful else [0]
        
        print(f"\n{'='*60}")
        print(f"📊 РЕЗУЛЬТАТЫ СТРЕСС-ТЕСТА")
        print(f"{'='*60}\n")
        
        # Общая статистика
        success_rate = len(successful) / len(self.results) * 100
        print(f"✅ Успешных запросов:  {len(successful)}/{len(self.results)} ({success_rate:.1f}%)")
        print(f"❌ Неудачных запросов: {len(failed)}/{len(self.results)}")
        print(f"⏱️  Общее время теста: {total_time:.2f} сек")
        print(f"🚀 RPS (запросов/сек): {len(self.results) / total_time:.1f}")
        
        # Статистика времени ответа
        print(f"\n{'─'*40}")
        print(f"⏱️  ВРЕМЯ ОТВЕТА (все запросы):")
        print(f"{'─'*40}")
        print(f"   Минимум:    {min(response_times):.0f} мс")
        print(f"   Максимум:   {max(response_times):.0f} мс")
        print(f"   Среднее:    {statistics.mean(response_times):.0f} мс")
        print(f"   Медиана:    {statistics.median(response_times):.0f} мс")
        if len(response_times) > 1:
            print(f"   Std Dev:    {statistics.stdev(response_times):.0f} мс")
        
        # Перцентили
        sorted_times = sorted(response_times)
        p50 = sorted_times[int(len(sorted_times) * 0.50)]
        p90 = sorted_times[int(len(sorted_times) * 0.90)]
        p95 = sorted_times[int(len(sorted_times) * 0.95)]
        p99 = sorted_times[int(len(sorted_times) * 0.99)]
        
        print(f"\n{'─'*40}")
        print(f"📈 ПЕРЦЕНТИЛИ:")
        print(f"{'─'*40}")
        print(f"   P50 (медиана): {p50:.0f} мс")
        print(f"   P90:           {p90:.0f} мс")
        print(f"   P95:           {p95:.0f} мс")
        print(f"   P99:           {p99:.0f} мс")
        
        # Распределение ошибок
        if failed:
            print(f"\n{'─'*40}")
            print(f"❌ ОШИБКИ:")
            print(f"{'─'*40}")
            error_counts = Counter(r.error for r in failed)
            for error, count in error_counts.most_common(10):
                print(f"   {error}: {count}")
        
        # Распределение HTTP кодов
        print(f"\n{'─'*40}")
        print(f"📋 HTTP КОДЫ:")
        print(f"{'─'*40}")
        status_counts = Counter(r.status_code for r in self.results)
        for status, count in sorted(status_counts.items()):
            status_name = {
                0: "Connection Error",
                200: "OK",
                401: "Unauthorized",
                422: "Validation Error",
                429: "Rate Limited",
                500: "Server Error",
                502: "Bad Gateway",
                503: "Service Unavailable"
            }.get(status, f"HTTP {status}")
            print(f"   {status_name}: {count}")
        
        # Оценка готовности
        print(f"\n{'='*60}")
        print(f"🏁 ОЦЕНКА ГОТОВНОСТИ К PRODUCTION")
        print(f"{'='*60}\n")
        
        issues = []
        
        if success_rate < 99:
            issues.append(f"⚠️  Низкий % успеха: {success_rate:.1f}% (цель: >99%)")
        
        if p95 > 1000:
            issues.append(f"⚠️  P95 слишком высокий: {p95:.0f}мс (цель: <1000мс)")
        
        if p99 > 3000:
            issues.append(f"⚠️  P99 слишком высокий: {p99:.0f}мс (цель: <3000мс)")
        
        avg_time = statistics.mean(response_times)
        if avg_time > 500:
            issues.append(f"⚠️  Среднее время высокое: {avg_time:.0f}мс (цель: <500мс)")
        
        if issues:
            print("❌ ТРЕБУЕТСЯ ОПТИМИЗАЦИЯ:\n")
            for issue in issues:
                print(f"   {issue}")
            print(f"\n📌 Рекомендации:")
            print(f"   1. Увеличьте pool_size в database.py (текущий: 5)")
            print(f"   2. Добавьте индексы на поле phone в таблице users")
            print(f"   3. Включите Redis кеширование")
            print(f"   4. Увеличьте количество воркеров Uvicorn")
        else:
            print("✅ СИСТЕМА ГОТОВА К PRODUCTION!\n")
            print(f"   ✓ Успешность: {success_rate:.1f}%")
            print(f"   ✓ P95 время ответа: {p95:.0f} мс")
            print(f"   ✓ P99 время ответа: {p99:.0f} мс")
            print(f"   ✓ Среднее время: {avg_time:.0f} мс")
            print(f"   ✓ RPS: {len(self.results) / total_time:.1f}")
        
        print(f"\n{'='*60}\n")
        
        return len(issues) == 0


async def check_server(base_url: str) -> bool:
    """Проверить доступность сервера"""
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(f"{base_url}/health", timeout=aiohttp.ClientTimeout(total=5)) as resp:
                return resp.status == 200
    except:
        return False


async def main():
    parser = argparse.ArgumentParser(description='🔥 Стресс-тест: 500 одновременных входов')
    parser.add_argument('--users', type=int, default=DEFAULT_CONCURRENT_USERS, 
                        help=f'Количество одновременных пользователей (default: {DEFAULT_CONCURRENT_USERS})')
    parser.add_argument('--url', type=str, default=DEFAULT_BASE_URL,
                        help=f'Base URL сервера (default: {DEFAULT_BASE_URL})')
    
    args = parser.parse_args()
    
    # Проверяем доступность сервера
    print(f"\n🔍 Проверка доступности сервера: {args.url}")
    
    if not await check_server(args.url):
        print(f"\n❌ Сервер недоступен: {args.url}")
        print(f"   Убедитесь что backend запущен:")
        print(f"   cd /Users/macbook/Desktop/football-academy-system\\ 2")
        print(f"   uvicorn app.main:app --reload --host 0.0.0.0 --port 8000")
        return
    
    print(f"✅ Сервер доступен\n")
    
    # Запускаем тест
    test = StressTest(args.url, args.users)
    results, total_time = await test.run_test()
    
    # Выводим отчет
    is_ready = test.print_report(total_time)
    
    # Возвращаем код выхода
    return 0 if is_ready else 1


if __name__ == "__main__":
    exit_code = asyncio.run(main())
    exit(exit_code or 0)
