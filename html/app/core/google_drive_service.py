"""
Google Drive Service - Загрузка файлов в Google Drive
Использует Google Drive API v3
"""
import os
import json
import logging
from typing import Optional
from google.oauth2.service_account import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload

logger = logging.getLogger(__name__)

# Конфигурация (те же переменные, что и для Sheets)
GOOGLE_DRIVE_ENABLED = os.getenv("GOOGLE_SHEETS_ENABLED", "false").lower() == "true"
GOOGLE_CREDENTIALS_JSON = os.getenv("GOOGLE_CREDENTIALS_JSON", "")
GOOGLE_CREDENTIALS_PATH = os.getenv("GOOGLE_CREDENTIALS_PATH", "credentials.json")
# ID папки в Google Drive куда сохранять отчеты (опционально, иначе в корень)
GOOGLE_DRIVE_FOLDER_ID = os.getenv("GOOGLE_DRIVE_FOLDER_ID", "")

class GoogleDriveService:
    """
    Сервис для работы с Google Drive API.
    """
    
    def __init__(self):
        self.enabled = GOOGLE_DRIVE_ENABLED
        self.service = None
        
        if self.enabled:
            self._initialize()
    
    def _initialize(self):
        """Инициализация Google Drive API"""
        try:
            # Определяем scopes
            scopes = ['https://www.googleapis.com/auth/drive.file']
            
            creds = None
            
            # Вариант 1: JSON строка
            if GOOGLE_CREDENTIALS_JSON:
                try:
                    creds_data = json.loads(GOOGLE_CREDENTIALS_JSON)
                    creds = Credentials.from_service_account_info(creds_data, scopes=scopes)
                except json.JSONDecodeError:
                    logger.warning("⚠️  Invalid JSON in GOOGLE_CREDENTIALS_JSON")
            
            # Вариант 2: Файл credentials.json
            if not creds and os.path.exists(GOOGLE_CREDENTIALS_PATH):
                creds = Credentials.from_service_account_file(GOOGLE_CREDENTIALS_PATH, scopes=scopes)
            
            if not creds:
                logger.warning("⚠️  No Google credentials found for Drive Service")
                self.enabled = False
                return
            
            # Создаём сервис
            self.service = build('drive', 'v3', credentials=creds)
            logger.info("✅ Google Drive Service connected")
            
        except Exception as e:
            logger.error(f"❌ Google Drive initialization failed: {e}")
            self.enabled = False

    def upload_file(self, file_path: str, file_name: str, folder_id: Optional[str] = None) -> Optional[str]:
        """
        Загрузка файла в Google Drive.
        
        Args:
            file_path: Путь к локальному файлу
            file_name: Имя файла в Google Drive
            folder_id: ID папки (если None, используется GOOGLE_DRIVE_FOLDER_ID или корень)
            
        Returns:
            ID загруженного файла или None
        """
        if not self.enabled or not self.service:
            logger.warning("⚠️ Google Drive Service disabled or not initialized")
            return None
            
        try:
            target_folder_id = folder_id or GOOGLE_DRIVE_FOLDER_ID
            
            file_metadata = {'name': file_name}
            if target_folder_id:
                file_metadata['parents'] = [target_folder_id]
                
            media = MediaFileUpload(file_path, resumable=True)
            
            file = self.service.files().create(
                body=file_metadata,
                media_body=media,
                fields='id, webViewLink'
            ).execute()
            
            logger.info(f"✅ File uploaded to Drive: {file_name} (ID: {file.get('id')})")
            return file.get('webViewLink')
            
        except Exception as e:
            logger.error(f"❌ File upload failed: {e}")
            return None

# Глобальный экземпляр
drive_service = GoogleDriveService()
