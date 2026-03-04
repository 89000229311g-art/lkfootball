
import logging
from datetime import datetime
import pytz
from sqlalchemy.orm import Session
from sqlalchemy import extract

from app.models.student import Student
from app.models.message import Message, ChatType
from app.models.user import User
from app.core.database import SessionLocal
from app.core.config import settings
from app.core.timezone import now_naive

logger = logging.getLogger(__name__)

def get_birthday_students(db: Session):
    """Get all active students who have a birthday today.
    Only includes students who are:
    - active (status='active')
    - not soft-deleted (deleted_at is None)
    - assigned to a valid group (group_id is not None)
    """
    tz = pytz.timezone(settings.TIMEZONE)
    today = datetime.now(tz)
    
    return db.query(Student).filter(
        extract('month', Student.dob) == today.month,
        extract('day', Student.dob) == today.day,
        Student.status == 'active',
        Student.deleted_at.is_(None),  # Ensure student is not deleted
        Student.group_id.isnot(None)   # Ensure student is in a group
    ).all()

from app.models.school_settings import SchoolSettings

def get_birthday_texts(student: Student, db: Session = None):
    """Get the birthday greeting texts for group and individual messages."""
    
    # Defaults
    default_group = (
        f"La mulți ani, {student.first_name}! 🎂🎉\n"
        f"Astăzi sărbătorim ziua de naștere a lui {student.first_name} {student.last_name}! \n"
        "Echipa Academiei vă dorește multă sănătate, fericire și succes în fotbal! ⚽🥅"
    )
    
    default_individual = (
        f"La mulți ani, {student.first_name}! 🎂🎉\n"
        f"Academia vă felicită cu ocazia zilei de naștere! Vă dorim multe succese și realizări frumoase!"
    )

    if not db:
        return default_group, default_individual

    # Fetch templates
    group_tmpl_setting = db.query(SchoolSettings).filter(SchoolSettings.key == "birthday.template.group").first()
    ind_tmpl_setting = db.query(SchoolSettings).filter(SchoolSettings.key == "birthday.template.individual").first()

    group_text = group_tmpl_setting.value if group_tmpl_setting and group_tmpl_setting.value else default_group
    individual_text = ind_tmpl_setting.value if ind_tmpl_setting and ind_tmpl_setting.value else default_individual

    # Replace placeholders
    replacements = {
        "{first_name}": student.first_name,
        "{last_name}": student.last_name,
        "{group_name}": student.group.name if student.group else "",
    }

    for key, val in replacements.items():
        group_text = group_text.replace(key, str(val) if val else "")
        individual_text = individual_text.replace(key, str(val) if val else "")

    return group_text, individual_text

def check_birthday_status(db: Session, student: Student):
    """Check if birthday greetings have been sent for this student today."""
    if not student.group_id:
        return {"group_sent": False, "parents_sent": False, "error": "No group assigned"}

    tz = pytz.timezone(settings.TIMEZONE)
    today_moldova = datetime.now(tz).replace(hour=0, minute=0, second=0, microsecond=0)
    today_start_utc = today_moldova.astimezone(pytz.utc).replace(tzinfo=None)
 
    group_text, individual_text = get_birthday_texts(student, db)
 
    # Check group message
    group_msg = db.query(Message).filter(
        Message.group_id == student.group_id,
        Message.content == group_text,
        Message.created_at >= today_start_utc
    ).first()

    # Check parent messages (if any parent received it, we consider it sent)
    parent_sent = False
    if student.guardians:
        for guardian in student.guardians:
            existing_individual = db.query(Message).filter(
                Message.recipient_id == guardian.user_id,
                Message.chat_type == ChatType.system,
                Message.content == individual_text,
                Message.created_at >= today_start_utc
            ).first()
            if existing_individual:
                parent_sent = True
                break
    
    return {
        "group_sent": bool(group_msg),
        "parents_sent": parent_sent
    }

def send_birthday_greeting(db: Session, student: Student, sender_id: int = None):
    """Send a birthday greeting to the student's group chat."""
    if not student.group_id:
        logger.warning(f"Student {student.id} has no group, cannot send greeting.")
        return False
    
    group_text, individual_text = get_birthday_texts(student, db)
    
    # Determine sender
    if not sender_id:
        # Use first super_admin or owner if system sender not specified
        system_user = db.query(User).filter(User.role.in_(['super_admin', 'owner'])).first()
        sender_id = system_user.id if system_user else 1 
        
    try:
        # Check if message already sent today to avoid duplicates
        # We check relative to Moldova day start, converted to UTC for DB comparison
        tz = pytz.timezone(settings.TIMEZONE)
        today_moldova = datetime.now(tz).replace(hour=0, minute=0, second=0, microsecond=0)
        today_start_utc = today_moldova.astimezone(pytz.utc).replace(tzinfo=None)

        existing = db.query(Message).filter(
            Message.group_id == student.group_id,
            Message.content == group_text,
            Message.created_at >= today_start_utc
        ).first()
        
        if existing:
            logger.info(f"Greeting already sent for {student.first_name} today.")
            return True

        # Create message
        # Use ChatType.group_chat for group messages
        # Use UTC for created_at to maintain consistency with other messages and avoid "future message" issues
        message = Message(
            sender_id=sender_id,
            group_id=student.group_id,
            chat_type=ChatType.group_chat,
            content=group_text,
            is_read=False,
            created_at=now_naive()
        )
        db.add(message)
        db.commit()
        logger.info(f"Sent birthday greeting to {student.first_name} (Group {student.group_id})")

        # Notify via Messenger (Telegram) if group has linked chat
        # FUTURE: Implement group chat linking logic here if needed
        
        # Also send individual notification to parents
        try:
            for guardian in student.guardians:
                # Check if individual message already sent today
                existing_individual = db.query(Message).filter(
                    Message.recipient_id == guardian.user_id,
                    Message.chat_type == ChatType.system,
                    Message.content == individual_text,
                    Message.created_at >= today_start_utc
                ).first()
                
                if not existing_individual:
                    ind_msg = Message(
                        sender_id=sender_id,
                        recipient_id=guardian.user_id,
                        chat_type=ChatType.system,
                        content=individual_text,
                        is_read=False,
                        created_at=now_naive()
                    )
                    db.add(ind_msg)
                    
                    # Notify parent via Messenger
                    # We can use fire-and-forget or await if async context available
                    # Since this is sync function, we can't await easily without async_to_sync wrapper
                    # But process_daily_birthdays is sync currently.
                    # Ideally we should use a background task for notifications
            
            db.commit() # Commit all individual messages
        except Exception as e:
            logger.error(f"Failed to send individual birthday notification for {student.id}: {e}")

        return True
    except Exception as e:
        logger.error(f"Failed to send greeting to {student.id}: {e}")
        db.rollback()
        return False

def process_daily_birthdays():
    """Scheduled task to process birthdays."""
    logger.info("🎂 Starting daily birthday check...")
    db = SessionLocal()
    try:
        students = get_birthday_students(db)
        if not students:
            logger.info("No birthdays today.")
            return

        logger.info(f"Found {len(students)} birthdays today.")
        for student in students:
            send_birthday_greeting(db, student)
            
    except Exception as e:
        logger.error(f"Error processing birthdays: {e}")
    finally:
        db.close()
