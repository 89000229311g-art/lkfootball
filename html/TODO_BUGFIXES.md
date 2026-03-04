# 🔧 TODO: Исправления для системы Football Academy

**Дата:** 2 февраля 2026  
**Приоритет:** Высокий

---

## 1. 📢 Communications - Убрать "Рассылки" для тренеров

**Файл:** `frontend/src/pages/Communications.jsx`

**Проблема:** Тренеры видят вкладку "Рассылки", хотя она должна быть только для администраторов.

**Решение:** Строка ~757-763:
```jsx
// БЫЛО:
{(isAdmin || isCoach) && (
  <button onClick={() => setActiveTab('mailings')}>
    📢 Рассылки
  </button>
)}

// НУЖНО:
{isAdmin && (
  <button onClick={() => setActiveTab('mailings')}>
    📢 Рассылки
  </button>
)}
```

---

## 2. 📝 Attendance - Доработать посещаемость

**Файлы:** 
- `frontend/src/pages/Attendance.jsx`
- `app/routers/attendance.py`

**Проблемы:**
1. Тренер должен видеть только свои группы
2. Добавить возможность быстрого отмечания всех учеников сразу
3. Улучшить UI: показывать статистику посещаемости за день

**Текущий функционал:**
- Отметка статусов: present ✓, absent ✗, late ⏰, sick 🤒
- API работает через `PUT /attendance/` для обновления и `POST /attendance/bulk` для массовой отметки

**Требуется добавить:**
- Кнопка "Отметить всех присутствующими"
- Фильтрация групп для тренеров (как на /students)
- Счётчик "Присутствуют: X/Y"

---

## 3. 📅 Schedule - Не удаляется расписание

**Файлы:**
- `frontend/src/pages/Schedule.jsx` (строка ~133-141)
- `frontend/src/api/client.js` (строка ~323)
- `app/routers/schedule_templates.py` (строка ~255-284)

**Проблема:** При нажатии кнопки удаления расписания ничего не происходит.

**Диагностика:**
1. Проверить API вызов в консоли браузера (F12 -> Network)
2. Backend endpoint: `DELETE /api/v1/schedule/templates/{template_id}`
3. Frontend вызов: `scheduleAPI.deleteTemplate(templateId, false)`

**Вероятные причины:**
1. Ошибка CORS или авторизации
2. `canEdit` не равно `true` для текущего пользователя
3. Toast с ошибкой не отображается

**Код API клиента:**
```javascript
deleteTemplate: (id, deleteEvents = false) => 
  apiClient.delete(`/schedule/templates/${id}?delete_events=${deleteEvents}`)
```

**Рекомендация:** Добавить логирование в `handleDeleteTemplate`:
```javascript
const handleDeleteTemplate = async (templateId) => {
  console.log('Deleting template:', templateId, 'canEdit:', canEdit);
  if (!window.confirm('Удалить расписание?')) return;
  try {
    console.log('Calling API...');
    await scheduleAPI.deleteTemplate(templateId, false);
    console.log('Success');
    showToast('success', 'Расписание удалено');
    fetchData();
  } catch (error) {
    console.error('Delete error:', error);
    showToast('error', getErrorMessage(error));
  }
};
```

---

## 4. 💬 Support/Диалоги - Сообщения не доходят до админов

**Файлы:**
- `frontend/src/pages/Communications.jsx` (строка ~510-532)
- `app/routers/messages.py` (строка ~337-404, ~407-480)

**Проблема:** Сообщения от родителей/тренеров в техподдержку не отображаются у администраторов в разделе "Диалоги".

**Диагностика:**
1. Parent/Coach отправляет: `POST /api/v1/messages/support`
2. Admin получает список: `GET /api/v1/messages/support/chats`
3. Admin открывает чат: `GET /api/v1/messages/support/chat/{user_id}`

**Проверить:**
1. Эндпоинт `getSupportChats()` возвращает данные
2. В backend логах есть `📨 Support message from...`
3. Ответ API `supportChats` содержит сообщения

**Backend код отправки (messages.py:337-404):**
- Сообщение создаётся с `chat_type=ChatType.SUPPORT`
- Получатель = первый `super_admin` или `admin`

