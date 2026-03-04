#!/bin/bash

echo "========================================="
echo "ТЕСТИРОВАНИЕ ВХОДА В ПРИЛОЖЕНИЕ"
echo "========================================="
echo ""

# Родитель 1
echo "📱 РОДИТЕЛЬ 1: +37377777777"
echo "   Пароль: parent123"
echo ""
TOKEN1=$(curl -s -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=%2B37377777777&password=parent123" | python3 -c "import sys, json; print(json.load(sys.stdin)['access_token'])")

if [ -n "$TOKEN1" ]; then
  echo "   ✅ ВХОД УСПЕШЕН!"
  echo "   Token: ${TOKEN1:0:50}..."
  
  echo ""
  echo "   Получаю данные пользователя..."
  curl -s http://localhost:8000/api/v1/auth/me -H "Authorization: Bearer $TOKEN1" | python3 -c "
import sys, json
data = json.load(sys.stdin)
print(f\"   Имя: {data['full_name']}\")
print(f\"   Роль: {data['role']}\")
print(f\"   ID: {data['id']}\")
"
else
  echo "   ❌ ОШИБКА ВХОДА"
fi

echo ""
echo "========================================="
echo ""

# Родитель 2  
echo "📱 РОДИТЕЛЬ 2: +37312345678"
echo "   Пароль: parent123"
echo ""
TOKEN2=$(curl -s -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=%2B37312345678&password=parent123" | python3 -c "import sys, json; print(json.load(sys.stdin)['access_token'])")

if [ -n "$TOKEN2" ]; then
  echo "   ✅ ВХОД УСПЕШЕН!"
  echo "   Token: ${TOKEN2:0:50}..."
  
  echo ""
  echo "   Получаю данные пользователя..."
  curl -s http://localhost:8000/api/v1/auth/me -H "Authorization: Bearer $TOKEN2" | python3 -c "
import sys, json
data = json.load(sys.stdin)
print(f\"   Имя: {data['full_name']}\")
print(f\"   Роль: {data['role']}\")
print(f\"   ID: {data['id']}\")
"
else
  echo "   ❌ ОШИБКА ВХОДА"
fi

echo ""
echo "========================================="
echo ""

# Тренер
echo "🏃 ТРЕНЕР: +373123"
echo "   Пароль: coach123"
echo ""
TOKEN3=$(curl -s -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=%2B373123&password=coach123" | python3 -c "import sys, json; print(json.load(sys.stdin)['access_token'])")

if [ -n "$TOKEN3" ]; then
  echo "   ✅ ВХОД УСПЕШЕН!"
  echo "   Token: ${TOKEN3:0:50}..."
  
  echo ""
  echo "   Получаю данные пользователя..."
  curl -s http://localhost:8000/api/v1/auth/me -H "Authorization: Bearer $TOKEN3" | python3 -c "
import sys, json
data = json.load(sys.stdin)
print(f\"   Имя: {data['full_name']}\")
print(f\"   Роль: {data['role']}\")
print(f\"   ID: {data['id']}\")
"
else
  echo "   ❌ ОШИБКА ВХОДА"
fi

echo ""
echo "========================================="
echo "ВСЕ ТЕСТЫ ЗАВЕРШЕНЫ"
echo "========================================="
