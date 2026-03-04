import httpx
import logging
from app.core.config import settings

logger = logging.getLogger(__name__)

class MessengerService:
    def __init__(self):
        self.telegram_token = settings.TELEGRAM_BOT_TOKEN
        self.telegram_api_url = f"https://api.telegram.org/bot{self.telegram_token}" if self.telegram_token else None

    async def send_telegram_message(self, chat_id: str, text: str) -> bool:
        if not self.telegram_token:
            logger.warning("Telegram token not configured. Cannot send message.")
            return False
            
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.telegram_api_url}/sendMessage",
                    json={"chat_id": chat_id, "text": text}
                )
                response.raise_for_status()
                return True
        except Exception as e:
            logger.error(f"Failed to send Telegram message to {chat_id}: {e}")
            return False

    async def notify_user(self, user, message: str) -> bool:
        """
        Sends notification to user via available channels.
        Prioritizes Telegram if connected.
        """
        sent = False
        
        # 1. Telegram
        if getattr(user, 'telegram_chat_id', None):
            if await self.send_telegram_message(user.telegram_chat_id, message):
                sent = True
        
        # 2. WhatsApp/Viber (Future implementation)
        # if user.whatsapp_phone: ...
        
        return sent

messenger_service = MessengerService()
