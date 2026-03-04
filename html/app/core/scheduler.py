"""
Scheduler Service - Планировщик фоновых задач
Использует APScheduler
"""
import logging
from datetime import datetime, timedelta
import pytz
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

from app.services.analytics_export_service import export_monthly_analytics_task
from app.services.payment_service import generate_monthly_invoices
from app.services.birthday_service import process_daily_birthdays
from app.core.database import SessionLocal
from app.core.config import settings
from app.models import SchoolSettings, User
from app.models.message import Message, ChatType
from app.core.cleanup import cleanup_old_data
import psutil

logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler()

def setup_scheduler():
    """Настройка планировщика (добавление задач)"""
    # Timezone for scheduler
    tz = pytz.timezone(settings.TIMEZONE)
    
    # Добавляем задачи
    
    # 1. Ежемесячный экспорт аналитики в Google Drive
    # Запуск 1-го числа каждого месяца в 03:00 ночи
    # Генерирует отчет за предыдущий месяц
    scheduler.add_job(
        _monthly_export_job,
        CronTrigger(day=1, hour=3, minute=0, timezone=tz),
        id="monthly_analytics_export",
        replace_existing=True
    )
    
    # 2. Ежедневная генерация счетов (Daily Invoice Generation)
    # Запуск в 04:00. Проверяет, является ли сегодня 25-м числом.
    # DISABLED per user request: "Wait for manual invoice generation"
    # scheduler.add_job(
    #     _invoice_generation_job,
    #     CronTrigger(hour=4, minute=0, timezone=tz),
    #     id="daily_invoice_generation",
    #     replace_existing=True
    # )

    # 3. Ежедневные поздравления с Днём Рождения
    # Запуск в 09:00 утра.
    scheduler.add_job(
        process_daily_birthdays,
        CronTrigger(hour=9, minute=0, timezone=tz),
        id="daily_birthday_greetings",
        replace_existing=True
    )
    # 4. Ежедневная автоочистка (настраиваемая)
    try:
        db = SessionLocal()
        try:
            cfg = _load_cleanup_schedule(db)
            scheduler.add_job(
                _cleanup_job_wrapper,
                CronTrigger(
                    day_of_week=cfg["days_of_week"],
                    hour=cfg["hour"],
                    minute=cfg["minute"],
                    timezone=tz
                ),
                id="daily_cleanup_job",
                replace_existing=True
            )
            logger.info(f"🧹 Cleanup scheduled at {cfg['hour']:02d}:{cfg['minute']:02d} on {cfg['days_of_week']}")
        finally:
            db.close()
    except Exception as e:
        logger.error(f"❌ Failed to schedule cleanup job: {e}")

    # 5. Мониторинг ресурсов и оповещения (настраиваемо)
    try:
        db = SessionLocal()
        try:
            cfg = _load_alerts_config(db)
            if cfg["enabled"]:
                scheduler.add_job(
                    _health_check_job,
                    CronTrigger(minute=f"*/{max(1, cfg['check_interval_minutes'])}", timezone=tz),
                    id="resource_health_alerts",
                    replace_existing=True
                )
                logger.info(f"🔔 Resource alerts enabled (interval {cfg['check_interval_minutes']}m)")
        finally:
            db.close()
    except Exception as e:
        logger.error(f"❌ Failed to schedule resource alerts job: {e}")


def start_scheduler():
    """Запуск планировщика"""
    if not scheduler.running:
        setup_scheduler()
        scheduler.start()
        logger.info(f"⏰ Scheduler started (Timezone: {settings.TIMEZONE})")

def _invoice_generation_job():
    """Wrapper for invoice generation with DB session"""
    logger.info("⏰ Triggering invoice generation job")
    db = SessionLocal()
    try:
        result = generate_monthly_invoices(db)
        logger.info(f"✅ Invoice job result: {result}")
    except Exception as e:
        logger.error(f"❌ Error in invoice generation job: {str(e)}")
    finally:
        db.close()

def _monthly_export_job():
    """Wrapper to calculate previous month"""
    today = datetime.now()
    # First day of current month
    first_day = today.replace(day=1)
    # Last day of previous month
    prev_month_last_day = first_day - timedelta(days=1)
    
    year = prev_month_last_day.year
    month = prev_month_last_day.month
    
    logger.info(f"⏰ Triggering monthly export for {month}.{year}")
    export_monthly_analytics_task(year, month)

def _load_cleanup_schedule(db):
    rows = db.query(SchoolSettings).filter(SchoolSettings.group == "cleanup").all()
    m = {r.key: (r.value or "").strip() for r in rows}
    def _get_int(k, d): 
        try: 
            return int(m.get(k, d))
        except Exception: 
            return d
    days = m.get("cleanup.schedule.days_of_week", "*") or "*"
    # Normalize common values like "mon-sun", "0-6", "*" etc.
    # APScheduler accepts "*", "mon,tue,..." or "0-6"
    return {
        "hour": _get_int("cleanup.schedule.hour", 2),
        "minute": _get_int("cleanup.schedule.minute", 0),
        "days_of_week": days
    }

def _cleanup_job_wrapper():
    logger.info("🧹 Triggering scheduled cleanup")
    db = SessionLocal()
    try:
        cleanup_old_data(db)
    except Exception as e:
        logger.error(f"❌ Error in cleanup job: {e}")
    finally:
        db.close()

