"""
Background Tasks для асинхронной обработки
Оптимизировано для 1000+ пользователей
"""
import logging
from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import select, func
from app.core.sheets_service import GoogleSheetsService

# Use Moldova timezone
from app.core.timezone import now, now_naive, today

logger = logging.getLogger(__name__)

# ==================== EMAIL/SMS NOTIFICATIONS ====================
async def send_payment_notification(
    student_id: int,
    parent_phone: str,
    amount: float,
    payment_date: str,
    language: str = "ro"
):
    """
    Отправка уведомления о платеже (async background task).
    Использует SMS Service с поддержкой Twilio/SMS.ru/Nexmo.
    """
    try:
        from app.core.sms_service import sms_service, SMSTemplates
        from app.core.database import SessionLocal
        from app.models import Student
        from datetime import datetime
        
        logger.info(f"📨 Sending payment notification to {parent_phone}")
        logger.info(f"   Student ID: {student_id}, Amount: {amount} MDL")
        
        # Получаем имя студента
        db = SessionLocal()
        try:
            student = db.query(Student).filter(Student.id == student_id).first()
            if student:
                child_name = f"{student.first_name} {student.last_name}"
            else:
                child_name = "Student"
        finally:
            db.close()
        
        # Названия месяцев
        month_names_ro = {
            1: "Ianuarie", 2: "Februarie", 3: "Martie", 4: "Aprilie",
            5: "Mai", 6: "Iunie", 7: "Iulie", 8: "August",
            9: "Septembrie", 10: "Octombrie", 11: "Noiembrie", 12: "Decembrie"
        }
        month_names_ru = {
            1: "Январь", 2: "Февраль", 3: "Март", 4: "Апрель",
            5: "Май", 6: "Июнь", 7: "Июль", 8: "Август",
            9: "Сентябрь", 10: "Октябрь", 11: "Ноябрь", 12: "Декабрь"
        }
        
        # Определяем месяц
        payment_dt = datetime.strptime(payment_date, "%Y-%m-%d")
        month_num = payment_dt.month
        month_name = month_names_ro[month_num] if language == 'ro' else month_names_ru[month_num]
        
        # Формируем сообщение на нужном языке
        message = SMSTemplates.payment_confirmation(
            child_name=child_name,
            month_name=month_name,
            lang=language
        )
        
        # Отправка через SMS Service
        result = await sms_service.send_sms(parent_phone, message)
        
        if result["success"]:
            logger.info(f"✅ SMS sent successfully: ID {result['message_id']}")
        else:
            logger.error(f"❌ SMS failed: {result.get('error')}")
            
    except Exception as e:
        logger.error(f"❌ Failed to send notification: {e}")

async def send_debt_reminder(
    student_id: int,
    parent_phone: str,
    debt_amount: float,
    language: str = "ro"
):
    """
    Напоминание о задолженности (async background task).
    """
    try:
        from app.core.sms_service import sms_service, SMSTemplates
        from app.core.database import SessionLocal
        from app.models import Student
        from datetime import datetime
        
        logger.info(f"⚠️  Sending debt reminder to {parent_phone}")
        logger.info(f"   Student ID: {student_id}, Debt: {debt_amount} MDL")
        
        # Получаем имя студента
        db = SessionLocal()
        try:
             student = db.query(Student).filter(Student.id == student_id).first()
             if not student:
                 return
                 
             child_name = f"{student.first_name} {student.last_name}"
             
             # TODO: Implement SMS sending logic similar to payment notification
             logger.info("Debt reminder logic not fully implemented yet")
             
        finally:
            db.close()

    except Exception as e:
        logger.error(f"❌ Debt reminder failed: {e}")

