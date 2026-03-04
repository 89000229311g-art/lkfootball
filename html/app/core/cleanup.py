import logging
import os
import glob
import time
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import delete, text
from app.models.audit import AuditLog
from app.models.message import Message, ChatType
from app.core.config import settings
import gc
from datetime import timezone as _tz
from typing import List, Tuple
from app.core.cache import cache_manager
from app.core.timezone import now as _now
from app.models import SchoolSettings
from pathlib import Path
import shutil

logger = logging.getLogger(__name__)

def cleanup_old_data(db: Session):
    """
    🧹 Очистка устаревших данных для поддержания производительности.
    
    Политика хранения данных:
    1. ФИНАНСЫ И СТАТИСТИКА (AuditLog, Payments, Students) - ХРАНЯТСЯ ВЕЧНО.
       Никогда не удаляем логи аудита, платежи, данные учеников и посещаемость.
    2. СООБЩЕНИЯ (Message) - Очищаются по настраиваемому сроку.
       По умолчанию: системные уведомления и объявления старше 180 дней.
       
    3. ЛОГИ (Файлы) - Ротация при превышении размера.
    """
    logger.info("🧹 Starting database cleanup...")
    
    try:
        # Snapshot memory before GC (best-effort)
        before_mem = None
        try:
            import psutil
            before_mem = psutil.Process(os.getpid()).memory_info().rss
        except Exception:
            pass
        
        # Load cleanup settings from DB
        settings_rows = db.query(SchoolSettings).filter(SchoolSettings.group.in_(["cleanup", "general"])).all()
        sdict = {row.key: (row.value or "").strip() for row in settings_rows}
        
        def _get_int(key: str, default: int) -> int:
            try:
                return int(sdict.get(key, default))
            except Exception:
                return default
        
        def _get_bool(key: str, default: bool) -> bool:
            val = sdict.get(key)
            if val is None:
                return default
            v = str(val).strip().lower()
            return v in ("1", "true", "yes", "y", "on")
        
        # 1. Cleanup Audit Logs - DISABLED
        # Policy: Keep financial and statistical history forever.
        # audit_retention_days = getattr(settings, 'AUDIT_LOG_RETENTION_DAYS', 180)
        # ... (Audit log deletion removed) ...
        logger.info("ℹ️ Audit Log cleanup skipped (Policy: Keep statistics forever)")
        
        # 2. Cleanup System Messages (Notifications)
        # Retention from settings (days)
        notif_retention_days = _get_int("cleanup.notification_retention_days", 180)
        notif_cutoff = datetime.utcnow() - timedelta(days=notif_retention_days)
        
        notif_stmt = delete(Message).where(
            Message.created_at < notif_cutoff,
            Message.chat_type.in_([
                "system", 
                "announcement"
            ])
        )
        result = db.execute(notif_stmt)
        if result.rowcount > 0:
            logger.info(f"🗑️ Deleted {result.rowcount} old system messages (older than {notif_retention_days} days)")
        else:
            logger.info("✅ No old messages to clean")

        # 3. Cleanup Old SMS/Messages (Non-critical)
        # Assuming SMS are stored as Messages with a specific type or content pattern
        # If storing SMS in a separate table, adjust here. 
        # For now, let's assume we want to clean very old "support" or "direct" messages too, 
        # BUT only if they are very old (e.g. 1 year) to save space.
        # SKIP for now to be safe, unless user explicitly asks to delete user messages.
        
        # 4. File Cleanup (Logs)
        log_dir = os.path.join(os.getcwd(), "logs")
        if os.path.exists(log_dir):
            # Rotate any *.log files larger than threshold
            LOG_ROTATE_THRESHOLD_MB = _get_int("cleanup.log_rotate_threshold_mb", 10)
            LINES_TO_KEEP = _get_int("cleanup.log_lines_to_keep", 2000)
            for fpath in glob.glob(os.path.join(log_dir, "*.log")):
                try:
                    fsize = os.path.getsize(fpath)
                    if fsize > LOG_ROTATE_THRESHOLD_MB * 1024 * 1024:
                        os.system(f"tail -n {LINES_TO_KEEP} {fpath} > {fpath}.tmp && mv {fpath}.tmp {fpath}")
                        logger.info(f"🗑️ Rotated {os.path.basename(fpath)} (>{LOG_ROTATE_THRESHOLD_MB}MB)")
                except Exception as e:
                    logger.warning(f"⚠️ Failed to rotate log {fpath}: {e}")
        
        # 5. Uploads cleanup (temporary/general media)
        try:
            uploads_dir = Path("uploads")
            media_dir = uploads_dir / "media"
            # Settings
            enable_uploads_cleanup = _get_bool("cleanup.uploads.enable_media_cleanup", True)
            max_size_mb = _get_int("cleanup.uploads.max_size_mb", 2048)
            tmp_days = _get_int("cleanup.uploads.tmp_days", 90)
            if enable_uploads_cleanup and media_dir.exists():
                cutoff_ts = (datetime.utcnow() - timedelta(days=tmp_days)).timestamp()
                # Delete very old loose media files
                removed_old = 0
                for p in sorted(media_dir.glob("**/*")):
                    if p.is_file():
                        try:
                            if p.stat().st_mtime < cutoff_ts:
                                p.unlink()
                                removed_old += 1
                        except Exception:
                            pass
                if removed_old:
                    logger.info(f"🗑️ Removed {removed_old} media files older than {tmp_days} days")
                # Enforce max directory size
                def dir_size_bytes(path: Path) -> int:
                    total = 0
                    for q in path.rglob("*"):
                        if q.is_file():
                            try:
                                total += q.stat().st_size
                            except Exception:
                                pass
                    return total
                limit_bytes = max_size_mb * 1024 * 1024
                current_size = dir_size_bytes(media_dir)
                if current_size > limit_bytes:
                    # Remove oldest files until under limit
                    files = [q for q in media_dir.rglob("*") if q.is_file()]
                    files.sort(key=lambda f: f.stat().st_mtime)  # oldest first
                    removed_bytes = 0
                    removed_files = 0
                    for f in files:
                        try:
                            sz = f.stat().st_size
                            f.unlink()
                            removed_bytes += sz
                            removed_files += 1
                            current_size -= sz
                            if current_size <= limit_bytes:
                                break
                        except Exception:
                            continue
                    if removed_files:
                        logger.warning(f"🧯 Uploads size exceeded {max_size_mb}MB: removed {removed_files} files (~{round(removed_bytes/1024/1024,1)} MB)")
        except Exception as e:
            logger.warning(f"⚠️ Uploads cleanup skipped due to error: {e}")

        # 6. Weekly safe trash cleanup (whitelisted tables only)
        try:
            utcnow = datetime.utcnow()
            enable_weekly = _get_bool("cleanup.enable_weekly_trash", True)
            if enable_weekly and utcnow.weekday() == 6:  # Sunday
                deleted_total = 0
                # Import models locally to avoid circular imports at module load
                from app.models import ScheduleTemplate, TrialSession
                wl_schedule = _get_bool("cleanup.trash_whitelist.schedule_template", True)
                wl_trial = _get_bool("cleanup.trash_whitelist.trial_session", True)
                models_whitelist = []
                if wl_schedule:
                    models_whitelist.append(ScheduleTemplate)  # Шаблоны расписаний
                if wl_trial:
                    models_whitelist.append(TrialSession)      # Пробные занятия
                for model in models_whitelist:
                    if hasattr(model, 'deleted_at'):
                        count = db.query(model).filter(model.deleted_at.isnot(None)).delete(synchronize_session=False)
                        deleted_total += count
                if deleted_total > 0:
                    logger.info(f"🧺 Emptied trash (safe whitelist). Removed objects: {deleted_total}")
        except Exception as e:
            logger.warning(f"⚠️ Weekly trash cleanup skipped due to error: {e}")

        # 7. Database VACUUM (PostgreSQL optimization)
        # Reclaims storage occupied by dead tuples
        try:
            # Commit transaction first as VACUUM cannot run inside a transaction block
            db.commit()
            # We need a raw connection or autocommit mode for VACUUM
            # SQLAlchemy session usually in transaction.
            # Skipping VACUUM here as it requires complex setup with SQLAlchemy (ISOLATION_LEVEL_AUTOCOMMIT)
            # Instead, rely on Postgres AUTOVACUUM daemon which is enabled by default.
            pass 
        except Exception as e:
            logger.warning(f"⚠️ Could not perform VACUUM: {e}")

        # 8. Attempt to free Python memory with GC
        try:
            collected = gc.collect()
            after_mem = before_mem
            freed_mb = 0.0
            try:
                import psutil
                after_mem = psutil.Process(os.getpid()).memory_info().rss
                if before_mem and after_mem:
                    freed_mb = round(max(0, before_mem - after_mem) / (1024 * 1024), 1)
            except Exception:
                pass
            logger.info(f"🧠 GC collected {collected} objects, freed ~{freed_mb} MB")
        except Exception as e:
            logger.debug(f"GC error: {e}")

        db.commit()
        logger.info("✅ Database cleanup completed successfully")
        
    except Exception as e:
        db.rollback()
        logger.error(f"❌ Error during database cleanup: {e}")
