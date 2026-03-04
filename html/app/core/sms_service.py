"""
SMS Service - Универсальный модуль для отправки SMS
Поддержка: Twilio, SMS.ru, Nexmo/Vonage
"""
import os
import logging
from typing import Optional

# Moldova timezone for timestamps
from app.core.timezone import now as get_now

logger = logging.getLogger(__name__)

# Конфигурация из переменных окружения
SMS_PROVIDER = os.getenv("SMS_PROVIDER", "mock")  # mock, twilio, smsru, nexmo
SMS_API_KEY = os.getenv("SMS_API_KEY", "")
SMS_API_SECRET = os.getenv("SMS_API_SECRET", "")
SMS_SENDER_ID = os.getenv("SMS_SENDER_ID", "Academy")  # Отправитель


class SMSService:
    """Базовый класс для SMS сервисов"""
    
    def __init__(self, provider: str = SMS_PROVIDER):
        self.provider = provider.lower()
        self.api_key = SMS_API_KEY
        self.api_secret = SMS_API_SECRET
        self.sender_id = SMS_SENDER_ID
        
        logger.info(f"📱 SMS Service initialized: provider={self.provider}")
    
    async def send_sms(self, phone: str, message: str) -> dict:
        """
        Отправка SMS через выбранного провайдера.
        
        Args:
            phone: Номер телефона (+373...)
            message: Текст сообщения
        
        Returns:
            dict: {"success": bool, "message_id": str, "error": str}
        """
        # Валидация
        if not phone or not message:
            return {"success": False, "error": "Phone and message are required"}
        
        # Нормализация номера
        phone = self._normalize_phone(phone)
        
        # Выбор провайдера
        if self.provider == "twilio":
            return await self._send_twilio(phone, message)
        elif self.provider == "smsru":
            return await self._send_smsru(phone, message)
        elif self.provider == "nexmo":
            return await self._send_nexmo(phone, message)
        else:
            # Mock режим для разработки
            return await self._send_mock(phone, message)
    
    def _normalize_phone(self, phone: str) -> str:
        """Нормализация номера телефона"""
        # Убираем пробелы, скобки, дефисы
        phone = "".join(c for c in phone if c.isdigit() or c == "+")
        
        # Добавляем + если нет
        if not phone.startswith("+"):
            phone = "+" + phone
        
        return phone
    
    # ==================== TWILIO ====================
    async def _send_twilio(self, phone: str, message: str) -> dict:
        """
        Отправка через Twilio
        Требует: pip install twilio
        """
        try:
            from twilio.rest import Client
            
            account_sid = self.api_key
            auth_token = self.api_secret
            
            client = Client(account_sid, auth_token)
            
            sms = client.messages.create(
                body=message,
                from_=self.sender_id,
                to=phone
            )
            
            logger.info(f"✅ Twilio SMS sent: {phone}, SID: {sms.sid}")
            
            return {
                "success": True,
                "message_id": sms.sid,
                "provider": "twilio"
            }
        except ImportError:
            logger.error("❌ Twilio library not installed: pip install twilio")
            return {"success": False, "error": "Twilio library not installed"}
        except Exception as e:
            logger.error(f"❌ Twilio error: {e}")
            return {"success": False, "error": str(e)}
    
    # ==================== SMS.RU ====================
    async def _send_smsru(self, phone: str, message: str) -> dict:
        """
        Отправка через SMS.ru
        API: https://sms.ru/api
        """
        try:
            import aiohttp
            
            url = "https://sms.ru/sms/send"
            params = {
                "api_id": self.api_key,
                "to": phone,
                "msg": message,
                "json": 1
            }
            
            async with aiohttp.ClientSession() as session:
                async with session.get(url, params=params) as response:
                    result = await response.json()
                    
                    if result.get("status") == "OK":
                        sms_data = result.get("sms", {}).get(phone, {})
                        message_id = sms_data.get("sms_id")
                        
                        logger.info(f"✅ SMS.ru sent: {phone}, ID: {message_id}")
                        
                        return {
                            "success": True,
                            "message_id": str(message_id),
                            "provider": "smsru"
                        }
                    else:
                        error = result.get("status_text", "Unknown error")
                        logger.error(f"❌ SMS.ru error: {error}")
                        return {"success": False, "error": error}
        except ImportError:
            logger.error("❌ aiohttp not installed: pip install aiohttp")
            return {"success": False, "error": "aiohttp not installed"}
        except Exception as e:
            logger.error(f"❌ SMS.ru error: {e}")
            return {"success": False, "error": str(e)}
    
    # ==================== NEXMO/VONAGE ====================
    async def _send_nexmo(self, phone: str, message: str) -> dict:
        """
        Отправка через Nexmo (Vonage)
        Требует: pip install vonage
        """
        try:
            import vonage
            
            client = vonage.Client(key=self.api_key, secret=self.api_secret)
            sms = vonage.Sms(client)
            
            response = sms.send_message({
                "from": self.sender_id,
                "to": phone,
                "text": message
            })
            
            if response["messages"][0]["status"] == "0":
                message_id = response["messages"][0]["message-id"]
                
                logger.info(f"✅ Nexmo SMS sent: {phone}, ID: {message_id}")
                
                return {
                    "success": True,
                    "message_id": message_id,
                    "provider": "nexmo"
                }
            else:
                error = response["messages"][0]["error-text"]
                logger.error(f"❌ Nexmo error: {error}")
                return {"success": False, "error": error}
        except ImportError:
            logger.error("❌ Vonage library not installed: pip install vonage")
            return {"success": False, "error": "Vonage library not installed"}
        except Exception as e:
            logger.error(f"❌ Nexmo error: {e}")
            return {"success": False, "error": str(e)}
    
    # ==================== MOCK (для разработки) ====================
    async def _send_mock(self, phone: str, message: str) -> dict:
        """
        Mock режим для разработки (без реальной отправки)
        """
        import asyncio
        await asyncio.sleep(0.1)  # Имитация сетевого запроса
        
        message_id = f"mock_{get_now().timestamp()}"  # Moldova timezone
        
        logger.info(f"📱 MOCK SMS: {phone}")
        logger.info(f"   Message: {message}")
        logger.info(f"   ID: {message_id}")
        
        return {
            "success": True,
            "message_id": message_id,
            "provider": "mock"
        }