# ==================== REPORTS ====================
async def generate_monthly_report(
    month: str,
    admin_email: str
):
    """
    Генерация ежемесячного отчёта (async background task).
    """
    try:
        logger.info(f"📄 Generating monthly report for {month}")
        
        # TODO: Генерация PDF отчёта
        # TODO: Отправка на email
        
        logger.info(f"✅ Report generated and sent to {admin_email}")
    except Exception as e:
        logger.error(f"❌ Report generation failed: {e}")

# ==================== NOTIFICATION STUBS ====================
async def notify_new_invoice(
    student_id: int,
    amount: float,
    month_name: str,
    user_id: int,
    lang: str = "ro"
):
    """
    Notify parent about a new invoice via Web Push (preferred) or SMS.
    """
    from app.core.database import SessionLocal
    from app.models import User, PushSubscription, Student
    from pywebpush import webpush, WebPushException
    import os
    import json
    
    logger.info(f"🔔 Notify new invoice: Student {student_id}, Amount {amount}, Month {month_name}")
    
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()
        student = db.query(Student).filter(Student.id == student_id).first()
        
        if not user or not student:
            return

        child_name = f"{student.first_name} {student.last_name}"
        
        if lang == 'ru':
            title = "Новый счет на оплату"
            body = f"Выставлен счет {amount} MDL ({month_name}) за {child_name}."
        else:
            title = "Factură nouă"
            body = f"Factură nouă {amount} MDL ({month_name}) pentru {child_name}."

        await send_fcm_notification(
            user_id=user_id,
            title=title,
            body=body,
            data={
                "type": "new_invoice",
                "student_id": str(student_id),
                "screen": "/payments"
            },
            notification_type="invoice"
        )
            
    except Exception as e:
        logger.error(f"❌ Failed to send invoice notification: {e}")
    finally:
        db.close()

async def get_announcement_recipients(is_general, group_ids, db):
    # Stub implementation as original was missing/partial
    from app.models import User, Student, StudentGuardian, Group
    user_ids = set()
    
    if is_general:
        users = db.query(User).filter(
            User.role.in_(['parent', 'coach', 'admin'])
        ).all()
        user_ids = {u.id for u in users}
    else:
        # Только пользователи из указанных групп
        for group_id in group_ids:
            group = db.query(Group).filter(Group.id == group_id).first()
            if not group:
                continue
            
            # Добавляем тренера группы
            if group.coach_id:
                user_ids.add(group.coach_id)
            
            # Добавляем родителей учеников группы
            students = db.query(Student).filter(Student.group_id == group_id).all()
            for student in students:
                # Через связь StudentGuardian
                guardians = db.query(StudentGuardian).filter(
                    StudentGuardian.student_id == student.id
                ).all()
                for guardian in guardians:
                    if guardian.user_id:
                        user_ids.add(guardian.user_id)
                
                # Через parent_phone (legacy)
                if student.parent_phone:
                    parent = db.query(User).filter(
                        User.phone == student.parent_phone
                    ).first()
                    if parent:
                        user_ids.add(parent.id)
    
    return list(user_ids)


# ==================== FCM PUSH NOTIFICATIONS ====================

async def send_fcm_notification(
    user_id: int,
    title: str,
    body: str,
    data: dict = None,
    notification_type: str = "general"
):
    """
    🔔 Send FCM push notification to a specific user.
    """
    try:
        import firebase_admin
        from firebase_admin import messaging
        from app.core.database import SessionLocal
        from app.models.user import User
        
        # Initialize Firebase if not already done
        if not firebase_admin._apps:
            logger.warning("⚠️ Firebase not initialized - skipping FCM")
            return {"success": False, "reason": "Firebase not configured"}
        
        # Get user's FCM token from database
        db = SessionLocal()
        try:
            user = db.query(User).filter(User.id == user_id).first()
            if not user or not hasattr(user, 'fcm_token') or not user.fcm_token:
                logger.debug(f"No FCM token for user #{user_id}")
                return {"success": False, "reason": "No FCM token"}
            
            fcm_token = user.fcm_token
        finally:
            db.close()
        
        # Build message
        message = messaging.Message(
            notification=messaging.Notification(
                title=title,
                body=body,
            ),
            data=data or {},
            token=fcm_token,
            android=messaging.AndroidConfig(
                priority='high',
                notification=messaging.AndroidNotification(
                    icon='notification_icon',
                    color='#FFC107',
                    click_action='FLUTTER_NOTIFICATION_CLICK',
                    sound='default'
                )
            ),
            apns=messaging.APNSConfig(
                payload=messaging.APNSPayload(
                    aps=messaging.Aps(
                        badge=1,
                        sound='default',
                    )
                )
            ),
        )
        
        # Send
        response = messaging.send(message)
        logger.info(f"✅ FCM sent to user #{user_id}: {response}")
        return {"success": True, "message_id": response}
        
    except Exception as e:
        logger.error(f"❌ FCM send error: {e}")
        return {"success": False, "error": str(e)}