**Возможная ошибка:** 
- API `/support/chats` не возвращает чаты
- Проверить endpoint в messages.py - есть ли он?

**Добавить логирование:**
```javascript
const loadSupportData = async () => {
  setLoading(true);
  try {
    if (isAdmin) {
      console.log('Loading support chats for admin...');
      const chatsRes = await api.messages.getSupportChats();
      console.log('Support chats response:', chatsRes.data);
      setSupportChats(chatsRes.data || []);
    }
  } catch (err) {
    console.error('Failed to load support data:', err);
  }
};
```

---

## 5. 👥 Students - Ученики не отображаются у тренера

**Файлы:**
- `frontend/src/pages/Students.jsx` (строка ~482-489)

**Проблема:** У тренера пустая страница учеников, группы не видны.

**Текущий код фильтрации:**
```javascript
const displayGroups = isCoach 
  ? groups.filter(g => 
      g.coach_id === user?.id || 
      g.coaches?.some(c => c.id === user?.id || c.user_id === user?.id)
    )
  : groups;
```

**Диагностика:**
1. Проверить `user?.id` - правильно ли определяется ID тренера
2. Проверить `groups` - содержат ли группы поле `coach_id` или `coaches`
3. Добавить логирование:

```javascript
console.log('Current user:', user?.id, user?.role);
console.log('All groups:', groups);
console.log('Filtered groups:', displayGroups);
```

**Возможные причины:**
1. Тренер не назначен в группы (нет `coach_id` = user.id)
2. Мульти-тренеры: поле `coaches` пустое или имеет другой формат
3. API `/groups/` не возвращает поле `coach_id`

**Проверить в БД:**
```sql
SELECT id, name, coach_id FROM groups;
SELECT * FROM group_coaches;
```

---

## 6. 📊 Skills - Как тренеру отмечать навыки

**Файлы:**
- `frontend/src/pages/Students.jsx`
- `frontend/src/components/PlayerCard.jsx`
- `app/routers/skills.py`

**Текущий функционал:**
1. Тренер нажимает на имя/аватар ученика или кнопку "📊 Навыки"
2. Открывается `PlayerCard` модальное окно
3. В карточке кнопка "Оценить навыки" → форма оценки

**Параметры оценки (1-5 баллов):**
- Technique (Техника)
- Speed (Скорость)
- Discipline (Дисциплина)
- Teamwork (Командная игра)
- Endurance (Выносливость)

**API:**
- `POST /api/v1/skills/` - создать/обновить оценку
- `GET /api/v1/skills/student/{id}` - получить оценки ученика
- `GET /api/v1/skills/card/{id}` - получить полную карточку игрока

**Если не работает:**
1. Проверить что `PlayerCard` открывается
2. Проверить API вызов `skillsAPI.rateStudent(data)`
3. Проверить роль пользователя - только coach, admin, super_admin

---

## 📋 Чеклист для тестирования

### Под тренером (+373999999 / coach123):
- [ ] /schedule - видит только "Моё расписание", без кнопок редактирования
- [ ] /communications - НЕ видит вкладку "Рассылки"
- [ ] /students - видит учеников своих групп, кнопка "Навыки" работает
- [ ] /attendance - может отмечать посещаемость своих групп

### Под администратором (+37360000001 / super123):
- [ ] /schedule - может создавать/удалять расписания
- [ ] /communications - видит "Диалоги" с входящими сообщениями
- [ ] /students - видит всех учеников

### Под родителем:
- [ ] /communications - может писать в "Поддержка"
- [ ] Сообщение появляется у админа в "Диалоги"

---

## 🛠️ Команды для отладки

```bash
# Запустить backend с логами
./venv/bin/python -m uvicorn app.main:app --reload --port 8000

# Запустить frontend
cd frontend && npm run dev

# Проверить пользователя в БД
sqlite3 football_academy.db "SELECT id, phone, role FROM users WHERE phone = '+373999999';"

# Проверить группы тренера
sqlite3 football_academy.db "SELECT g.id, g.name, g.coach_id FROM groups g WHERE g.coach_id = (SELECT id FROM users WHERE phone = '+373999999');"
```

---

**Контакт для вопросов:** Предыдущий разработчик оставил код с комментариями на русском языке.