# ==================== ГОТОВЫЕ ШАБЛОНЫ SMS ====================
class SMSTemplates:
    """Шаблоны SMS сообщений на RO/RU"""
    
    ACADEMY_NAME = "Sunny Academy"
    
    # ==================== ОПЛАТА АБОНЕМЕНТА ====================
    @staticmethod
    def payment_reminder(child_name: str, month_name: str, lang: str = "ro") -> str:
        """Напоминание об оплате (отправляется 25-го числа)"""
        templates = {
            "ro": f"""🏆 {SMSTemplates.ACADEMY_NAME}

Stimate părinte!

Vă reamintim că se apropie termenul de plată a abonamentului pentru {month_name} pentru copilul dumneavoastră {child_name}.

⏰ Perioada de plată: 25-31 a lunii curente

Mulțumim că sunteți alături de noi! ⚽""",
            "ru": f"""🏆 {SMSTemplates.ACADEMY_NAME}

Уважаемый родитель!

Напоминаем, что подходит срок оплаты абонемента за {month_name} для вашего ребёнка {child_name}.

⏰ Период оплаты: 25-31 числа текущего месяца

Спасибо, что вы с нами! ⚽"""
        }
        return templates.get(lang, templates["ro"])
    
    @staticmethod
    def debt_reminder(child_name: str, month_name: str, lang: str = "ro") -> str:
        """Напоминание о долге (после просрочки)"""
        templates = {
            "ro": f"""🏆 {SMSTemplates.ACADEMY_NAME}

Stimate părinte!

Atrăgem atenția că aveți o datorie pentru abonamentul pentru {month_name} pentru {child_name}.

⚠️ Vă rugăm să achitați în cel mai scurt timp pentru continuarea antrenamentelor.

Pentru întrebări despre plată, contactați administratorul.

Cu respect, {SMSTemplates.ACADEMY_NAME} ⚽""",
            "ru": f"""🏆 {SMSTemplates.ACADEMY_NAME}

Уважаемый родитель!

Обращаем внимание, что у вас имеется задолженность по абонементу за {month_name} для {child_name}.

⚠️ Пожалуйста, оплатите в ближайшее время для продолжения занятий.

По вопросам оплаты обращайтесь к администратору.

С уважением, {SMSTemplates.ACADEMY_NAME} ⚽"""
        }
        return templates.get(lang, templates["ro"])
    
    @staticmethod
    def payment_confirmation(child_name: str, month_name: str, lang: str = "ro") -> str:
        """Подтверждение оплаты"""
        templates = {
            "ro": f"""🏆 {SMSTemplates.ACADEMY_NAME}

✅ Plata a fost primită!

Abonamentul pentru {month_name} pentru {child_name} a fost achitat cu succes.

Vă așteptăm la antrenamente! ⚽""",
            "ru": f"""🏆 {SMSTemplates.ACADEMY_NAME}

✅ Оплата принята!

Абонемент за {month_name} для {child_name} успешно оплачен.

Ждём вас на тренировках! ⚽"""
        }
        return templates.get(lang, templates["ro"])
    
    # ==================== СТАРЫЕ ШАБЛОНЫ (совместимость) ====================
    @staticmethod
    def payment_received(amount: float, month: str, lang: str = "ro") -> str:
        """Уведомление о получении платежа"""
        templates = {
            "ro": f"Plată primită: {amount} MDL pentru {month}. Mulțumim! 🏆",
            "ru": f"Оплата получена: {amount} MDL за {month}. Спасибо! 🏆"
        }
        return templates.get(lang, templates["ro"])
    
    @staticmethod
    def debt_reminder_legacy(amount: float, month: str, lang: str = "ro") -> str:
        """Напоминание о задолженности (старый формат для совместимости)"""
        templates = {
            "ro": f"Reamintire: datorie de {amount} MDL pentru {month}. Vă rugăm să achitați.",
            "ru": f"Напоминание: задолженность {amount} MDL за {month}. Просьба оплатить."
        }
        return templates.get(lang, templates["ro"])
    
    @staticmethod
    def training_reminder(time: str, date: str, lang: str = "ro") -> str:
        """Напоминание о тренировке"""
        templates = {
            "ro": f"Antrenament {date} la {time}. Vă așteptăm! ⚽",
            "ru": f"Тренировка {date} в {time}. Ждём вас! ⚽"
        }
        return templates.get(lang, templates["ro"])
    
    @staticmethod
    def freeze_approved(until_date: str, lang: str = "ro") -> str:
        """Подтверждение заморозки"""
        templates = {
            "ro": f"Înghețare aprobată până la {until_date}. ❄️",
            "ru": f"Заморозка одобрена до {until_date}. ❄️"
        }
        return templates.get(lang, templates["ro"])


# Глобальный экземпляр сервиса
sms_service = SMSService()

# Экспорт
__all__ = ['SMSService', 'SMSTemplates', 'sms_service']
