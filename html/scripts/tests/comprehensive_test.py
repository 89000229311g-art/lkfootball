#!/usr/bin/env python3
"""
🧪 КОМПЛЕКСНОЕ ТЕСТИРОВАНИЕ ПРИЛОЖЕНИЯ
Автоматическая проверка всех сценариев использования
"""

import asyncio
import aiohttp
import json
import os
from datetime import date, timedelta
from typing import Dict, List, Any

BASE_URL = "http://localhost:8000/api/v1"

# Цвета для вывода
class Color:
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    END = '\033[0m'

# Результаты тестов
test_results = {
    "passed": [],
    "failed": [],
    "warnings": []
}


async def login(session: aiohttp.ClientSession, phone: str, password: str) -> Dict:
    """Авторизация пользователя"""
    data = aiohttp.FormData()
    data.add_field('username', phone)
    data.add_field('password', password)
    
    async with session.post(f"{BASE_URL}/auth/login", data=data) as resp:
        if resp.status == 200:
            return await resp.json()
        else:
            raise Exception(f"Login failed: {resp.status}")


async def test_scenario(name: str, func):
    """Обёртка для запуска тест-сценария"""
    try:
        print(f"\n{'='*60}")
        print(f"🧪 {name}")
        print(f"{'='*60}")
        
        result = await func()
        
        if result.get("success"):
            test_results["passed"].append(name)
            print(f"{Color.GREEN}✅ PASSED{Color.END}")
        else:
            test_results["failed"].append((name, result.get("error", "Unknown error")))
            print(f"{Color.RED}❌ FAILED: {result.get('error')}{Color.END}")
            
        if result.get("warnings"):
            for warning in result["warnings"]:
                test_results["warnings"].append((name, warning))
                print(f"{Color.YELLOW}⚠️  WARNING: {warning}{Color.END}")
                
    except Exception as e:
        test_results["failed"].append((name, str(e)))
        print(f"{Color.RED}❌ EXCEPTION: {e}{Color.END}")


# ==================== ТЕСТЫ ====================

async def test_parent_scenario():
    """Сценарий родителя: вход → просмотр детей → платёж"""
    async with aiohttp.ClientSession() as session:
        warnings = []
        
        # 1. Авторизация
        print("   📱 Авторизация родителя...")
        try:
            token_data = await login(session, "parent", "123")
            token = token_data["access_token"]
            headers = {"Authorization": f"Bearer {token}"}
        except:
            # Пробуем с полным номером
            try:
                token_data = await login(session, "+37360111001", "password123")
                token = token_data["access_token"]
                headers = {"Authorization": f"Bearer {token}"}
            except Exception as e:
                return {"success": False, "error": f"Не удалось авторизоваться: {e}"}
        
        print(f"      ✓ Токен получен")
        
        # 2. Получение своего профиля
        print("   👤 Получение профиля...")
        async with session.get(f"{BASE_URL}/auth/me", headers=headers) as resp:
            if resp.status != 200:
                return {"success": False, "error": f"Failed to get profile: {resp.status}"}
            profile = await resp.json()
        
        print(f"      ✓ Профиль: {profile.get('full_name')}")
        
        # 3. Получение списка детей
        print("   👶 Получение списка детей...")
        async with session.get(f"{BASE_URL}/students", headers=headers) as resp:
            if resp.status != 200:
                return {"success": False, "error": f"Failed to get students: {resp.status}"}
            students_response = await resp.json()
        
        # Handle paginated response
        students = students_response.get('data', []) if isinstance(students_response, dict) else students_response
        
        if not students:
            warnings.append("У родителя нет привязанных детей")
        else:
            print(f"      ✓ Детей: {len(students)}")
            for s in students[:3]:
                print(f"        - {s.get('first_name')} {s.get('last_name')}")
        
        # 4. Получение посещаемости ребёнка (если есть дети)
        if students:
            student_id = students[0]["id"]
            print(f"   📅 Получение посещаемости ребёнка #{student_id}...")
            async with session.get(f"{BASE_URL}/students/{student_id}/attendance-stats", headers=headers) as resp:
                if resp.status == 200:
                    stats = await resp.json()
                    print(f"      ✓ Посещений в этом месяце: {stats.get('current_month', {}).get('total', 0)}")
                else:
                    warnings.append(f"Не удалось получить статистику посещаемости: {resp.status}")
        
        # 5. История платежей
        print("   💰 Получение истории платежей...")
        async with session.get(f"{BASE_URL}/payments", headers=headers) as resp:
            if resp.status == 200:
                payments = await resp.json()
                print(f"      ✓ Платежей: {len(payments)}")
            else:
                warnings.append(f"Не удалось получить платежи: {resp.status}")
        
        return {"success": True, "warnings": warnings}


