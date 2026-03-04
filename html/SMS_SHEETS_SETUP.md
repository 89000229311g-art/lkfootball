# 📱 SMS и 📊 Google Sheets - Инструкция по настройке

## 📱 SMS Интеграция

### Mock режим (по умолчанию, для разработки)
```bash
SMS_PROVIDER=mock
```
- Не отправляет реальные SMS
- Логирует сообщения в консоль
- Идеально для тестирования

---

### Twilio (США, международный)

**1. Регистрация:**
- Перейти на https://www.twilio.com/
- Создать аккаунт (бесплатный trial)
- Получить Account SID и Auth Token

**2. Установка:**
```bash
pip install twilio
```

**3. Конфигурация в `.env`:**
```bash
SMS_PROVIDER=twilio
SMS_API_KEY=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxx  # Account SID
SMS_API_SECRET=your_auth_token_here
SMS_SENDER_ID=+15551234567  # Ваш Twilio номер
```

**4. Получить номер:**
- В консоли Twilio: Phone Numbers → Buy a Number
- Выбрать номер с SMS capability

**Стоимость:** ~$1/месяц за номер + $0.0075 за SMS

---

### SMS.ru (Россия, СНГ)

**1. Регистрация:**
- Перейти на https://sms.ru/
- Зарегистрироваться
- Пополнить баланс (минимум 100₽)

**2. API ключ:**
- Личный кабинет → API → Создать API ключ
- Скопировать API ID

**3. Конфигурация в `.env`:**
```bash
SMS_PROVIDER=smsru
SMS_API_KEY=your_api_id_here
SMS_SENDER_ID=Academy  # Имя отправителя (опционально)
```

**4. Настройка отправителя:**
- Зарегистрировать имя отправителя (модерация 1-3 дня)
- Или использовать дефолтное "SMS.RU"

**Стоимость:** ~1.5₽ за SMS в России, ~4₽ в Молдове

---

### Nexmo/Vonage (международный)

**1. Регистрация:**
- Перейти на https://www.vonage.com/
- Создать аккаунт

**2. Установка:**
```bash
pip install vonage
```

**3. Конфигурация в `.env`:**
```bash
SMS_PROVIDER=nexmo
SMS_API_KEY=your_api_key
SMS_API_SECRET=your_api_secret
SMS_SENDER_ID=Academy
```

**Стоимость:** ~€0.05 за SMS

---

## 📊 Google Sheets Интеграция

### Зачем это нужно?
- Автоматический экспорт платежей в таблицу
- Синхронизация данных студентов
- Посещаемость в реальном времени
- Доступ для бухгалтерии без доступа в систему

---

### Настройка (пошагово)

**Шаг 1: Создание проекта**
1. Открыть [Google Cloud Console](https://console.cloud.google.com/)
2. Создать новый проект: "Football Academy"
3. Запомнить Project ID

**Шаг 2: Включение API**
1. APIs & Services → Library
2. Найти "Google Sheets API"
3. Нажать "Enable"

**Шаг 3: Создание Service Account**
1. APIs & Services → Credentials
2. Create Credentials → Service Account
3. Название: "academy-sheets-sync"
4. Role: Editor (или минимальные права)
5. Done

**Шаг 4: Скачивание ключа**
1. Нажать на созданный Service Account
2. Keys → Add Key → Create New Key
3. JSON формат
4. Сохранить как `credentials.json` в корень проекта

**Шаг 5: Создание таблицы**
1. Создать Google Sheet: https://sheets.google.com/
2. Назвать: "Football Academy Data"
3. Создать листы:
   - **Студенты** (колонки: ID, Имя, Фамилия, Дата рождения, Телефон, Группа, Статус, Обновлено)
   - **Платежи** (колонки: ID, Student ID, Студент, Сумма, Дата, Период, Статус, Заметки, Обновлено)
   - **Посещаемость** (колонки: ID, Student ID, Студент, Event ID, Дата, Статус, Обновлено)

**Шаг 6: Предоставление доступа**
1. Открыть `credentials.json`
2. Скопировать email: `academy-sheets-sync@....iam.gserviceaccount.com`
3. В Google Sheet: Share → Вставить email → Editor → Send

**Шаг 7: Получение Spreadsheet ID**
1. URL таблицы: `https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit`
2. Скопировать `SPREADSHEET_ID` (длинная строка между `/d/` и `/edit`)

**Шаг 8: Установка зависимостей**
```bash
pip install google-auth google-auth-oauthlib google-auth-httplib2 google-api-python-client
```

**Шаг 9: Конфигурация в `.env`**
```bash
GOOGLE_SHEETS_ENABLED=true
GOOGLE_CREDENTIALS_PATH=credentials.json
GOOGLE_SPREADSHEET_ID=ваш_spreadsheet_id_здесь
```

**Шаг 10: Тест**
```bash
# Запустить backend
python -m uvicorn app.main:app --reload

# Создать платёж через API
# Проверить, что данные появились в Google Sheet
```

---

## 🧪 Тестирование

### Тест SMS (mock режим)
```python
from app.core.sms_service import sms_service, SMSTemplates
import asyncio

async def test_sms():
    # Уведомление о платеже
    message = SMSTemplates.payment_received(250, "Ianuarie 2026", "ro")
    result = await sms_service.send_sms("+37368123456", message)
    print(result)

asyncio.run(test_sms())
```

### Тест Google Sheets
```python
from app.core.sheets_service import sheets_service
import asyncio

async def test_sheets():
    payment_data = {
        "id": 999,
        "student_id": 1,
        "student_name": "Test Student",
        "amount": 250.0,
        "payment_date": "2026-01-12",
        "payment_period": "2026-01-01",
        "status": "completed",
        "notes": "Test"
    }
    
    result = await sheets_service.sync_payment(payment_data, "create")
    print(result)

asyncio.run(test_sheets())
```

---

## 🔒 Безопасность

**credentials.json:**
- ❌ НЕ коммитить в Git
- ✅ Добавить в `.gitignore`
- ✅ Хранить в безопасном месте

**API ключи:**
- ❌ НЕ хранить в коде
- ✅ Только в `.env`
- ✅ Использовать `.env.example` для примера

**Production:**
- Использовать переменные окружения
- Kubernetes Secrets / AWS Secrets Manager
- Регулярная ротация ключей

---

## 💰 Сравнение SMS провайдеров

| Провайдер | Стоимость (Молдова) | Регистрация | Поддержка |
|-----------|---------------------|-------------|-----------|
| **Twilio** | ~$0.05/SMS | Международная | 24/7 |
| **SMS.ru** | ~4₽/SMS (~$0.04) | Русский интерфейс | Рабочие часы |
| **Nexmo** | ~€0.05/SMS | Международная | 24/7 |

**Рекомендация для Молдовы:** SMS.ru (лучшая цена + поддержка RU/RO)

---

## 📞 Поддержка

Если возникли проблемы:
1. Проверить логи: `tail -f backend.log`
2. Убедиться, что `.env` настроен правильно
3. Проверить баланс SMS провайдера
4. Убедиться, что credentials.json валиден
