"""
Timezone utilities for Moldova (Europe/Chisinau)
Централизованный модуль для работы с часовым поясом
"""
from datetime import datetime, date, time, timedelta
from zoneinfo import ZoneInfo
from typing import Optional

from .config import settings

# Moldova timezone
MOLDOVA_TZ = ZoneInfo(settings.TIMEZONE)


def now() -> datetime:
    """
    Get current datetime in Moldova timezone.
    Returns timezone-aware datetime.
    
    Usage:
        from app.core.timezone import now
        current_time = now()
    """
    return datetime.now(MOLDOVA_TZ)


def today() -> date:
    """
    Get current date in Moldova timezone.
    
    Usage:
        from app.core.timezone import today
        current_date = today()
    """
    return datetime.now(MOLDOVA_TZ).date()


def now_naive() -> datetime:
    """
    Get current datetime in Moldova timezone as naive datetime.
    For database columns that don't store timezone info.
    
    Usage:
        from app.core.timezone import now_naive
        created_at = now_naive()
    """
    return datetime.now(MOLDOVA_TZ).replace(tzinfo=None)


def localize(dt: datetime) -> datetime:
    """
    Add Moldova timezone to a naive datetime.
    
    Args:
        dt: Naive datetime
    
    Returns:
        Timezone-aware datetime in Moldova timezone
    """
    if dt.tzinfo is None:
        return dt.replace(tzinfo=MOLDOVA_TZ)
    return dt.astimezone(MOLDOVA_TZ)


def to_utc(dt: datetime) -> datetime:
    """
    Convert datetime to UTC.
    Useful for JWT tokens and external APIs.
    
    Args:
        dt: Datetime (naive assumed to be Moldova timezone)
    
    Returns:
        Timezone-aware datetime in UTC
    """
    from datetime import timezone as tz
    if dt.tzinfo is None:
        # Assume naive datetime is Moldova time
        dt = dt.replace(tzinfo=MOLDOVA_TZ)
    return dt.astimezone(tz.utc)


def from_utc(dt: datetime) -> datetime:
    """
    Convert UTC datetime to Moldova timezone.
    
    Args:
        dt: UTC datetime
    
    Returns:
        Timezone-aware datetime in Moldova timezone
    """
    from datetime import timezone as tz
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=tz.utc)
    return dt.astimezone(MOLDOVA_TZ)


def format_datetime(dt: datetime, fmt: str = "%d.%m.%Y %H:%M") -> str:
    """
    Format datetime for display in Moldova timezone.
    
    Args:
        dt: Datetime to format
        fmt: Format string (default: DD.MM.YYYY HH:MM)
    
    Returns:
        Formatted string
    """
    if dt.tzinfo is not None:
        dt = dt.astimezone(MOLDOVA_TZ)
    return dt.strftime(fmt)


def format_date(d: date, fmt: str = "%d.%m.%Y") -> str:
    """
    Format date for display.
    
    Args:
        d: Date to format
        fmt: Format string (default: DD.MM.YYYY)
    
    Returns:
        Formatted string
    """
    return d.strftime(fmt)


def format_time(t: time, fmt: str = "%H:%M") -> str:
    """
    Format time for display.
    
    Args:
        t: Time to format
        fmt: Format string (default: HH:MM)
    
    Returns:
        Formatted string
    """
    return t.strftime(fmt)


def start_of_day(d: Optional[date] = None) -> datetime:
    """
    Get start of day (00:00:00) in Moldova timezone.
    
    Args:
        d: Date (default: today)
    
    Returns:
        Datetime at 00:00:00
    """
    if d is None:
        d = today()
    return datetime.combine(d, time.min, tzinfo=MOLDOVA_TZ)


def end_of_day(d: Optional[date] = None) -> datetime:
    """
    Get end of day (23:59:59) in Moldova timezone.
    
    Args:
        d: Date (default: today)
    
    Returns:
        Datetime at 23:59:59
    """
    if d is None:
        d = today()
    return datetime.combine(d, time(23, 59, 59), tzinfo=MOLDOVA_TZ)


def get_timezone_name() -> str:
    """
    Get current timezone name (e.g., 'EET' or 'EEST' depending on DST).
    """
    return now().strftime('%Z')


def get_utc_offset() -> str:
    """
    Get current UTC offset (e.g., '+02:00' or '+03:00' depending on DST).
    """
    return now().strftime('%z')


# Export commonly used items
__all__ = [
    'MOLDOVA_TZ',
    'now',
    'today',
    'now_naive',
    'localize',
    'to_utc',
    'from_utc',
    'format_datetime',
    'format_date',
    'format_time',
    'start_of_day',
    'end_of_day',
    'get_timezone_name',
    'get_utc_offset',
]