async def test_coach_scenario():
    """Сценарий тренера: вход → просмотр групп → отметка посещаемости"""
    async with aiohttp.ClientSession() as session:
        warnings = []
        
        # 1. Авторизация
        print("   📱 Авторизация тренера...")
        try:
            token_data = await login(session, "coach", "123")
            token = token_data["access_token"]
            headers = {"Authorization": f"Bearer {token}"}
        except:
            try:
                token_data = await login(session, "+373999999", "password123")
                token = token_data["access_token"]
                headers = {"Authorization": f"Bearer {token}"}
            except Exception as e:
                return {"success": False, "error": f"Не удалось авторизоваться: {e}"}
        
        print(f"      ✓ Токен получен")
        
        # 2. Получение своих групп
        print("   📋 Получение своих групп...")
        async with session.get(f"{BASE_URL}/coach/my-groups", headers=headers) as resp:
            if resp.status == 200:
                groups = await resp.json()
                print(f"      ✓ Групп: {len(groups)}")
                for g in groups[:3]:
                    print(f"        - {g.get('name')}")
            else:
                warnings.append(f"Не удалось получить группы: {resp.status}")
                groups = []
        
        # 3. Получение учеников в группе
        if groups:
            group_id = groups[0]["id"]
            print(f"   🎒 Получение учеников группы #{group_id}...")
            async with session.get(f"{BASE_URL}/groups/{group_id}/students", headers=headers) as resp:
                if resp.status == 200:
                    students = await resp.json()
                    print(f"      ✓ Учеников: {len(students)}")
                else:
                    warnings.append(f"Не удалось получить учеников: {resp.status}")
        
        # 4. Аналитика тренера
        print("   📊 Получение аналитики...")
        async with session.get(f"{BASE_URL}/analytics/coach/overview", headers=headers) as resp:
            if resp.status == 200:
                analytics = await resp.json()
                print(f"      ✓ Всего учеников: {analytics.get('total_students', 0)}")
            else:
                warnings.append(f"Аналитика недоступна: {resp.status}")
        
        return {"success": True, "warnings": warnings}


