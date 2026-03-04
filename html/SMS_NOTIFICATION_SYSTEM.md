# 📱 SMS Notification System - Система уведомлений

## 🎯 Описание

Полностью интегрированная система автоматических SMS-уведомлений для родителей о платежах и абонементах.

---

## ✅ Реализованные функции

### 1. **Шаблоны SMS** (RO + RU)

#### 📅 Напоминание об оплате (25-го числа)
```
🏆 Sunny Academy

Уважаемый родитель!

Напоминаем, что подходит срок оплаты абонемента за Февраль для вашего ребёнка Иван Иванов.

⏰ Период оплаты: 25-31 числа текущего месяца

Спасибо, что вы с нами! ⚽
```

#### ⚠️ Напоминание о долге
```
🏆 Sunny Academy

Уважаемый родитель!

Обращаем внимание, что у вас имеется задолженность по абонементу за Февраль для Иван Иванов.

⚠️ Пожалуйста, оплатите в ближайшее время для продолжения занятий.

По вопросам оплаты обращайтесь к администратору.

С уважением, Sunny Academy ⚽
```

#### ✅ Подтверждение оплаты
```
🏆 Sunny Academy

✅ Оплата принята!

Абонемент за Февраль для Иван Иванов успешно оплачен.

Ждём вас на тренировках! ⚽
```

---

### 2. **Автоматическая рассылка**

#### 📅 25-го числа каждого месяца
- Отправляется родителям, у которых НЕ оплачен абонемент на СЛЕДУЮЩИЙ месяц
- Язык сообщения определяется из `preferred_language` родителя
- Пропускает студентов, у которых уже есть оплата

#### ⚠️ 2, 5, 10 числа месяца
- Отправляется родителям-должникам (флаг `is_debtor = True`)
- Напоминание о необходимости оплаты текущего месяца

#### ✅ При подтверждении оплаты
- Мгновенно при создании платежа (background task)
- Содержит имя ребёнка и месяц оплаты

---

### 3. **Синхронизация языка между платформами**

#### Web версия (React)
- При смене языка в настройках → автоматически сохраняется в backend
- При входе → загружает `preferred_language` из backend
- Файл: `frontend/src/context/LanguageContext.jsx`

#### Mobile версия (Flutter)
- При смене языка → синхронизируется с backend через API
- При входе → загружает сохранённый язык из backend
- Файл: `football_academy_app/lib/l10n/app_localizations.dart`

#### Backend API
- Endpoint: `PUT /api/v1/auth/me/language`
- Параметр: `{"language": "ro"}` или `{"language": "ru"}`
- Сохраняет в `users.preferred_language`

---

## 📂 Структура файлов

```
app/
├── core/
│   ├── sms_service.py          # SMS сервис (Twilio, SMS.ru, Nexmo, Mock)
│   ├── scheduler.py            # Планировщик (25-го, 2/5/10 числа)
│   └── background_tasks.py     # Background tasks для SMS
├── routers/
│   ├── payments.py             # Отправка SMS при платеже
│   └── auth.py                 # Endpoint смены языка
run_scheduler.py                # Скрипт для cron

frontend/
└── src/context/
    ├── LanguageContext.jsx     # Синхронизация языка (Web)
    └── AuthContext.jsx         # Загрузка языка при входе

football_academy_app/
└── lib/
    ├── l10n/app_localizations.dart  # Синхронизация языка (Mobile)
    └── providers/auth_provider.dart # Загрузка языка при входе
```

---

## 🚀 Запуск

### 1. Настройка SMS провайдера

Добавьте в `.env`:

```env
# Mock режим (для разработки, без реальной отправки)
SMS_PROVIDER=mock

# Twilio
SMS_PROVIDER=twilio
SMS_API_KEY=your_twilio_account_sid
SMS_API_SECRET=your_twilio_auth_token
SMS_SENDER_ID=+1234567890

# SMS.ru
SMS_PROVIDER=smsru
SMS_API_KEY=your_smsru_api_key

# Nexmo/Vonage
SMS_PROVIDER=nexmo
SMS_API_KEY=your_nexmo_api_key
SMS_API_SECRET=your_nexmo_api_secret
SMS_SENDER_ID=Academy
```

