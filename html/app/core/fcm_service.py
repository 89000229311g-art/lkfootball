"""
Firebase Cloud Messaging Service
Sends push notifications to mobile devices
"""
import os
import logging
from typing import Optional, List, Dict, Any

logger = logging.getLogger(__name__)

# Firebase Admin SDK
_firebase_initialized = False

def init_firebase():
    """Initialize Firebase Admin SDK"""
    global _firebase_initialized
    
    if _firebase_initialized:
        return True
    
    try:
        import firebase_admin
        from firebase_admin import credentials
        
        # Check for service account file
        cred_path = os.getenv("FIREBASE_CREDENTIALS_PATH", "firebase-adminsdk.json")
        
        if os.path.exists(cred_path):
            cred = credentials.Certificate(cred_path)
            firebase_admin.initialize_app(cred)
            _firebase_initialized = True
            logger.info("✅ Firebase initialized successfully")
            return True
        else:
            logger.warning(f"⚠️ Firebase credentials not found at {cred_path}")
            return False
            
    except Exception as e:
        logger.error(f"❌ Firebase initialization error: {e}")
        return False


class FCMService:
    """Firebase Cloud Messaging service for push notifications"""
    
    @staticmethod
    def is_available() -> bool:
        """Check if FCM is available"""
        return init_firebase()
    
    @staticmethod
    async def send_notification(
        token: str,
        title: str,
        body: str,
        data: Optional[Dict[str, str]] = None,
        image_url: Optional[str] = None
    ) -> bool:
        """
        Send push notification to a specific device.
        
        Args:
            token: FCM device token
            title: Notification title
            body: Notification body
            data: Additional data payload
            image_url: Optional image URL for rich notification
        
        Returns:
            True if successful, False otherwise
        """
        if not init_firebase():
            logger.warning("FCM not available, skipping notification")
            return False
        
        try:
            from firebase_admin import messaging
            
            notification = messaging.Notification(
                title=title,
                body=body,
                image=image_url
            )
            
            message = messaging.Message(
                notification=notification,
                data=data or {},
                token=token,
                android=messaging.AndroidConfig(
                    priority="high",
                    notification=messaging.AndroidNotification(
                        icon="ic_notification",
                        color="#3B82F6",
                        sound="default",
                        channel_id="sunny_academy_channel"
                    )
                ),
                apns=messaging.APNSConfig(
                    payload=messaging.APNSPayload(
                        aps=messaging.Aps(
                            sound="default",
                            badge=1
                        )
                    )
                )
            )
            
            response = messaging.send(message)
            logger.info(f"FCM notification sent: {response}")
            return True
            
        except Exception as e:
            logger.error(f"FCM send error: {e}")
            return False
    
    @staticmethod
    async def send_to_topic(
        topic: str,
        title: str,
        body: str,
        data: Optional[Dict[str, str]] = None
    ) -> bool:
        """
        Send notification to all devices subscribed to a topic.
        
        Args:
            topic: Topic name (e.g., "group_5", "role_parent")
            title: Notification title
            body: Notification body
            data: Additional data payload
        """
        if not init_firebase():
            return False
        
        try:
            from firebase_admin import messaging
            
            message = messaging.Message(
                notification=messaging.Notification(title=title, body=body),
                data=data or {},
                topic=topic
            )
            
            response = messaging.send(message)
            logger.info(f"FCM topic notification sent to {topic}: {response}")
            return True
            
        except Exception as e:
            logger.error(f"FCM topic send error: {e}")
            return False
    
    @staticmethod
    async def send_multicast(
        tokens: List[str],
        title: str,
        body: str,
        data: Optional[Dict[str, str]] = None
    ) -> Dict[str, Any]:
        """
        Send notification to multiple devices.
        
        Args:
            tokens: List of FCM device tokens
            title: Notification title
            body: Notification body
            data: Additional data payload
        
        Returns:
            Dict with success and failure counts
        """
        if not init_firebase():
            return {"success_count": 0, "failure_count": len(tokens)}
        
        try:
            from firebase_admin import messaging
            
            message = messaging.MulticastMessage(
                notification=messaging.Notification(title=title, body=body),
                data=data or {},
                tokens=tokens
            )
            
            response = messaging.send_multicast(message)
            logger.info(f"FCM multicast: {response.success_count} success, {response.failure_count} failed")
            
            return {
                "success_count": response.success_count,
                "failure_count": response.failure_count,
                "responses": [
                    {"success": r.success, "error": str(r.exception) if r.exception else None}
                    for r in response.responses
                ]
            }
            
        except Exception as e:
            logger.error(f"FCM multicast error: {e}")
            return {"success_count": 0, "failure_count": len(tokens), "error": str(e)}