async def test_admin_scenario():
    """Сценарий администратора: управление пользователями → платежи → должники"""
    async with aiohttp.ClientSession() as session:
        warnings = []
        
        # 1. Авторизация
        print("   📱 Авторизация администратора...")
        try:
            token_data = await login(session, "admin", "123")
            token = token_data["access_token"]
            headers = {"Authorization": f"Bearer {token}"}
        except:
            try:
                token_data = await login(session, "+373888888", "password123")
                token = token_data["access_token"]
                headers = {"Authorization": f"Bearer {token}"}
            except Exception as e:
                return {"success": False, "error": f"Не удалось авторизоваться: {e}"}
        
        print(f"      ✓ Токен получен")
        
        # 2. Получение всех пользователей
        print("   👥 Получение списка пользователей...")
        async with session.get(f"{BASE_URL}/auth/users", headers=headers) as resp:
            if resp.status == 200:
                users_response = await resp.json()
                # Handle paginated response
                users = users_response.get('data', []) if isinstance(users_response, dict) else users_response
                print(f"      ✓ Пользователей: {len(users)}")
                
                # Подсчёт по ролям
                roles = {}
                for u in users:
                    role = u.get('role', 'unknown') if isinstance(u, dict) else 'unknown'
                    roles[role] = roles.get(role, 0) + 1
                
                for role, count in roles.items():
                    print(f"        - {role}: {count}")
            else:
                return {"success": False, "error": f"Failed to get users: {resp.status}"}
        
        # 3. Получение всех учеников
        print("   🎒 Получение всех учеников...")
        async with session.get(f"{BASE_URL}/students", headers=headers) as resp:
            if resp.status == 200:
                students_response = await resp.json()
                # Handle paginated response
                students = students_response.get('data', []) if isinstance(students_response, dict) else students_response
                print(f"      ✓ Учеников: {len(students)}")
                
                # Должники
                debtors = [s for s in students if s.get('is_debtor') or (s.get('balance', 0) < 0)]
                print(f"      ⚠️  Должников: {len(debtors)}")
            else:
                warnings.append(f"Не удалось получить учеников: {resp.status}")
                students = []

        student_for_tests = students[0] if students else None

        if student_for_tests:
            student_id = student_for_tests.get("id")

            # Skills save
            print(f"   ⭐ Сохранение навыков ученика #{student_id}...")
            today = date.today()
            payload = {
                "student_id": student_id,
                "rating_month": today.month,
                "rating_year": today.year,
                "technique": 60,
                "tactics": 55,
                "physical": 70,
                "discipline": 65,
                "coach_comment": "smoke-test"
            }
            async with session.post(f"{BASE_URL}/skills/", headers=headers, json=payload) as resp:
                if resp.status not in (200, 201):
                    warnings.append(f"Не удалось сохранить навыки: {resp.status}")
                else:
                    _ = await resp.json()
                    print("      ✓ Навыки сохранены")

            # Avatar upload
            avatar_path = os.path.join("football_academy_app", "web", "icons", "Icon-192.png")
            if not os.path.exists(avatar_path):
                warnings.append(f"Файл для теста аватара не найден: {avatar_path}")
            else:
                print(f"   📷 Загрузка фото ученика #{student_id}...")
                with open(avatar_path, "rb") as f:
                    form = aiohttp.FormData()
                    form.add_field(
                        "avatar",
                        f,
                        filename="Icon-192.png",
                        content_type="image/png"
                    )
                    async with session.post(f"{BASE_URL}/students/{student_id}/avatar", headers=headers, data=form) as resp:
                        if resp.status != 200:
                            warnings.append(f"Не удалось загрузить фото: {resp.status}")
                        else:
                            _ = await resp.json()
                            print("      ✓ Фото загружено")

            # Medical doc upload + save to student
            doc_path = avatar_path
            if os.path.exists(doc_path):
                print("   🩺 Загрузка мед. справки...")
                with open(doc_path, "rb") as f:
                    form = aiohttp.FormData()
                    form.add_field(
                        "file",
                        f,
                        filename="Icon-192.png",
                        content_type="image/png"
                    )
                    async with session.post(f"{BASE_URL}/medical-docs", headers=headers, data=form) as resp:
                        if resp.status != 200:
                            warnings.append(f"Не удалось загрузить мед. справку: {resp.status}")
                            doc_url = None
                        else:
                            doc_json = await resp.json()
                            doc_url = doc_json.get("url")
                            print("      ✓ Файл мед. справки загружен")

                if doc_url:
                    expires = (date.today() + timedelta(days=365)).isoformat()
                    print(f"   📝 Сохранение мед. справки в карточку ученика #{student_id}...")
                    async with session.put(
                        f"{BASE_URL}/students/{student_id}",
                        headers=headers,
                        json={
                            "medical_certificate_file": doc_url,
                            "medical_certificate_expires": expires
                        }
                    ) as resp:
                        if resp.status != 200:
                            warnings.append(f"Не удалось сохранить мед. справку в ученика: {resp.status}")
                        else:
                            _ = await resp.json()
                            print("      ✓ Мед. справка сохранена")
        else:
            warnings.append("Нет учеников для smoke-теста навыков/загрузок")
        
        # 4. Получение всех платежей
        print("   💰 Получение всех платежей...")
        async with session.get(f"{BASE_URL}/payments", headers=headers) as resp:
            if resp.status == 200:
                payments_response = await resp.json()
                # Handle paginated response
                payments = payments_response.get('data', []) if isinstance(payments_response, dict) else payments_response
                print(f"      ✓ Платежей: {len(payments)}")
                
                # Сумма
                total = sum(p.get('amount', 0) for p in payments)
                print(f"      💵 Общая сумма: {total:,.2f} MDL")
            else:
                warnings.append(f"Не удалось получить платежи: {resp.status}")
        
        # 5. Аналитика
        print("   📊 Получение аналитики...")
        async with session.get(f"{BASE_URL}/analytics/summary", headers=headers) as resp:
            if resp.status == 200:
                analytics = await resp.json()
                print(f"      ✓ Всего учеников: {analytics.get('total_students', 0)}")
                print(f"      ✓ Активных: {analytics.get('active_students', 0)}")
            else:
                warnings.append(f"Аналитика недоступна: {resp.status}")
        
        return {"success": True, "warnings": warnings}