### 2. Настройка Cron для автоматической рассылки

Добавьте в crontab:

```bash
# Каждый день в 10:00
0 10 * * * cd /path/to/football-academy-system && python run_scheduler.py >> scheduler.log 2>&1
```

Или используйте systemd timer:

```bash
# /etc/systemd/system/payment-scheduler.service
[Unit]
Description=Payment Reminder Scheduler

[Service]
Type=oneshot
WorkingDirectory=/path/to/football-academy-system
ExecStart=/usr/bin/python3 run_scheduler.py
User=your_user

# /etc/systemd/system/payment-scheduler.timer
[Unit]
Description=Daily payment reminders

[Timer]
OnCalendar=daily
OnCalendar=10:00
Persistent=true

[Install]
WantedBy=timers.target
```

Активация:
```bash
sudo systemctl enable payment-scheduler.timer
sudo systemctl start payment-scheduler.timer
```

### 3. Ручная отправка (для тестирования)

```bash
python run_scheduler.py
```

---

## 🔍 Логи

Все действия логируются:

```python
logger.info("📱 MOCK SMS: +37360123456")
logger.info("   Message: ...")
logger.info("✅ SMS sent successfully: ID mock_1234567890")
```

---

## 🧪 Тестирование

### 1. Проверка шаблона

```python
from app.core.sms_service import SMSTemplates

# Напоминание об оплате
text = SMSTemplates.payment_reminder("Иван Иванов", "Февраль", "ru")
print(text)

# Напоминание о долге
text = SMSTemplates.debt_reminder("Иван Иванов", "Февраль", "ru")
print(text)

# Подтверждение оплаты
text = SMSTemplates.payment_confirmation("Иван Иванов", "Февраль", "ru")
print(text)
```

### 2. Проверка отправки

```python
from app.core.sms_service import sms_service
import asyncio

async def test():
    result = await sms_service.send_sms("+37360123456", "Test message")
    print(result)

asyncio.run(test())
```

### 3. Проверка планировщика

```bash
# Установить дату на 25-е число
sudo date -s "2024-01-25 10:00:00"

# Запустить планировщик
python run_scheduler.py

# Вернуть системное время
sudo ntpdate -s time.nist.gov
```

---

## 🌐 Синхронизация языка

### Веб → Бэкенд

При смене языка в `Settings`:
```javascript
// frontend/src/context/LanguageContext.jsx
const syncLanguageWithBackend = async (lang) => {
  await fetch('/api/v1/auth/me/language', {
    method: 'PUT',
    body: JSON.stringify({ language: lang })
  });
};
```

### Мобильное → Бэкенд

При смене языка в настройках:
```dart
// football_academy_app/lib/l10n/app_localizations.dart
Future<void> _syncLanguageWithBackend(String langCode) async {
  final response = await http.put(
    Uri.parse('$baseUrl/api/v1/auth/me/language'),
    body: jsonEncode({'language': langCode}),
  );
}
```

### Бэкенд → Клиент

При входе:
```dart
// Загружаем preferred_language из backend
final userData = await _apiService.getMe();
final backendLang = userData['preferred_language'];
await prefs.setString('language_code', backendLang);
```

---

## ✅ Проверка работы

1. **Смените язык на веб-версии** → проверьте в базе `users.preferred_language`
2. **Войдите в мобильное приложение** → язык должен синхронизироваться
3. **Смените язык в мобильном** → обновится в веб-версии
4. **Создайте платёж** → родитель получит SMS на своём языке

---

## 🎉 Готово!

Система полностью интегрирована и готова к использованию:

✅ SMS-шаблоны (RO + RU)  
✅ Автоматическая рассылка 25-го числа  
✅ Напоминания о долгах  
✅ Подтверждение оплаты  
✅ Синхронизация языка веб ↔ мобильное ↔ бэкенд  
✅ Mock режим для разработки  
✅ Поддержка 3 SMS провайдеров  

---

**Утверждено и внедрено** ✅