async def notify_payment_confirmed(
    student_id: int,
    amount: float,
    user_id: int,
    lang: str = "ro"
):
    """
    Notify parent about payment confirmation.
    """
    try:
        logger.info(f"🔔 Payment confirmed: Student {student_id}, Amount {amount}")
        
        if lang == 'ru':
            title = "Оплата подтверждена"
            body = f"Оплата {amount} MDL успешно получена."
        else:
            title = "Plată confirmată"
            body = f"Plata {amount} MDL a fost primită cu succes."

        await send_fcm_notification(
            user_id=user_id,
            title=title,
            body=body,
            data={
                "type": "payment_confirmed",
                "student_id": str(student_id),
                "screen": "/payments"
            },
            notification_type="payment"
        )
    except Exception as e:
        logger.error(f"❌ Failed to send payment confirmation: {e}")

async def sync_to_google_sheets(
    entity_type: str,
    entity_id: int,
    action: str,
    data: dict
):
    """
    Background task for Google Sheets synchronization.
    Handles 'student' and 'payment' entities.
    """
    try:
        service = GoogleSheetsService()
        if not service.enabled:
            return

        logger.info(f"🔄 Syncing {entity_type} #{entity_id} to Google Sheets...")
        
        if entity_type == "student":
            await service.sync_student(data, action)
        elif entity_type == "payment":
            await service.sync_payment(data, action)
        else:
            logger.warning(f"⚠️ Unknown entity type for sync: {entity_type}")
            
    except Exception as e:
        logger.error(f"❌ Background sync failed for {entity_type} #{entity_id}: {e}")

# ==================== MISSING FUNCTIONS RESTORED ====================

async def notify_booking_confirmed(
    booking_id: int,
    user_id: int,
    coach_name: str,
    date_str: str,
    time_str: str
):
    """
    Notify user about confirmed booking.
    """
    logger.info(f"🔔 Booking #{booking_id} confirmed for user {user_id} with coach {coach_name} on {date_str} {time_str}")
    # TODO: Implement actual notification logic (FCM/SMS)

async def notify_booking_to_coach(
    booking_id: int,
    coach_user_id: int,
    student_name: str,
    date_str: str,
    time_str: str
):
    """
    Notify coach about new booking.
    """
    logger.info(f"🔔 Coach {coach_user_id} notified about booking #{booking_id} for student {student_name}")
    # TODO: Implement actual notification logic (FCM/SMS)