async def test_owner_scenario():
    """Сценарий руководителя: полная аналитика → управление всеми"""
    async with aiohttp.ClientSession() as session:
        warnings = []
        
        # 1. Авторизация
        print("   📱 Авторизация руководителя...")
        try:
            token_data = await login(session, "owner", "123")
            token = token_data["access_token"]
            headers = {"Authorization": f"Bearer {token}"}
        except:
            try:
                token_data = await login(session, "+373777777", "password123")
                token = token_data["access_token"]
                headers = {"Authorization": f"Bearer {token}"}
            except Exception as e:
                return {"success": False, "error": f"Не удалось авторизоваться: {e}"}
        
        print(f"      ✓ Токен получен")
        
        # 2. Получение полной аналитики
        print("   📊 Получение бизнес-аналитики...")
        async with session.get(f"{BASE_URL}/analytics/summary", headers=headers) as resp:
            if resp.status == 200:
                analytics = await resp.json()
                print(f"      ✓ Всего учеников: {analytics.get('total_students', 0)}")
                print(f"      ✓ Активных: {analytics.get('active_students', 0)}")
            else:
                warnings.append(f"Аналитика недоступна: {resp.status}")
        
        # 3. Выручка
        print("   💰 Получение данных о выручке...")
        async with session.get(f"{BASE_URL}/analytics/revenue", headers=headers) as resp:
            if resp.status == 200:
                revenue = await resp.json()
                print(f"      ✓ Выручка за месяц: {revenue.get('current_month', 0):,.2f} MDL")
            else:
                warnings.append(f"Данные о выручке недоступны: {resp.status}")
        
        # 4. Посещаемость
        print("   📅 Получение статистики посещаемости...")
        async with session.get(f"{BASE_URL}/analytics/attendance", headers=headers) as resp:
            if resp.status == 200:
                attendance = await resp.json()
                print(f"      ✓ Средняя посещаемость: {attendance.get('average_attendance', 0):.1f}%")
            else:
                warnings.append(f"Статистика посещаемости недоступна: {resp.status}")
        
        # 5. Учётные данные пользователей
        print("   🔐 Получение учётных данных...")
        async with session.get(f"{BASE_URL}/auth/credentials", headers=headers) as resp:
            if resp.status == 200:
                credentials = await resp.json()
                print(f"      ✓ Сохранено учётных данных: {credentials.get('total', 0)}")
            else:
                warnings.append(f"Учётные данные недоступны: {resp.status}")
        
        return {"success": True, "warnings": warnings}


