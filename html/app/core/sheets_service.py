"""
Google Sheets Service - Синхронизация данных с Google Таблицами
Использует gspread для работы с Google Sheets API v4

Настройка:
1. Создать проект в Google Cloud Console (https://console.cloud.google.com)
2. Включить Google Sheets API и Google Drive API
3. Создать Service Account (IAM & Admin -> Service Accounts)
4. Создать JSON ключ для Service Account
5. Дать доступ к таблице: добавить email сервисного аккаунта как редактора
6. Сохранить JSON ключ или его содержимое в GOOGLE_CREDENTIALS_JSON
"""
import os
import json
import logging
from typing import Optional, List, Dict, Any
from datetime import datetime

# Moldova timezone for timestamps
from app.core.timezone import now as get_now

logger = logging.getLogger(__name__)

# Конфигурация
GOOGLE_SHEETS_ENABLED = os.getenv("GOOGLE_SHEETS_ENABLED", "false").lower() == "true"
GOOGLE_SPREADSHEET_ID = os.getenv("GOOGLE_SPREADSHEET_ID", "")
GOOGLE_CREDENTIALS_JSON = os.getenv("GOOGLE_CREDENTIALS_JSON", "")
GOOGLE_CREDENTIALS_PATH = os.getenv("GOOGLE_CREDENTIALS_PATH", "credentials.json")

# Имена листов (Russian)
SHEET_PAYMENTS = "Платежи"
SHEET_PLAYERS = "Игроки"
SHEET_ATTENDANCE = "Посещаемость"

# Заголовки листов (Russian)
HEADERS_PAYMENTS = [
    "ID", "ID Игрока", "Имя игрока", "Сумма", "Дата платежа", 
    "Период оплаты", "Метод оплаты", "Статус", "Примечание", "Создано"
]

HEADERS_PLAYERS = [
    "ID", "Имя", "Фамилия", "Дата рождения", "Возраст", 
    "Телефон родителя", "Email", "Группа", "Тренер",
    "Баланс занятий", "Всего оплачено", "Статус подписки",
    "Дата вступления", "Статус", "Обновлено"
]


