"""
Оптимизация хранения медиа-файлов
Для масштабирования до 1000+ пользователей
"""
import os
import uuid
from pathlib import Path
from typing import Optional
import logging

# Moldova timezone
from app.core.timezone import now as get_now

logger = logging.getLogger(__name__)

# ==================== КОНФИГУРАЦИЯ ====================
UPLOAD_DIR = Path("/Users/macbook/Desktop/football-academy-system 2/uploads")
MAX_FILE_SIZE_MB = 10  # Максимальный размер файла

# Создаём директории если не существуют
AVATARS_DIR = UPLOAD_DIR / "avatars"
DOCUMENTS_DIR = UPLOAD_DIR / "documents"
REPORTS_DIR = UPLOAD_DIR / "reports"

for directory in [AVATARS_DIR, DOCUMENTS_DIR, REPORTS_DIR]:
    directory.mkdir(parents=True, exist_ok=True)

# ==================== ОПТИМИЗАЦИЯ: Структура по датам ====================
def get_dated_path(base_dir: Path, filename: str) -> tuple[Path, str]:
    """
    Организует файлы по датам для оптимизации.
    Пример: uploads/avatars/2024/01/12/uuid_filename.jpg
    
    Returns: (full_path, relative_url)
    """
    now = get_now()  # Moldova timezone
    
    # Структура: year/month/day
    dated_dir = base_dir / str(now.year) / f"{now.month:02d}" / f"{now.day:02d}"
    dated_dir.mkdir(parents=True, exist_ok=True)
    
    # Уникальное имя файла
    file_ext = Path(filename).suffix
    unique_filename = f"{uuid.uuid4()}{file_ext}"
    
    full_path = dated_dir / unique_filename
    relative_url = f"/uploads/{base_dir.name}/{now.year}/{now.month:02d}/{now.day:02d}/{unique_filename}"
    
    return full_path, relative_url

# ==================== ВАЛИДАЦИЯ ====================
ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp"}
ALLOWED_DOCUMENT_EXTENSIONS = {".pdf", ".doc", ".docx", ".xls", ".xlsx"}

def validate_file_type(filename: str, file_type: str = "image") -> bool:
    """
    Валидация типа файла.
    """
    ext = Path(filename).suffix.lower()
    
    if file_type == "image":
        return ext in ALLOWED_IMAGE_EXTENSIONS
    elif file_type == "document":
        return ext in ALLOWED_DOCUMENT_EXTENSIONS
    
    return False

def validate_file_size(file_size: int, max_mb: int = MAX_FILE_SIZE_MB) -> bool:
    """
    Валидация размера файла.
    """
    max_bytes = max_mb * 1024 * 1024
    return file_size <= max_bytes

# ==================== СЖАТИЕ ИЗОБРАЖЕНИЙ ====================
def optimize_image(file_path: Path, quality: int = 85) -> bool:
    """
    Оптимизация изображения для экономии места.
    Требует: pip install Pillow
    """
    try:
        from PIL import Image
        
        img = Image.open(file_path)
        
        # Конвертируем в RGB если нужно
        if img.mode in ("RGBA", "P"):
            img = img.convert("RGB")
        
        # Масштабируем если слишком большое
        max_dimension = 1920
        if max(img.size) > max_dimension:
            img.thumbnail((max_dimension, max_dimension), Image.Resampling.LANCZOS)
        
        # Сохраняем с оптимизацией
        img.save(file_path, optimize=True, quality=quality)
        
        logger.info(f"✅ Image optimized: {file_path.name}")
        return True
    except ImportError:
        logger.warning("⚠️  Pillow not installed, skipping image optimization")
        return False
    except Exception as e:
        logger.error(f"❌ Image optimization failed: {e}")
        return False

# ==================== ОЧИСТКА СТАРЫХ ФАЙЛОВ ====================
def cleanup_old_files(days: int = 90):
    """
    Удаление неиспользуемых файлов старше N дней.
    Запускать как cronjob или background task.
    """
    from datetime import timedelta
    
    threshold = get_now() - timedelta(days=days)  # Moldova timezone
    deleted_count = 0
    
    for directory in [AVATARS_DIR, DOCUMENTS_DIR, REPORTS_DIR]:
        for file_path in directory.rglob("*"):
            if file_path.is_file():
                file_mtime = datetime.fromtimestamp(file_path.stat().st_mtime)
                
                if file_mtime < threshold:
                    # TODO: Проверить, что файл не используется в БД
                    try:
                        file_path.unlink()
                        deleted_count += 1
                    except Exception as e:
                        logger.error(f"Failed to delete {file_path}: {e}")
    
    logger.info(f"🗑️  Cleaned up {deleted_count} old files")
    return deleted_count

# ==================== S3-СОВМЕСТИМОЕ ХРАНИЛИЩЕ (опционально) ====================
class S3Storage:
    """
    Класс для работы с S3-совместимым хранилищем (AWS S3, MinIO, etc.)
    Для production окружения с большим объёмом файлов.
    """
    
    def __init__(self, bucket_name: str, endpoint_url: Optional[str] = None):
        """
        Инициализация S3 клиента.
        Требует: pip install boto3
        """
        try:
            import boto3
            
            self.bucket_name = bucket_name
            self.s3_client = boto3.client(
                's3',
                endpoint_url=endpoint_url,
                aws_access_key_id=os.getenv('S3_ACCESS_KEY'),
                aws_secret_access_key=os.getenv('S3_SECRET_KEY')
            )
            logger.info(f"✅ S3 Storage initialized: {bucket_name}")
        except ImportError:
            logger.warning("⚠️  boto3 not installed, S3 storage unavailable")
            self.s3_client = None
    
    def upload_file(self, local_path: Path, s3_key: str) -> Optional[str]:
        """Загрузка файла в S3"""
        if not self.s3_client:
            return None
        
        try:
            self.s3_client.upload_file(str(local_path), self.bucket_name, s3_key)
            url = f"https://{self.bucket_name}.s3.amazonaws.com/{s3_key}"
            logger.info(f"✅ Uploaded to S3: {s3_key}")
            return url
        except Exception as e:
            logger.error(f"❌ S3 upload failed: {e}")
            return None
    
    def delete_file(self, s3_key: str) -> bool:
        """Удаление файла из S3"""
        if not self.s3_client:
            return False
        
        try:
            self.s3_client.delete_object(Bucket=self.bucket_name, Key=s3_key)
            logger.info(f"🗑️  Deleted from S3: {s3_key}")
            return True
        except Exception as e:
            logger.error(f"❌ S3 deletion failed: {e}")
            return False

# ==================== СТАТИСТИКА ХРАНИЛИЩА ====================
def get_storage_stats() -> dict:
    """Получение статистики использования дискового пространства"""
    total_size = 0
    file_count = 0
    
    stats_by_type = {
        "avatars": {"size": 0, "count": 0},
        "documents": {"size": 0, "count": 0},
        "reports": {"size": 0, "count": 0}
    }
    
    for dir_name, directory in [
        ("avatars", AVATARS_DIR),
        ("documents", DOCUMENTS_DIR),
        ("reports", REPORTS_DIR)
    ]:
        for file_path in directory.rglob("*"):
            if file_path.is_file():
                size = file_path.stat().st_size
                stats_by_type[dir_name]["size"] += size
                stats_by_type[dir_name]["count"] += 1
                total_size += size
                file_count += 1
    
    return {
        "total_size_mb": round(total_size / (1024 * 1024), 2),
        "total_files": file_count,
        "by_type": stats_by_type
    }
