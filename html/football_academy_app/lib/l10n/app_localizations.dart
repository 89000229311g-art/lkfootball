import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:http/http.dart' as http;
import 'dart:convert';

class AppLocalizations {
  final Locale locale;

  AppLocalizations(this.locale);

  static AppLocalizations? of(BuildContext context) {
    return Localizations.of<AppLocalizations>(context, AppLocalizations);
  }

  static const LocalizationsDelegate<AppLocalizations> delegate = _AppLocalizationsDelegate();

  static final Map<String, Map<String, String>> _localizedValues = {
    'ru': {
      // General
      'app_name': 'Sunny Football Academy',
      'welcome': 'Добро пожаловать!',
      'login': 'Войти',
      'logout': 'Выйти',
      'cancel': 'Отмена',
      'save': 'Сохранить',
      'add': 'Добавить',
      'edit': 'Редактировать',
      'delete': 'Удалить',
      'confirm': 'Подтвердить',
      'error': 'Ошибка',
      'success': 'Успешно',
      'loading': 'Загрузка...',
      'no_data': 'Нет данных',
      'required_field': 'Обязательное поле',
      
      // Auth
      'phone': 'Номер телефона',
      'password': 'Пароль',
      'login_error': 'Неверный номер телефона или пароль',
      'enter_phone': 'Введите номер телефона',
      'enter_password': 'Введите пароль',
      
      // Navigation
      'home': 'Главная',
      'students': 'Ученики',
      'groups': 'Группы',
      'events': 'События',
      'attendance': 'Посещаемость',
      'payments': 'Платежи',
      'settings': 'Настройки',
      'profile': 'Профиль',
      'schedule': 'Расписание', // Renamed from Calendar
      'attendance_journal': 'Журнал посещений', // New
      'training_plan': 'План тренировки', // New
      'photo_report': 'Фотоотчет', // New
      
      // Home
      'statistics': 'Статистика',
      'quick_actions': 'Быстрые действия',
      'admin': 'Администратор',
      'coach': 'Тренер',
      'parent': 'Родитель',
      'super_admin': 'Руководитель академии',
      'role': 'Роль',
      
      // Students
      'add_student': 'Добавить ученика',
      'edit_student': 'Редактировать ученика',
      'delete_student': 'Удалить ученика?',
      'first_name': 'Имя',
      'last_name': 'Фамилия',
      'date_of_birth': 'Дата рождения',
      'child_phone': 'Телефон ребенка',
      'parent_phone': 'Телефон родителя',
      'group': 'Группа',
      'status': 'Статус',
      'active': 'Активный',
      'inactive': 'Неактивный',
      'no_group': 'Без группы',
      'no_students': 'Нет учеников',
      'height': 'Рост (см)', // New
      'weight': 'Вес (кг)', // New
      
      // Groups
      'add_group': 'Добавить группу',
      'edit_group': 'Редактировать группу',
      'delete_group': 'Удалить группу?',
      'name': 'Название',
      'description': 'Описание',
      'monthly_fee': 'Месячная оплата',
      'no_groups': 'Нет групп',
      
      // Events
      'add_event': 'Добавить событие',
      'edit_event': 'Редактировать событие',
      'delete_event': 'Удалить событие?',
      'title': 'Название',
      'event_type': 'Тип события',
      'event_date': 'Дата события',
      'start_time': 'Начало',
      'end_time': 'Конец',
      'location': 'Место',
      'training': 'Тренировка',
      'match': 'Игра',
      'game': 'Игра', // Alias
      'tournament': 'Турнир',
      'individual': 'Индивидуальная',
      'parent_meeting': 'Род. собрание',
      'medical': 'Медосмотр',
      'other': 'Другое',
      'all_groups': 'Все группы',
      'no_events': 'Нет событий',
      
      // Months & Days
      'mon': 'Пн', 'tue': 'Вт', 'wed': 'Ср', 'thu': 'Чт', 'fri': 'Пт', 'sat': 'Сб', 'sun': 'Вс',
      'jan': 'Январь', 'feb': 'Февраль', 'mar': 'Март', 'apr': 'Апрель',
      'may': 'Май', 'jun': 'Июнь', 'jul': 'Июль', 'aug': 'Август',
      'sep': 'Сентябрь', 'oct': 'Октябрь', 'nov': 'Ноябрь', 'dec': 'Декабрь',
      
      // Attendance
      'select_event': 'Выберите событие',
      'mark_attendance': 'Отметить посещаемость',
      'present': 'Присутствует',
      'absent': 'Отсутствует',
      'late': 'Опоздал',
      'excused': 'Уважительная причина',
      'not_marked': 'Не отмечен',
      
      // Payments
      'add_payment': 'Добавить платеж',
      'student': 'Ученик',
      'amount': 'Сумма',
      'payment_date': 'Дата платежа',
      'payment_type': 'Тип платежа',
      'receipt_number': 'Номер квитанции',
      'registration': 'Регистрация',
      'equipment': 'Экипировка',
      'total_payments': 'Всего платежей',
      'all_time': 'за все время',
      'no_payments': 'Нет платежей',
      
      // Settings
      'language': 'Язык',
      'theme': 'Тема',
      'notifications': 'Уведомления',
      'about': 'О приложении',
      'edit_profile': 'Редактировать профиль',
      'payment_history': 'История платежей',
      
      // Financial
      'debt': 'Задолженность',
      'debtor': 'Должник',
      'classes_balance': 'Баланс занятий',
      'classes_left': 'занятий осталось',
      'frozen': 'Заморожен',
      'freeze': 'Заморозить',
      'unfreeze': 'Разморозить',
      'medical_info': 'Мединфо',
      'subscription_expires': 'Абонемент до',
      'transfer_student': 'Перевести ученика',
      'group_history': 'История перемещений',
      'total_paid': 'Итого оплачено',
      'select_new_group': 'Выберите новую группу',
      'transfer': 'Перевести',
      'announcements': 'Объявления',
      'create_announcement': 'Создать объявление',
      'announcement_type': 'Тип объявления',
      'general': 'Общее',
      'group_specific': 'Групповое',
      'send': 'Отправить',
      'title_required': 'Введите заголовок',
      'content_required': 'Введите текст',
      
      // Parent Dashboard
      'my_children': 'Мои дети',
      'no_group': 'Без группы',
      'coach_label': 'Тренер',
      'attended': 'Посещено',
      'training_schedule': 'Расписание тренировок',
      'view_group_students': 'Посмотреть группу',
      'group_students': 'Ученики группы',
      'no_students_in_group': 'Нет учеников в группе',
      'my_child': 'Мой ребёнок',
      'close': 'Закрыть',
      'no_announcements': 'Пока нет объявлений',
      'open_chat': 'Открыть чат',
      'payment_period': 'Период оплаты',
      'no_linked_children': 'Нет связанных детей',
      
      // Subscription status
      'subscription_paid': 'Абонемент оплачен за',
      'pay_subscription': 'Оплатите абонемент за',
      'until_date': 'до',
      'debt_for': 'Долг за',
      
      // Analytics
      'analytics': 'Аналитика',
      'financial_analysis': 'Финансовый анализ',
      'week': 'Неделя',
      'month': 'Месяц',
      'year': 'Год',
      'previous': 'прошлый',
      'monthly_income': 'Доход за месяц',
      'total': 'всего',
      'statistics_label': 'Статистика',
      'configuration': 'Конфигурация',
      'events_calendar': 'Календарь событий',
      'management': 'Управление',
      'open_calendar': 'Открыть календарь',
      
      // Biometrics
      'confirm_login': 'Подтвердите вход в приложение',
      'confirm_enable_biometrics': 'Подтвердите для включения биометрии',
      'biometrics_not_confirmed': 'Биометрическая аутентификация не подтверждена',
      'face_id': 'Face ID',
      'fingerprint': 'Отпечаток пальца',
      'iris_scanner': 'Сканер радужки',
      'biometrics': 'Биометрия',
      'biometrics_unavailable': 'Биометрия недоступна',
      
      // Student Card Dialog
      'payment_history_title': '💳 История платежей',
      'hide': 'Скрыть',
      'show': 'Показать',
      'total_paid_label': 'Всего оплачено',
      'payments_count': 'Платежей',
      'no_payments_status': 'Платежей нет',
      'for_month': 'за',
      
      // Login Screen
      'quick_login_title': '⚡ Быстрый вход (одним нажатием)',
      'or_enter_manually': 'Или введите данные вручную:',
      'login_as': 'Вход как',
      'quick_test_login': 'Тестовый вход',
      
      // Home Screen
      'my_groups': 'Мои группы',
      'communications': 'Коммуникации',
      'my_salary': 'Моя зарплата',
      'chats': 'Чаты',
      'dashboard_title': 'Панель управления',
      'dashboard_short': 'Панель',
      'admin_role': 'Администратор',
      'super_admin_role': 'Руководитель',
      'users': 'Пользователи',
      'parents_coaches': 'Родители/Тренеры',
      'mark_attendance_subtitle': 'Отметка учеников',
      'create_edit': 'Создание и ред.',
      'chat': 'Чат',
      'messages': 'Сообщения',
      'income_expenses': 'Доходы/Расходы',
      'academy_stats': 'Статистика академии',
      
      // Coach Screens
      'select_media_or_text': 'Выберите фото/видео или напишите текст',
      'photo_report_published': 'Фото-отчет опубликован!',
      'no_active_groups': 'У вас нет активных групп',
      'select_group': 'Выберите группу',
      'click_to_select_photo': 'Нажмите, чтобы выбрать фото',
      'or_select_video': 'Или выберите видео',
      'report_comment': 'Комментарий к отчету',
      'report_hint': 'Опишите, как прошла тренировка...',
      'sending': 'Отправка...',
      'send_report': 'Отправить отчет',
      'no_assigned_groups': 'Вам не назначены группы',
      'refresh': 'Обновить',
      'attendance_hint': '💡 Отметка посещений — в разделе «Расписание»',
      'no_trainings_in': 'Нет тренировок в',
      'trainings_count': 'Тренировок',
      'students_count': 'Учеников',
      'attendance_rate': 'Посещаемость',
      'year_dynamics': '📈 Динамика за год',
      'feed': 'Лента',
      'personal': 'Личные',
      'notifications_short': 'Увед.',
      'no_announcements_subtitle': 'Объявления появятся здесь',
      'administration': 'Администрация',
      'general_announcement': 'Общее объявление',
      'no_groups_subtitle': 'У вас пока нет назначенных групп',
      'parents_of_students': 'Родители учеников',
      'no_contacts': 'Нет доступных контактов',
      'no_notifications_subtitle': 'Уведомления об изменениях появятся здесь',
      'training_cancelled': 'Тренировка отменена',
      'training_rescheduled': 'Тренировка перенесена',
      'training_added': 'Добавлена тренировка',
      'schedule_change': 'Изменение расписания',
      'start_chatting': 'Начните общение',
      'enter_message': 'Введите сообщение...',
      'today': 'Сегодня',
      
      // Groups Screen
      'create_group': 'Создать группу',
      'group_name_required': 'Название группы *',
      'age_group': 'Возрастная группа',
      'age_group_hint': 'Например: 2015 или U-10',
      'cost_mdl': '💰 Стоимость (MDL)',
      'subscription_type': 'Тип абонемента',
      'by_classes': '📊 По занятиям',
      'by_calendar': '📅 По календарю',
      'classes_per_month': 'Занятий в месяц',
      'payment_due_date': 'Оплата до (число месяца)',
      'select_coach': 'Выберите тренера',
      'no_coach': 'Без тренера',
      'enter_group_name_error': 'Введите название группы',
      'delete_group_confirmation': 'Вы уверены, что хотите удалить эту группу? Это может повлиять на связанных учеников.',
      'search_hint': '🔍 Поиск по названию, тренеру...',
      'found_count': 'Найдено',
      'nothing_found': 'Ничего не найдено',

      // Home Screen Items
      'newsletters': 'Рассылки',
      'sms_notifications': 'SMS уведомления',
      'news': 'Новости',
      'announcements_feed': 'Лента объявлений',
      'booking': 'Бронь',
      'individual_trainings': 'Индивид. тренировки',
      'weekly_view': 'Недельный вид',
      'templates': 'Шаблоны',
      'schedule_management': 'Управление расписанием',
      'salaries': 'Зарплаты',
      'salary_management': 'Управление ЗП',
      'salary_management_title': 'Управление зарплатами',
      'available_in_web': 'Доступно в веб-версии',
      'payments_and_advances': 'Выплаты и авансы',
      'failed_to_load': 'Не удалось загрузить',
      'for_group': 'Для группы',
      'image_load_error': 'Ошибка загрузки изображения',
      
      // Settings Screen
      'your_password': 'Ваш пароль',
      'login_credential': 'Логин',
      'contact_admin_for_password': 'Для изменения пароля обратитесь к руководителю',
      'change_password_title': 'Изменить пароль',
      'current_password': 'Текущий пароль',
      'new_password': 'Новый пароль',
      'confirm_password': 'Подтвердите пароль',
      'passwords_do_not_match': 'Пароли не совпадают',
      'password_min_length': 'Пароль должен быть не менее 6 символов',
      'password_changed_success': 'Пароль успешно изменен',
      'password_view_title': 'Посмотреть пароль',
      'password_view_subtitle': 'Просмотр ваших учётных данных',
      'only_owner_can_change': 'Только руководитель может менять пароль',
      'version': 'Версия',
      'developer': 'Разработчик',
      'logout_confirmation': 'Вы уверены что хотите выйти?',
      'view_password': 'Посмотреть пароль',
      
      // Profile Screen
      'choose_photo_source': 'Выберите источник',
      'camera': 'Камера',
      'gallery': 'Галерея',
      'photo_uploaded': 'Фото загружено!',
      'upload_error': 'Ошибка загрузки',
      'delete_photo': 'Удалить фото?',
      'delete_photo_confirm': 'Вы уверены?',
      'photo_deleted': 'Фото удалено',
      'delete_error': 'Ошибка удаления',
      'profile_updated': 'Профиль обновлён!',
      'phone_secondary': 'Резервный телефон',
      'optional': 'Опционально',
      'full_name': 'Имя',
      'academy_director': 'Руководитель академии',
      'administrator': 'Администратор',
      'trainer': 'Тренер',
      'change_password': 'Сменить пароль',
      'only_for_director': 'Только для Руководителя',

      // Coach Group Students Screen
      'students_lower': 'учеников',
      'active_lower': 'активных',
      'sort_by_name': 'По имени',
      'sort_by_age': 'По возрасту',
      'search_student_hint': '🔍 Поиск ученика...',
      'total_label': 'Всего',
      'active_short': 'Активных',
      'years_old': 'лет',
      'student_not_found': 'Ученик не найден',
      'no_students_in_group_label': 'В группе нет учеников',

      // Coach Player Card Screen
      'player_card': 'Карточка игрока',
      'evaluate': 'Оценить',
      'rate_skills': '📝 Оценить навыки',
      'skills_label': '📊 Навыки',
      'coach_comment_hint': 'Комментарий тренера...',
      'save_rating': '💾 Сохранить оценку',
      'rating_saved': '✅ Оценка сохранена!',
      'technique': '⚡ Техника',
      'speed': '🏃 Скорость',
      'discipline': '📋 Дисциплина',
      'teamwork': '🤝 Командность',
      'endurance': '💪 Выносливость',
      'info_label': '📋 Информация',
      'group_label': '👥 Группа',
      'dob_label': '📅 Дата рождения',
      'status_label': '📍 Статус',
      'attendance_label': '✅ Посещаемость',
      'rating_history': '📈 История оценок',
      
      // Attendance Marking
      'attendance_saved': '✅ Посещаемость сохранена!',
      'mark_all_present': 'Все присутствовали',
      'saving': 'Сохранение...',
      'were_present': 'Были',
      'were_absent': 'Н/Б',
      'were_late': 'Опоздали',
      'were_sick': 'Болели',
      'was_present': 'Был',
      'was_absent': 'Н/Б',
      'was_late': 'Опоздал',
      'was_sick': 'Болел',
      'no_students_in_group': 'Нет учеников в группе',
    },
    'ro': {
      // General
      'app_name': 'Sunny Football Academy',
      'welcome': 'Bine ați venit!',
      'login': 'Autentificare',
      'logout': 'Deconectare',
      'cancel': 'Anulare',
      'save': 'Salvare',
      'add': 'Adăugare',
      'edit': 'Editare',
      'delete': 'Ștergere',
      'confirm': 'Confirmare',
      'error': 'Eroare',
      'success': 'Succes',
      'loading': 'Se încarcă...',
      'no_data': 'Fără date',
      'required_field': 'Câmp obligatoriu',
      
      // Auth
      'phone': 'Număr de telefon',
      'password': 'Parolă',
      'login_error': 'Număr de telefon sau parolă incorectă',
      'enter_phone': 'Introduceți numărul de telefon',
      'enter_password': 'Introduceți parola',
      
      // Navigation
      'home': 'Acasă',
      'students': 'Elevi',
      'groups': 'Grupuri',
      'events': 'Evenimente',
      'attendance': 'Prezență',
      'payments': 'Plăți',
      'settings': 'Setări',
      'profile': 'Profil',
      'schedule': 'Program', // Renamed from Calendar
      'attendance_journal': 'Jurnal de prezență', // New
      'training_plan': 'Planul de antrenament', // New
      'photo_report': 'Raport foto', // New
      
      // Home
      'statistics': 'Statistici',
      'quick_actions': 'Acțiuni rapide',
      'admin': 'Administrator',
      'coach': 'Antrenor',
      'parent': 'Părinte',
      'super_admin': 'Proprietar',
      'role': 'Rol',
      
      // Students
      'add_student': 'Adaugă elev',
      'edit_student': 'Editează elev',
      'delete_student': 'Ștergeți elevul?',
      'first_name': 'Prenume',
      'last_name': 'Nume',
      'date_of_birth': 'Data nașterii',
      'child_phone': 'Telefonul copilului',
      'parent_phone': 'Telefonul părintelui',
      'group': 'Grup',
      'status': 'Status',
      'active': 'Activ',
      'inactive': 'Inactiv',
      'no_group': 'Fără grup',
      'no_students': 'Fără elevi',
      'height': 'Înălțime (cm)', // New
      'weight': 'Greutate (kg)', // New
      
      // Groups
      'add_group': 'Adaugă grup',
      'edit_group': 'Editează grup',
      'delete_group': 'Ștergeți grupul?',
      'name': 'Nume',
      'description': 'Descriere',
      'monthly_fee': 'Taxă lunară',
      'no_groups': 'Fără grupuri',
      
      // Events
      'add_event': 'Adaugă eveniment',
      'edit_event': 'Editează eveniment',
      'delete_event': 'Ștergeți evenimentul?',
      'title': 'Titlu',
      'event_type': 'Tip eveniment',
      'event_date': 'Data evenimentului',
      'start_time': 'Ora de început',
      'end_time': 'Ora de sfârșit',
      'location': 'Locație',
      'training': 'Antrenament',
      'match': 'Joc',
      'game': 'Joc', // Alias
      'tournament': 'Turneu',
      'individual': 'Individual',
      'parent_meeting': 'Ședință cu părinții',
      'medical': 'Control medical',
      'other': 'Altele',
      'all_groups': 'Toate grupurile',
      'no_events': 'Fără evenimente',
      
      // Months & Days
      'mon': 'Lu', 'tue': 'Ma', 'wed': 'Mi', 'thu': 'Jo', 'fri': 'Vi', 'sat': 'Sâ', 'sun': 'Du',
      'jan': 'Ianuarie', 'feb': 'Februarie', 'mar': 'Martie', 'apr': 'Aprilie',
      'may': 'Mai', 'jun': 'Iunie', 'jul': 'Iulie', 'aug': 'August',
      'sep': 'Septembrie', 'oct': 'Octombrie', 'nov': 'Noiembrie', 'dec': 'Decembrie',
      
      // Attendance
      'select_event': 'Selectați evenimentul',
      'mark_attendance': 'Marchează prezența',
      'present': 'Prezent',
      'absent': 'Absent',
      'late': 'Întârziat',
      'excused': 'Motivat',
      'not_marked': 'Nemarcat',
      
      // Payments
      'add_payment': 'Adaugă plată',
      'student': 'Elev',
      'amount': 'Sumă',
      'payment_date': 'Data plății',
      'payment_type': 'Tip plată',
      'receipt_number': 'Număr chitanță',
      'registration': 'Înregistrare',
      'equipment': 'Echipament',
      'total_payments': 'Total plăți',
      'all_time': 'din tot timpul',
      'no_payments': 'Fără plăți',
      
      // Settings
      'language': 'Limbă',
      'theme': 'Temă',
      'notifications': 'Notificări',
      'about': 'Despre',
      'edit_profile': 'Editează profilul',
      'payment_history': 'Istoricul plăților',
      
      // Financial
      'debt': 'Datorie',
      'debtor': 'Debitor',
      'classes_balance': 'Balanță antrenamente',
      'classes_left': 'antrenamente rămase',
      'frozen': 'Înghețat',
      'freeze': 'Îngheță',
      'unfreeze': 'Dezgheță',
      'medical_info': 'Info medical',
      'subscription_expires': 'Abonament până la',
      'transfer_student': 'Transferă elevul',
      'group_history': 'Istoricul transferurilor',
      'total_paid': 'Total achitat',
      'select_new_group': 'Selectați grupul nou',
      'transfer': 'Transferă',
      'announcements': 'Anunțuri',
      'create_announcement': 'Creează anunț',
      'announcement_type': 'Tip anunț',
      'general': 'General',
      'group_specific': 'Specific grupului',
      'send': 'Trimite',
      'title_required': 'Introduceți titlul',
      'content_required': 'Introduceți textul',
      
      // Parent Dashboard
      'my_children': 'Copiii mei',
      'no_group': 'Fără grup',
      'coach_label': 'Antrenor',
      'attended': 'Prezențe',
      'training_schedule': 'Programul antrenamentelor',
      'view_group_students': 'Vezi grupa',
      'group_students': 'Elevii grupului',
      'no_students_in_group': 'Nu există elevi în grup',
      'my_child': 'Copilul meu',
      'close': 'Închide',
      'no_announcements': 'Nu există anunțuri',
      'open_chat': 'Deschide chat',
      'payment_period': 'Perioada de plată',
      'no_linked_children': 'Nu există copii asociați',
      
      // Subscription status
      'subscription_paid': 'Abonament achitat pentru',
      'pay_subscription': 'Achitați abonamentul pentru',
      'until_date': 'până la',
      'debt_for': 'Datorie pentru',
      
      // Analytics
      'analytics': 'Analize',
      'financial_analysis': 'Analiză financiară',
      'week': 'Săptămână',
      'month': 'Lună',
      'year': 'An',
      'previous': 'anterior',
      'monthly_income': 'Venit lunar',
      'total': 'total',
      'statistics_label': 'Statistici',
      'configuration': 'Configurație',
      'events_calendar': 'Calendar evenimente',
      'management': 'Management',
      'open_calendar': 'Deschide calendarul',
      
      // Biometrics
      'confirm_login': 'Confirmați autentificarea',
      'confirm_enable_biometrics': 'Confirmați pentru a activa biometria',
      'biometrics_not_confirmed': 'Autentificarea biometrică nu a fost confirmată',
      'face_id': 'Face ID',
      'fingerprint': 'Amprentă',
      'iris_scanner': 'Scaner de iris',
      'biometrics': 'Biometrie',
      'biometrics_unavailable': 'Biometria nu este disponibilă',
      
      // Student Card Dialog
      'payment_history_title': '💳 Istoric plăți',
      'hide': 'Ascunde',
      'show': 'Arată',
      'total_paid_label': 'Total achitat',
      'payments_count': 'Plăți',
      'no_payments_status': 'Fără plăți',
      'for_month': 'pentru',
      
      // Login Screen
      'quick_login_title': '⚡ Autentificare rapidă (un singur click)',
      'or_enter_manually': 'Sau introduceți datele manual:',
      'login_as': 'Autentificare ca',
      'quick_test_login': 'Autentificare de test',
      
      // Home Screen
      'my_groups': 'Grupurile mele',
      'communications': 'Comunicare',
      'my_salary': 'Salariul meu',
      'chats': 'Chat-uri',
      'dashboard_title': 'Panou de control',
      'dashboard_short': 'Panou',
      'admin_role': 'Administrator',
      'super_admin_role': 'Director',
      'users': 'Utilizatori',
      'parents_coaches': 'Părinți/Antrenori',
      'mark_attendance_subtitle': 'Marcare prezență',
      'create_edit': 'Creare și editare',
      'chat': 'Chat',
      'messages': 'Mesaje',
      'income_expenses': 'Venituri/Cheltuieli',
      'academy_stats': 'Statistica academiei',
      
      // Coach Screens
      'select_media_or_text': 'Selectați foto/video sau scrieți text',
      'photo_report_published': 'Raport foto publicat!',
      'no_active_groups': 'Nu aveți grupuri active',
      'select_group': 'Selectați grupul',
      'click_to_select_photo': 'Apăsați pentru a selecta foto',
      'or_select_video': 'Sau selectați video',
      'report_comment': 'Comentariu la raport',
      'report_hint': 'Descrieți cum a decurs antrenamentul...',
      'sending': 'Se trimite...',
      'send_report': 'Trimite raport',
      'no_assigned_groups': 'Nu aveți grupuri atribuite',
      'refresh': 'Reîmprospătare',
      'attendance_hint': '💡 Prezența — în secțiunea «Program»',
      'no_trainings_in': 'Fără antrenamente în',
      'trainings_count': 'Antrenamente',
      'students_count': 'Elevi',
      'attendance_rate': 'Prezență',
      'year_dynamics': '📈 Dinamica anuală',
      'feed': 'Flux',
      'personal': 'Personal',
      'notifications_short': 'Notif.',
      'no_announcements_subtitle': 'Anunțurile vor apărea aici',
      'administration': 'Administrație',
      'general_announcement': 'Anunț general',
      'no_groups_subtitle': 'Nu aveți grupuri atribuite încă',
      'parents_of_students': 'Părinții elevilor',
      'no_contacts': 'Fără contacte disponibile',
      'no_notifications_subtitle': 'Notificările despre modificări vor apărea aici',
      'training_cancelled': 'Antrenament anulat',
      'training_rescheduled': 'Antrenament reprogramat',
      'training_added': 'Antrenament adăugat',
      'schedule_change': 'Modificare program',
      'start_chatting': 'Începeți conversația',
      'enter_message': 'Introduceți mesajul...',
      'today': 'Astăzi',
      
      // Groups Screen
      'create_group': 'Creează grup',
      'group_name_required': 'Numele grupului *',
      'age_group': 'Grupa de vârstă',
      'age_group_hint': 'Exemplu: 2015 sau U-10',
      'cost_mdl': '💰 Cost (MDL)',
      'subscription_type': 'Tip abonament',
      'by_classes': '📊 Per antrenament',
      'by_calendar': '📅 Calendaristic',
      'classes_per_month': 'Antrenamente pe lună',
      'payment_due_date': 'Termen de plată (ziua)',
      'select_coach': 'Selectați antrenorul',
      'no_coach': 'Fără antrenor',
      'enter_group_name_error': 'Introduceți numele grupului',
      'delete_group_confirmation': 'Sunteți sigur că doriți să ștergeți acest grup? Poate afecta elevii asociați.',
      'search_hint': '🔍 Căutare după nume, antrenor...',
      'found_count': 'Găsit',
      'nothing_found': 'Nimic găsit',

      // Home Screen Items
      'newsletters': 'Buletine',
      'sms_notifications': 'Notificări SMS',
      'news': 'Știri',
      'announcements_feed': 'Flux de anunțuri',
      'booking': 'Rezervări',
      'individual_trainings': 'Antrenamente individuale',
      'weekly_view': 'Vizualizare săptămânală',
      'templates': 'Șabloane',
      'schedule_management': 'Gestionare program',
      'salaries': 'Salarii',
      'salary_management': 'Gestionare salarii',
      'salary_management_title': 'Gestionare salarii',
      'available_in_web': 'Disponibil în versiunea web',
      'payments_and_advances': 'Plăți și avansuri',
      'failed_to_load': 'Eroare la încărcare',
      'for_group': 'Pentru grup',
      'image_load_error': 'Eroare la încărcarea imaginii',

      // Settings Screen
      'your_password': 'Parola dumneavoastră',
      'login_credential': 'Login',
      'contact_admin_for_password': 'Contactați directorul pentru schimbarea parolei',
      'change_password_title': 'Schimbare parolă',
      'current_password': 'Parola curentă',
      'new_password': 'Parola nouă',
      'confirm_password': 'Confirmați parola',
      'passwords_do_not_match': 'Parolele nu coincid',
      'password_min_length': 'Parola trebuie să aibă cel puțin 6 caractere',
      'password_changed_success': 'Parola a fost schimbată cu succes',
      'password_view_title': 'Vizualizare parolă',
      'password_view_subtitle': 'Vizualizați datele de autentificare',
      'only_owner_can_change': 'Doar directorul poate schimba parola',
      'version': 'Versiune',
      'developer': 'Dezvoltator',
      'logout_confirmation': 'Sunteți sigur că doriți să ieșiți?',
      'view_password': 'Vizualizare parolă',
      
      // Profile Screen
      'choose_photo_source': 'Alegeți sursa',
      'camera': 'Cameră',
      'gallery': 'Galerie',
      'photo_uploaded': 'Fotografie încărcată!',
      'upload_error': 'Eroare la încărcare',
      'delete_photo': 'Ștergeți fotografia?',
      'delete_photo_confirm': 'Sunteți sigur?',
      'photo_deleted': 'Fotografie ștearsă',
      'delete_error': 'Eroare la ștergere',
      'profile_updated': 'Profil actualizat!',
      'phone_secondary': 'Telefon de rezervă',
      'optional': 'Opțional',
      'full_name': 'Nume complet',
      'academy_director': 'Directorul academiei',
      'administrator': 'Administrator',
      'trainer': 'Antrenor',
      'change_password': 'Schimbă parola',
      'only_for_director': 'Doar pentru Director',

      // Coach Group Students Screen
      'students_lower': 'elevi',
      'active_lower': 'activi',
      'sort_by_name': 'După nume',
      'sort_by_age': 'După vârstă',
      'search_student_hint': '🔍 Căutare elev...',
      'total_label': 'Total',
      'active_short': 'Activi',
      'years_old': 'ani',
      'student_not_found': 'Elevul nu a fost găsit',
      'no_students_in_group_label': 'Nu sunt elevi în grup',

      // Coach Player Card Screen
      'player_card': 'Fișa jucătorului',
      'evaluate': 'Evaluează',
      'rate_skills': '📝 Evaluează abilitățile',
      'skills_label': '📊 Abilități',
      'coach_comment_hint': 'Comentariul antrenorului...',
      'save_rating': '💾 Salvează evaluarea',
      'rating_saved': '✅ Evaluare salvată!',
      'technique': '⚡ Tehnică',
      'speed': '🏃 Viteză',
      'discipline': '📋 Disciplină',
      'teamwork': '🤝 Lucru în echipă',
      'endurance': '💪 Rezistență',
      'info_label': '📋 Informație',
      'group_label': '👥 Grup',
      'dob_label': '📅 Data nașterii',
      'status_label': '📍 Status',
      'attendance_label': '✅ Prezență',
      'rating_history': '📈 Istoric evaluări',

      // Attendance Marking
      'attendance_saved': '✅ Prezență salvată!',
      'mark_all_present': 'Toți prezenți',
      'saving': 'Se salvează...',
      'were_present': 'Au fost',
      'were_absent': 'Absenți',
      'were_late': 'Întârziați',
      'were_sick': 'Bolnavi',
      'was_present': 'A fost',
      'was_absent': 'Absent',
      'was_late': 'Întârziat',
      'was_sick': 'Bolnav',
      'no_students_in_group': 'Nu sunt elevi în grup',
    },
  };