def _load_alerts_config(db):
    rows = db.query(SchoolSettings).filter(SchoolSettings.group == "cleanup").all()
    m = {r.key: (r.value or "").strip() for r in rows}
    def _get_int(k, d):
        try:
            return int(m.get(k, d))
        except Exception:
            return d
    def _get_bool(k, d):
        v = m.get(k)
        if v is None: 
            return d
        return str(v).strip().lower() in ("1","true","yes","on","y")
    return {
        "enabled": _get_bool("cleanup.alerts.enabled", True),
        "check_interval_minutes": _get_int("cleanup.alerts.check_interval_minutes", 10),
        "cpu_threshold": _get_int("cleanup.alerts.cpu_percent_threshold", 85),
        "ram_threshold": _get_int("cleanup.alerts.ram_percent_threshold", 85),
        "process_rss_mb_threshold": _get_int("cleanup.alerts.process_rss_mb_threshold", 1024),
        "cooldown_minutes": _get_int("cleanup.alerts.cooldown_minutes", 60)
    }

def _health_check_job():
    db = SessionLocal()
    try:
        cfg = _load_alerts_config(db)
        if not cfg["enabled"]:
            return
        # Gather metrics
        cpu = psutil.cpu_percent(interval=0.2)
        vm = psutil.virtual_memory()
        ram = vm.percent
        rss_mb = psutil.Process().memory_info().rss / (1024 * 1024)
        breaches = []
        if cpu >= cfg["cpu_threshold"]:
            breaches.append(f"CPU {cpu:.1f}% ≥ {cfg['cpu_threshold']}%")
        if ram >= cfg["ram_threshold"]:
            breaches.append(f"RAM {ram:.1f}% ≥ {cfg['ram_threshold']}%")
        if rss_mb >= cfg["process_rss_mb_threshold"] and cfg["process_rss_mb_threshold"] > 0:
            breaches.append(f"Process {rss_mb:.0f} MB ≥ {cfg['process_rss_mb_threshold']} MB")
        if not breaches:
            return
        # Cooldown check
        last_key = "cleanup.alerts.last_sent_at"
        last_row = db.query(SchoolSettings).filter(SchoolSettings.key == last_key).first()
        from datetime import datetime, timedelta
        now = datetime.utcnow()
        if last_row and last_row.value:
            try:
                last_dt = datetime.fromisoformat(last_row.value)
                if now - last_dt < timedelta(minutes=cfg["cooldown_minutes"]):
                    return
            except Exception:
                pass
        # Find a sender (super_admin or owner)
        sender = db.query(User).filter(User.role.in_(["super_admin", "owner"])).first()
        if not sender:
            logger.warning("No admin user found for alert sending")
            return
        admins = db.query(User).filter(User.role.in_(["super_admin", "owner", "admin"])).all()
        text = "⚠️ High resource usage:\n- " + "\n- ".join(breaches)
        for u in admins:
            msg = Message(
                sender_id=sender.id,
                recipient_id=u.id,
                chat_type=ChatType.system,
                content=text,
                is_general=False
            )
            db.add(msg)
        # Update last sent timestamp
        if not last_row:
            last_row = SchoolSettings(key=last_key, value=now.isoformat(), group="cleanup", description="Last resource alert sent at (UTC)")
            db.add(last_row)
        else:
            last_row.value = now.isoformat()
        db.commit()
        logger.info("🔔 Resource alert sent to admins")
    except Exception as e:
        logger.error(f"❌ Error in health check job: {e}")
    finally:
        db.close()

def refresh_cleanup_schedule():
    """Пересоздать задачу автоочистки на основе текущих настроек"""
    tz = pytz.timezone(settings.TIMEZONE)
    try:
        db = SessionLocal()
        try:
            cfg = _load_cleanup_schedule(db)
            # Remove existing job if any
            try:
                scheduler.remove_job("daily_cleanup_job")
            except Exception:
                pass
            scheduler.add_job(
                _cleanup_job_wrapper,
                CronTrigger(
                    day_of_week=cfg["days_of_week"],
                    hour=cfg["hour"],
                    minute=cfg["minute"],
                    timezone=tz
                ),
                id="daily_cleanup_job",
                replace_existing=True
            )
            logger.info(f"🧹 Cleanup rescheduled at {cfg['hour']:02d}:{cfg['minute']:02d} on {cfg['days_of_week']}")
        finally:
            db.close()
    except Exception as e:
        logger.error(f"❌ Failed to refresh cleanup schedule: {e}")

def refresh_alerts_job():
    """Пересоздать задачу мониторинга ресурсов на основе текущих настроек"""
    tz = pytz.timezone(settings.TIMEZONE)
    try:
        db = SessionLocal()
        try:
            cfg = _load_alerts_config(db)
            # Remove existing job if any
            try:
                scheduler.remove_job("resource_health_alerts")
            except Exception:
                pass
            if cfg["enabled"]:
                scheduler.add_job(
                    _health_check_job,
                    CronTrigger(minute=f"*/{max(1, cfg['check_interval_minutes'])}", timezone=tz),
                    id="resource_health_alerts",
                    replace_existing=True
                )
                logger.info(f"🔔 Resource alerts rescheduled (interval {cfg['check_interval_minutes']}m)")
            else:
                logger.info("🔕 Resource alerts disabled")
        finally:
            db.close()
    except Exception as e:
        logger.error(f"❌ Failed to refresh alerts job: {e}")