async def test_performance():
    """Тест производительности: одновременные запросы"""
    async with aiohttp.ClientSession() as session:
        warnings = []
        
        print("   ⚡ Запуск 50 одновременных запросов...")
        
        import time
        start = time.time()
        
        # 50 одновременных запросов к health endpoint
        tasks = [session.get(f"{BASE_URL.replace('/api/v1', '')}/health") for _ in range(50)]
        responses = await asyncio.gather(*tasks, return_exceptions=True)
        
        duration = time.time() - start
        
        success_count = sum(1 for r in responses if isinstance(r, aiohttp.ClientResponse) and r.status == 200)
        
        print(f"      ✓ Успешных: {success_count}/50")
        print(f"      ✓ Время: {duration:.2f}с")
        print(f"      ✓ RPS: {50/duration:.1f}")
        
        if success_count < 45:
            warnings.append(f"Низкая успешность: {success_count}/50")
        
        if duration > 5:
            warnings.append(f"Медленная обработка: {duration:.2f}с")
        
        return {"success": success_count >= 45, "warnings": warnings}


async def main():
    print("\n" + "="*60)
    print("🧪 КОМПЛЕКСНОЕ ТЕСТИРОВАНИЕ ПРИЛОЖЕНИЯ")
    print("="*60)
    
    # Проверка доступности сервера
    print("\n🔍 Проверка доступности сервера...")
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(f"{BASE_URL.replace('/api/v1', '')}/health") as resp:
                if resp.status != 200:
                    print(f"{Color.RED}❌ Сервер недоступен!{Color.END}")
                    return
        print(f"{Color.GREEN}✅ Сервер доступен{Color.END}")
    except:
        print(f"{Color.RED}❌ Не удалось подключиться к серверу!{Color.END}")
        print(f"   Убедитесь что сервер запущен: uvicorn app.main:app --host 0.0.0.0 --port 8000")
        return
    
    # Запуск тестовых сценариев
    await test_scenario("👨‍👩‍👧‍👦 Сценарий родителя", test_parent_scenario)
    await test_scenario("👨‍🏫 Сценарий тренера", test_coach_scenario)
    await test_scenario("🛡️ Сценарий администратора", test_admin_scenario)
    await test_scenario("🏆 Сценарий руководителя", test_owner_scenario)
    await test_scenario("⚡ Тест производительности", test_performance)
    
    # Итоговый отчёт
    print("\n" + "="*60)
    print("📊 ИТОГОВЫЙ ОТЧЁТ")
    print("="*60)
    
    total = len(test_results["passed"]) + len(test_results["failed"])
    
    print(f"\n✅ Пройдено: {len(test_results['passed'])}/{total}")
    for test in test_results["passed"]:
        print(f"   ✓ {test}")
    
    if test_results["failed"]:
        print(f"\n❌ Провалено: {len(test_results['failed'])}/{total}")
        for test, error in test_results["failed"]:
            print(f"   ✗ {test}")
            print(f"      Причина: {error}")
    
    if test_results["warnings"]:
        print(f"\n⚠️  Предупреждения: {len(test_results['warnings'])}")
        for test, warning in test_results["warnings"]:
            print(f"   ! {test}: {warning}")
    
    # Оценка готовности
    print("\n" + "="*60)
    success_rate = len(test_results["passed"]) / total * 100 if total > 0 else 0
    
    if success_rate == 100 and len(test_results["warnings"]) == 0:
        print(f"{Color.GREEN}🎉 СИСТЕМА ГОТОВА К PRODUCTION!{Color.END}")
    elif success_rate >= 80:
        print(f"{Color.YELLOW}⚠️  СИСТЕМА РАБОТАЕТ, НО ЕСТЬ ПРЕДУПРЕЖДЕНИЯ{Color.END}")
        print(f"   Успешность: {success_rate:.0f}%")
    else:
        print(f"{Color.RED}❌ ТРЕБУЕТСЯ ДОРАБОТКА{Color.END}")
        print(f"   Успешность: {success_rate:.0f}%")
    
    print("="*60 + "\n")


if __name__ == "__main__":
    asyncio.run(main())