  String translate(String key) {
    return _localizedValues[locale.languageCode]?[key] ?? 
           _localizedValues['ru']?[key] ?? 
           key;
  }
}

class _AppLocalizationsDelegate extends LocalizationsDelegate<AppLocalizations> {
  const _AppLocalizationsDelegate();

  @override
  bool isSupported(Locale locale) {
    return ['ru', 'ro'].contains(locale.languageCode);
  }

  @override
  Future<AppLocalizations> load(Locale locale) async {
    return AppLocalizations(locale);
  }

  @override
  bool shouldReload(_AppLocalizationsDelegate old) => false;
}

// Language Provider
class LanguageProvider with ChangeNotifier {
  Locale _locale = const Locale('ru');
  
  Locale get locale => _locale;

  LanguageProvider() {
    _loadSavedLanguage();
  }

  Future<void> _loadSavedLanguage() async {
    final prefs = await SharedPreferences.getInstance();
    final langCode = prefs.getString('language_code') ?? 'ru';
    
    // Проверяем что сохраненный язык поддерживается
    if (langCode == 'ru' || langCode == 'ro') {
      _locale = Locale(langCode);
    } else {
      // Если сохранён неподдерживаемый язык (например en), используем ru
      _locale = const Locale('ru');
      await prefs.setString('language_code', 'ru');
    }
    
    notifyListeners();
  }