# Notification templates
class NotificationTemplates:
    """Predefined notification templates"""
    
    @staticmethod
    def payment_reminder(child_name: str, month: str, amount: float, lang: str = "ru") -> Dict[str, str]:
        if lang == "ru":
            return {
                "title": "💰 Напоминание об оплате",
                "body": f"Оплатите абонемент за {month} для {child_name}. Сумма: {amount} лей",
                "type": "payment_reminder"
            }
        return {
            "title": "💰 Reminder de plată",
            "body": f"Achitați abonamentul pentru {month} pentru {child_name}. Suma: {amount} lei",
            "type": "payment_reminder"
        }
    
    @staticmethod
    def debt_warning(child_name: str, days: int, lang: str = "ru") -> Dict[str, str]:
        if lang == "ru":
            return {
                "title": "⚠️ Задолженность",
                "body": f"Долг за {child_name} не оплачен {days} дней. Пожалуйста, оплатите.",
                "type": "debt_warning"
            }
        return {
            "title": "⚠️ Datorie",
            "body": f"Datoria pentru {child_name} nu a fost achitată {days} zile.",
            "type": "debt_warning"
        }
    
    @staticmethod
    def new_announcement(title: str, preview: str) -> Dict[str, str]:
        return {
            "title": f"📢 {title}",
            "body": preview[:100] + "..." if len(preview) > 100 else preview,
            "type": "announcement"
        }
    
    @staticmethod
    def training_reminder(group_name: str, time: str, lang: str = "ru") -> Dict[str, str]:
        if lang == "ru":
            return {
                "title": "⚽ Напоминание о тренировке",
                "body": f"Тренировка группы {group_name} в {time}",
                "type": "training_reminder"
            }
        return {
            "title": "⚽ Reminder antrenament",
            "body": f"Antrenamentul grupei {group_name} la ora {time}",
            "type": "training_reminder"
        }
    
    @staticmethod
    def birthday_greeting(child_name: str, age: int, lang: str = "ru") -> Dict[str, str]:
        if lang == "ru":
            return {
                "title": "🎂 С Днём Рождения!",
                "body": f"Sunny Academy поздравляет {child_name} с {age}-летием! 🎉⚽",
                "type": "birthday"
            }
        return {
            "title": "🎂 La mulți ani!",
            "body": f"Sunny Academy îl felicită pe {child_name} cu {age} ani! 🎉⚽",
            "type": "birthday"
        }
    
    @staticmethod
    def new_message(sender_name: str) -> Dict[str, str]:
        return {
            "title": "💬 Новое сообщение",
            "body": f"Сообщение от {sender_name}",
            "type": "message"
        }
    
    @staticmethod
    def absence_approved(child_name: str, date: str, lang: str = "ru") -> Dict[str, str]:
        if lang == "ru":
            return {
                "title": "✅ Отсутствие подтверждено",
                "body": f"Отсутствие {child_name} на {date} подтверждено",
                "type": "absence_approved"
            }
        return {
            "title": "✅ Absența confirmată",
            "body": f"Absența lui {child_name} în data de {date} a fost confirmată",
            "type": "absence_approved"
        }
    
    @staticmethod
    def payment_confirmed(child_name: str, amount: float, lang: str = "ru") -> Dict[str, str]:
        if lang == "ru":
            return {
                "title": "✅ Оплата получена",
                "body": f"Платеж за {child_name} на сумму {amount} MDL успешно зачислен. Спасибо!",
                "type": "payment_confirmed"
            }
        return {
            "title": "✅ Plată recepționată",
            "body": f"Plata pentru {child_name} în sumă de {amount} MDL a fost înregistrată cu succes. Mulțumim!",
            "type": "payment_confirmed"
        }
    
    @staticmethod
    def new_invoice(child_name: str, month: str, amount: float, lang: str = "ru") -> Dict[str, str]:
        if lang == "ru":
            return {
                "title": "📄 Выставлен новый счет",
                "body": f"Выставлен счет за {month} для {child_name} на сумму {amount} MDL. Пожалуйста, оплатите до конца месяца.",
                "type": "new_invoice"
            }
        return {
            "title": "📄 Factură nouă",
            "body": f"A fost emisă factura pentru {month} pentru {child_name} în sumă de {amount} MDL. Vă rugăm să achitați până la sfârșitul lunii.",
            "type": "new_invoice"
        }