class GoogleSheetsService:
    """
    Сервис для синхронизации данных с Google Sheets.
    Использует gspread библиотеку.
    """
    
    def __init__(self):
        self.enabled = GOOGLE_SHEETS_ENABLED
        self.spreadsheet_id = GOOGLE_SPREADSHEET_ID
        self.client = None
        self.spreadsheet = None
        
        if self.enabled and self.spreadsheet_id:
            self._initialize()
    
    def _initialize(self):
        """Инициализация Google Sheets API через gspread"""
        try:
            import gspread
            from google.oauth2.service_account import Credentials
            
            # Определяем scopes
            scopes = [
                'https://www.googleapis.com/auth/spreadsheets',
                'https://www.googleapis.com/auth/drive'
            ]
            
            # Загружаем credentials
            creds = None
            
            # Вариант 1: JSON строка в переменной окружения
            if GOOGLE_CREDENTIALS_JSON:
                try:
                    creds_data = json.loads(GOOGLE_CREDENTIALS_JSON)
                    creds = Credentials.from_service_account_info(creds_data, scopes=scopes)
                    logger.info("📄 Credentials loaded from environment variable")
                except json.JSONDecodeError:
                    logger.warning("⚠️  Invalid JSON in GOOGLE_CREDENTIALS_JSON")
            
            # Вариант 2: Файл credentials.json
            if not creds and os.path.exists(GOOGLE_CREDENTIALS_PATH):
                creds = Credentials.from_service_account_file(GOOGLE_CREDENTIALS_PATH, scopes=scopes)
                logger.info(f"📄 Credentials loaded from file: {GOOGLE_CREDENTIALS_PATH}")
            
            if not creds:
                logger.warning("⚠️  No Google credentials found")
                self.enabled = False
                return
            
            # Создаём клиент gspread
            self.client = gspread.authorize(creds)
            
            # Открываем таблицу
            self.spreadsheet = self.client.open_by_key(self.spreadsheet_id)
            
            # Создаём листы если не существуют
            self._ensure_sheets_exist()
            
            logger.info(f"✅ Google Sheets connected: {self.spreadsheet.title}")
            
        except ImportError:
            logger.warning("⚠️  gspread not installed. Run: pip install gspread google-auth")
            self.enabled = False
        except gspread.exceptions.SpreadsheetNotFound:
            logger.error(f"❌ Spreadsheet not found: {self.spreadsheet_id}")
            self.enabled = False
        except Exception as e:
            logger.error(f"❌ Google Sheets initialization failed: {e}")
            self.enabled = False
    
    def _ensure_sheets_exist(self):
        """Создаёт листы и заголовки если они не существуют"""
        try:
            existing_sheets = [ws.title for ws in self.spreadsheet.worksheets()]
            
            # Лист Платежи
            if SHEET_PAYMENTS not in existing_sheets:
                ws = self.spreadsheet.add_worksheet(title=SHEET_PAYMENTS, rows=1000, cols=15)
                ws.append_row(HEADERS_PAYMENTS)
                ws.format('A1:J1', {'textFormat': {'bold': True}})
                logger.info(f"📊 Created sheet: {SHEET_PAYMENTS}")
            
            # Лист Игроки
            if SHEET_PLAYERS not in existing_sheets:
                ws = self.spreadsheet.add_worksheet(title=SHEET_PLAYERS, rows=1000, cols=20)
                ws.append_row(HEADERS_PLAYERS)
                ws.format('A1:O1', {'textFormat': {'bold': True}})
                logger.info(f"📊 Created sheet: {SHEET_PLAYERS}")
            
            # Лист Посещаемость
            if SHEET_ATTENDANCE not in existing_sheets:
                ws = self.spreadsheet.add_worksheet(title=SHEET_ATTENDANCE, rows=5000, cols=10)
                ws.append_row(["ID", "ID Игрока", "Имя игрока", "ID События", "Дата", "Статус", "Создано"])
                ws.format('A1:G1', {'textFormat': {'bold': True}})
                logger.info(f"📊 Created sheet: {SHEET_ATTENDANCE}")
                
        except Exception as e:
            logger.error(f"❌ Error ensuring sheets exist: {e}")
    
    def _format_date(self, date_value) -> str:
        """Форматирование даты в DD.MM.YYYY HH:mm"""
        if not date_value:
            return ""
        try:
            if isinstance(date_value, str):
                # Пробуем разные форматы
                for fmt in ["%Y-%m-%d", "%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S"]:
                    try:
                        date_value = datetime.strptime(date_value.split('.')[0], fmt)
                        break
                    except ValueError:
                        continue
            if isinstance(date_value, datetime):
                return date_value.strftime("%d.%m.%Y %H:%M")
            return str(date_value)
        except Exception:
            return str(date_value) if date_value else ""
    
    def _format_amount(self, amount) -> float:
        """Форматирование суммы как число"""
        try:
            return float(amount) if amount else 0.0
        except (ValueError, TypeError):
            return 0.0
    
    # ==================== СИНХРОНИЗАЦИЯ ПЛАТЕЖЕЙ ====================
    
    async def sync_payment(self, payment_data: Dict[str, Any], action: str = "create") -> dict:
        """
        Синхронизация платежа с Google Sheets.
        
        Args:
            payment_data: {
                "id": int,
                "student_id": int,
                "student_name": str,
                "amount": float,
                "payment_date": str/datetime,
                "payment_period": str/datetime,
                "method": str,
                "status": str,
                "notes": str
            }
            action: "create" (только добавление, платежи не редактируются)
        """
        if not self.enabled:
            return {"success": False, "reason": "disabled"}
        
        try:
            worksheet = self.spreadsheet.worksheet(SHEET_PAYMENTS)
            
            row = [
                payment_data.get("id"),
                payment_data.get("student_id"),
                payment_data.get("student_name", ""),
                self._format_amount(payment_data.get("amount")),  # Число!
                self._format_date(payment_data.get("payment_date")),
                self._format_date(payment_data.get("payment_period")),
                payment_data.get("method", "cash"),
                payment_data.get("status", "completed"),
                payment_data.get("notes", ""),
                self._format_date(get_now())
            ]
            
            worksheet.append_row(row, value_input_option='USER_ENTERED')
            
            logger.info(f"✅ Payment #{payment_data.get('id')} synced to Google Sheets")
            return {"success": True}
            
        except Exception as e:
            logger.error(f"❌ Payment sync failed: {e}")
            return {"success": False, "error": str(e)}
    
    # ==================== СИНХРОНИЗАЦИЯ ИГРОКОВ ====================
    
    async def sync_student(self, student_data: Dict[str, Any], action: str = "create") -> dict:
        """
        Синхронизация игрока с Google Sheets.
        Использует student_id как уникальный ключ для обновления (не создаёт дубликаты).
        
        Args:
            student_data: {
                "id": int,
                "first_name": str,
                "last_name": str,
                "date_of_birth": str/datetime,
                "age": int,
                "parent_phone": str,
                "parent_email": str,
                "group_name": str,
                "coach_name": str,
                "balance": int,
                "total_paid": float,
                "subscription_status": str,
                "join_date": str/datetime,
                "status": str (active/inactive)
            }
            action: "create", "update"
        """
        if not self.enabled:
            return {"success": False, "reason": "disabled"}
        
        try:
            worksheet = self.spreadsheet.worksheet(SHEET_PLAYERS)
            student_id = student_data.get("id")
            
            # Формируем строку данных
            row_data = [
                student_id,
                student_data.get("first_name", ""),
                student_data.get("last_name", ""),
                self._format_date(student_data.get("date_of_birth")),
                student_data.get("age", ""),
                student_data.get("parent_phone", ""),
                student_data.get("parent_email", ""),
                student_data.get("group_name", ""),
                student_data.get("coach_name", ""),
                student_data.get("balance", 0),
                self._format_amount(student_data.get("total_paid", 0)),  # Число!
                student_data.get("subscription_status", ""),
                self._format_date(student_data.get("join_date")),
                student_data.get("status", "active"),
                self._format_date(get_now())
            ]
            
            # Ищем существующую строку по student_id (колонка A)
            existing_row = self._find_row_by_id(worksheet, student_id)
            
            if existing_row:
                # Обновляем существующую строку
                cell_range = f"A{existing_row}:O{existing_row}"
                worksheet.update(cell_range, [row_data], value_input_option='USER_ENTERED')
                logger.info(f"✅ Player #{student_id} updated in Google Sheets (row {existing_row})")
            else:
                # Добавляем новую строку
                worksheet.append_row(row_data, value_input_option='USER_ENTERED')
                logger.info(f"✅ Player #{student_id} added to Google Sheets")
            
            return {"success": True}
            
        except Exception as e:
            logger.error(f"❌ Student sync failed: {e}")
            return {"success": False, "error": str(e)}
    
    def _find_row_by_id(self, worksheet, record_id: int) -> Optional[int]:
        """
        Поиск номера строки по ID в первой колонке.
        Возвращает номер строки (1-based) или None если не найдено.
        """
        try:
            # Получаем все значения первой колонки
            col_values = worksheet.col_values(1)
            
            # Ищем ID (пропускаем заголовок)
            for idx, val in enumerate(col_values[1:], start=2):
                try:
                    if int(val) == int(record_id):
                        return idx
                except (ValueError, TypeError):
                    continue
            
            return None
            
        except Exception as e:
            logger.error(f"❌ Error finding row: {e}")
            return None
    
    # ==================== СИНХРОНИЗАЦИЯ ПОСЕЩАЕМОСТИ ====================
    
    async def sync_attendance(self, attendance_data: Dict[str, Any]) -> dict:
        """Синхронизация записи посещаемости"""
        if not self.enabled:
            return {"success": False, "reason": "disabled"}
        
        try:
            worksheet = self.spreadsheet.worksheet(SHEET_ATTENDANCE)
            
            row = [
                attendance_data.get("id"),
                attendance_data.get("student_id"),
                attendance_data.get("student_name", ""),
                attendance_data.get("event_id"),
                self._format_date(attendance_data.get("date")),
                attendance_data.get("status", "present"),
                self._format_date(get_now())
            ]
            
            worksheet.append_row(row, value_input_option='USER_ENTERED')
            
            logger.info(f"✅ Attendance synced to Google Sheets")
            return {"success": True}
            
        except Exception as e:
            logger.error(f"❌ Attendance sync failed: {e}")
            return {"success": False, "error": str(e)}
    
    # ==================== ПАКЕТНЫЕ ОПЕРАЦИИ ====================
    
    async def batch_update_students(self, students: List[Dict[str, Any]]) -> dict:
        """
        Пакетное обновление всех игроков.
        Полностью перезаписывает лист Игроки.
        """
        if not self.enabled:
            return {"success": False, "reason": "disabled"}
        
        try:
            worksheet = self.spreadsheet.worksheet(SHEET_PLAYERS)
            
            # Очищаем всё кроме заголовка
            worksheet.clear()
            worksheet.append_row(HEADERS_PLAYERS)
            worksheet.format('A1:O1', {'textFormat': {'bold': True}})
            
            # Формируем данные
            rows = []
            for s in students:
                rows.append([
                    s.get("id"),
                    s.get("first_name", ""),
                    s.get("last_name", ""),
                    self._format_date(s.get("date_of_birth")),
                    s.get("age", ""),
                    s.get("parent_phone", ""),
                    s.get("parent_email", ""),
                    s.get("group_name", ""),
                    s.get("coach_name", ""),
                    s.get("balance", 0),
                    self._format_amount(s.get("total_paid", 0)),
                    s.get("subscription_status", ""),
                    self._format_date(s.get("join_date")),
                    s.get("status", "active"),
                    self._format_date(get_now())
                ])
            
            if rows:
                worksheet.append_rows(rows, value_input_option='USER_ENTERED')
            
            logger.info(f"✅ Batch update: {len(rows)} players synced")
            return {"success": True, "count": len(rows)}
            
        except Exception as e:
            logger.error(f"❌ Batch update failed: {e}")
            return {"success": False, "error": str(e)}


# Глобальный экземпляр
sheets_service = GoogleSheetsService()

# Экспорт
__all__ = ['GoogleSheetsService', 'sheets_service']