  Future<void> setLocale(Locale locale) async {
    if (_locale == locale) return;
    
    _locale = locale;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('language_code', locale.languageCode);
    
    // Синхронизируем с бэкендом
    await _syncLanguageWithBackend(locale.languageCode);
    
    notifyListeners();
  }
  
  Future<void> _syncLanguageWithBackend(String langCode) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final token = prefs.getString('token');
      
      if (token == null) return;
      
      // Используем baseUrl из конфига
      const baseUrl = 'http://10.0.2.2:8000'; // Для Android эмулятора
      
      final response = await http.put(
        Uri.parse('$baseUrl/api/v1/auth/me/language'),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer $token',
        },
        body: jsonEncode({'language': langCode}),
      );
      
      if (response.statusCode == 200) {
        print('✅ Language synced with backend: $langCode');
      } else {
        print('⚠️ Language sync status: ${response.statusCode}');
      }
    } catch (e) {
      print('❌ Failed to sync language: $e');
    }
  }

  String getLanguageName(String code) {
    switch (code) {
      case 'ru': return 'Русский';
      case 'ro': return 'Română';
      default: return code;
    }
  }
}

// Extension for easier access
extension AppLocalizationsExtension on BuildContext {
  AppLocalizations get l10n => AppLocalizations.of(this)!;
}
