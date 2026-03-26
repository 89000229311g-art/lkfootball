#!/bin/bash

echo "🚀 ТЕСТИРОВАНИЕ АНАЛИТИКИ ТРЕНЕРА"
echo "================================"

# Тестовые учетные данные
PHONE="+373123"
PASSWORD="admin123"

echo "1. Авторизация тренера..."
TOKEN_RESPONSE=$(curl -s -X POST "http://localhost:8000/api/v1/auth/login" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=$PHONE&password=$PASSWORD")

echo "Ответ авторизации:"
echo "$TOKEN_RESPONSE" | jq '.'

ACCESS_TOKEN=$(echo "$TOKEN_RESPONSE" | jq -r '.access_token')

if [ "$ACCESS_TOKEN" = "null" ] || [ -z "$ACCESS_TOKEN" ]; then
    echo "❌ Не удалось получить токен"
    exit 1
fi

echo "✅ Авторизация успешна"
echo "Токен: ${ACCESS_TOKEN:0:20}..."

echo "\\n2. Получение данных пользователя..."
USER_DATA=$(curl -s "http://localhost:8000/api/v1/auth/me" \
  -H "Authorization: Bearer $ACCESS_TOKEN")

echo "$USER_DATA" | jq '.'

echo "\\n3. Получение групп тренера со студентами..."
GROUPS_DATA=$(curl -s "http://localhost:8000/api/v1/coach/my-groups-with-students" \
  -H "Authorization: Bearer $ACCESS_TOKEN")

echo "Данные групп:"
echo "$GROUPS_DATA" | jq '.'

GROUP_COUNT=$(echo "$GROUPS_DATA" | jq 'length')
echo "\\n📊 Найдено групп: $GROUP_COUNT"

if [ "$GROUP_COUNT" -gt 0 ]; then
    echo "\\n4. Детальный анализ первой группы..."
    FIRST_GROUP=$(echo "$GROUPS_DATA" | jq '.[0]')
    GROUP_NAME=$(echo "$FIRST_GROUP" | jq -r '.name')
    STUDENT_COUNT=$(echo "$FIRST_GROUP" | jq '.students | length')
    
    echo "Группа: $GROUP_NAME"
    echo "Студентов: $STUDENT_COUNT"
    
    if [ "$STUDENT_COUNT" -gt 0 ]; then
        echo "\\nСписок студентов:"
        echo "$FIRST_GROUP" | jq '.students[] | {name: "\(.first_name) \(.last_name)", status: .status, parents_count: (.parents | length)}'
    fi
else
    echo "❌ У тренера нет групп"
fi

echo "\\n✅ ТЕСТИРОВАНИЕ ЗАВЕРШЕНО"