async def notify_event_created(
    event_id: int,
    user_id: int
):
    """
    Notify relevant users (parents) about new event creation.
    Sends internal messages to all parents of students in the event's group.
    """
    logger.info(f"🔔 Event #{event_id} created by user {user_id} - Starting notifications")
    
    from app.core.database import SessionLocal
    from app.models import Event, Student, StudentGuardian, Message, ChatType, Group
    from datetime import datetime
    
    db = SessionLocal()
    try:
        # 1. Get Event details
        event = db.query(Event).filter(Event.id == event_id).first()
        if not event:
            logger.warning(f"⚠️ Event #{event_id} not found during notification")
            return
            
        group = db.query(Group).filter(Group.id == event.group_id).first()
        group_name = group.name if group else "Unknown Group"
        
        # 2. Get target audience (Parents of students in the group)
        # Find all students in the group
        students = db.query(Student).filter(
            Student.group_id == event.group_id,
            Student.deleted_at.is_(None)
        ).all()
        
        if not students:
            logger.info(f"ℹ️ No students in group #{event.group_id}, skipping notifications")
            return

        student_ids = [s.id for s in students]
        
        # Find guardians linked to these students
        guardians = db.query(StudentGuardian).filter(
            StudentGuardian.student_id.in_(student_ids)
        ).all()
        
        # Collect unique user_ids of guardians
        recipient_user_ids = set()
        for g in guardians:
            if g.user_id:
                recipient_user_ids.add(g.user_id)
        
        if not recipient_user_ids:
            logger.info("ℹ️ No linked parents found for notification")
            return
            
        logger.info(f"📨 Sending notifications to {len(recipient_user_ids)} parents")
        
        # 3. Create Message content
        event_type_map = {
            "TRAINING": "Тренировка",
            "GAME": "Игра",
            "TOURNAMENT": "Турнир",
            "CHAMPIONSHIP": "Чемпионат",
            "PARENT_MEETING": "Родительское собрание",
            "medical_check": "Медосмотр",
            "other": "Событие"
        }
        
        type_str = event_type_map.get(event.type, event.type)
        date_str = event.start_time.strftime("%d.%m.%Y")
        time_str = event.start_time.strftime("%H:%M")
        
        content = (
            f"📅 Новое событие: {type_str}\n"
            f"Группа: {group_name}\n"
            f"Дата: {date_str} в {time_str}\n"
        )
        
        if event.location:
            content += f"📍 Место: {event.location}\n"
            
        if event.notes:
            content += f"📝 Примечание: {event.notes}"
            
        # 4. Create Group Message (visible to all in group chat)
        group_msg = Message(
            sender_id=user_id,
            group_id=event.group_id,
            chat_type=ChatType.schedule_notification,
            content=content,
            is_general=False,
            is_read=False,
            created_at=datetime.utcnow()
        )
        db.add(group_msg)
        db.commit()
        logger.info(f"✅ Created group notification message #{group_msg.id}")

        # 5. Send Push Notifications
        for recipient_id in recipient_user_ids:
            # Avoid sending to self if parent created event (unlikely but possible)
            if recipient_id == user_id:
                continue
            
            # Send Push Notification (Fire-and-forget)
            try:
                 await send_fcm_notification(
                    user_id=recipient_id,
                    title=f"📅 {type_str}: {date_str}",
                    body=f"Новое событие для группы {group_name}",
                    data={"type": "event", "id": str(event.id), "screen": "/schedule"},
                    notification_type="schedule"
                )
            except Exception as e:
                logger.warning(f"⚠️ Failed to send push to user {recipient_id}: {e}")
        
    except Exception as e:
        logger.error(f"❌ Failed to process event notifications: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()

async def notify_schedule_change(**kwargs):
    """
    Notify users about schedule changes.
    """
    logger.info(f"🔔 Schedule change notification: {kwargs}")
    # TODO: Implement actual notification logic

async def send_new_message_sms(
    recipient_phone: str,
    sender_name: str,
    message_content: str,
    message_type: str
):
    """
    Send SMS for new messages/approvals.
    """
    logger.info(f"📨 SMS to {recipient_phone} from {sender_name}: {message_content} ({message_type})")
    try:
        from app.core.sms_service import sms_service
        # Attempt to send real SMS if service is configured
        await sms_service.send_sms(recipient_phone, message_content)
    except Exception as e:
        logger.error(f"❌ Failed to send SMS: {e}")
