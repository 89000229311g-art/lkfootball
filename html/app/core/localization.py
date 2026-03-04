"""
Конфигурация локализации
Оптимизировано для RO/RU (молдавский/русский)
"""

# Поддерживаемые языки
SUPPORTED_LANGUAGES = {
    "ro": {
        "name": "Română",
        "flag": "🇲🇩",
        "default": False
    },
    "ru": {
        "name": "Русский",
        "flag": "🇷🇺",
        "default": True
    }
}

DEFAULT_LANGUAGE = "ru"

def get_month_name_ru(month_num: int) -> str:
    months = {
        1: "Январь", 2: "Февраль", 3: "Март", 4: "Апрель",
        5: "Май", 6: "Июнь", 7: "Июль", 8: "Август",
        9: "Сентябрь", 10: "Октябрь", 11: "Ноябрь", 12: "Декабрь"
    }
    return months.get(month_num, "")

# Словарь переводов для backend
TRANSLATIONS = {
    # Common
    "success": {
        "ro": "Succes",
        "ru": "Успешно"
    },
    "error": {
        "ro": "Eroare",
        "ru": "Ошибка"
    },
    "not_found": {
        "ro": "Nu a fost găsit",
        "ru": "Не найдено"
    },
    "unauthorized": {
        "ro": "Neautorizat",
        "ru": "Неавторизован"
    },
    "forbidden": {
        "ro": "Interzis",
        "ru": "Запрещено"
    },
    
    # Students
    "student": {
        "ro": "Elev",
        "ru": "Ученик"
    },
    "students": {
        "ro": "Elevi",
        "ru": "Ученики"
    },
    "student_created": {
        "ro": "Elev creat cu succes",
        "ru": "Ученик успешно создан"
    },
    
    # Payments
    "payment": {
        "ro": "Plată",
        "ru": "Платёж"
    },
    "payment_received": {
        "ro": "Plată primită",
        "ru": "Платёж получен"
    },
    "debt": {
        "ro": "Datorie",
        "ru": "Долг"
    },
    
    # Groups
    "group": {
        "ro": "Grup",
        "ru": "Группа"
    },
    "groups": {
        "ro": "Grupuri",
        "ru": "Группы"
    },
    
    # Training
    "training": {
        "ro": "Antrenament",
        "ru": "Тренировка"
    },
    "attendance": {
        "ro": "Prezență",
        "ru": "Посещаемость"
    },
    
    # SMS Templates
    "sms_payment_received": {
        "ro": "Plată primită: {amount} MDL pentru {month}. Mulțumim!",
        "ru": "Оплата получена: {amount} MDL за {month}. Спасибо!"
    },
    "sms_debt_reminder": {
        "ro": "Reamintire: datorie de {amount} MDL pentru {month}.",
        "ru": "Напоминание: задолженность {amount} MDL за {month}."
    },
    "sms_training_reminder": {
        "ro": "Antrenament mâine la {time}. Să nu uităm!",
        "ru": "Тренировка завтра в {time}. Не забудьте!"
    }
}

def get_translation(key: str, lang: str = DEFAULT_LANGUAGE, **kwargs) -> str:
    """
    Получение перевода по ключу.
    
    Args:
        key: ключ перевода
        lang: язык (ro/ru)
        **kwargs: параметры для форматирования
    
    Returns:
        Переведённая строка
    """
    if lang not in SUPPORTED_LANGUAGES:
        lang = DEFAULT_LANGUAGE
    
    translation = TRANSLATIONS.get(key, {}).get(lang, key)
    
    # Форматирование строки если есть параметры
    if kwargs:
        try:
            translation = translation.format(**kwargs)
        except KeyError:
            pass
    
    return translation

def get_user_language(user = None) -> str:
    """
    Определение языка пользователя из БД.
    
    Args:
        user: объект User из БД
    
    Returns:
        Код языка (ro/ru)
    """
    if user and hasattr(user, 'preferred_language'):
        lang = user.preferred_language
        if lang in SUPPORTED_LANGUAGES:
            return lang
    
    # Возвращаем дефолтный если не указан
    return DEFAULT_LANGUAGE

# Экспорт для удобства
__all__ = [
    'SUPPORTED_LANGUAGES',
    'DEFAULT_LANGUAGE',
    'TRANSLATIONS',
    'get_translation',
    'get_user_language'
]
