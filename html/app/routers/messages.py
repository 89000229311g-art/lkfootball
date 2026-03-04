from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status, Query, BackgroundTasks
from sqlalchemy.orm import Session, joinedload, aliased
from sqlalchemy import or_, func, desc, and_, case
from app.core.deps import get_db, get_current_user
from app.models import Message, User, Group, Student, Poll, PollVote, StudentGuardian
from app.models.message import ChatType, Post
from app.models.improvements import AnnouncementRead, GroupChatReadStatus
from app.schemas.message import (
    MessageCreate, 
    MessageResponse, 
    BulkSMSRequest, 
    AnnouncementCreate
)
from app.core.timezone import now_naive
import logging

# Configure logging
logger = logging.getLogger(__name__)

router = APIRouter()

def create_schedule_notification(
    db: Session,
    group_id: int,
    change_type: str,
    old_time: str,
    new_time: str,
    reason: str,
    sender_id: int
):
    """
    Create a schedule notification message in the group chat.
    """
    # Construct message content
    if change_type == "reschedule":
        content = f"📅 ИЗМЕНЕНИЕ РАСПИСАНИЯ\n\nБыло: {old_time}\nСтало: {new_time}\nПричина: {reason}"
    elif change_type == "cancel":
        content = f"❌ ОТМЕНА ТРЕНИРОВКИ\n\nДата: {old_time}\nПричина: {reason}"
    else:
        content = f"📅 Обновление расписания: {reason}"
        
    message = Message(
        group_id=group_id,
        sender_id=sender_id,
        chat_type=ChatType.schedule_notification,
        content=content,
        is_general=True,
        created_at=now_naive(),
        is_read=False
    )
    db.add(message)
    db.commit()
    db.refresh(message)
    return message

def _message_to_response(message: Message, current_user_id: Optional[int] = None) -> Dict[str, Any]:
    """Convert Message model to dictionary response with optimizations"""
    sender_name = "Unknown"
    sender_role = None
    if message.sender:
        sender_name = message.sender.full_name
        sender_role = message.sender.role

    group_name = None
    if message.group:
        group_name = message.group.name
        
    # Poll info if exists
    poll_data = None
    if message.poll:
        user_vote = None
        if current_user_id:
            # This requires eager loading of votes or separate query
            # For simplicity, we assume votes are loaded or we check simple property
            pass
            
    return {
        "id": message.id,
        "content": message.content,
        "sender_id": message.sender_id,
        "sender_name": sender_name,
        "sender_role": sender_role,
        "recipient_id": message.recipient_id,
        "group_id": message.group_id,
        "group_name": group_name,
        "chat_type": message.chat_type,
        "is_general": message.is_general,
        "created_at": message.created_at,
        "is_read": message.is_read,
        "is_pinned": message.is_pinned or False,
        "poll_id": message.poll_id
    }

# ==================== GROUP MESSAGES ====================

@router.get("/group/{group_id}", response_model=List[MessageResponse])
async def get_group_messages(
    group_id: int,
    limit: int = 50,
    skip: int = 0,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get messages for a specific group chat"""
    # Check if user has access to this group
    if current_user.role not in ["super_admin", "admin", "owner"]:
        # Check if user is coach of this group or parent of student in this group
        group = db.query(Group).filter(Group.id == group_id).first()
        if not group:
            raise HTTPException(status_code=404, detail="Group not found")
            
        # Check if user is coach (primary or secondary)
        is_coach = (group.coach_id == current_user.id)
        if not is_coach:
            # Check secondary coaches
            # We need to explicitly check the relationship or query the association table
            # Since we have the group object, we can check group.coaches if loaded, 
            # but it might not be eager loaded. Safer to query.
            is_secondary = db.query(Group).filter(
                Group.id == group_id, 
                Group.coaches.any(id=current_user.id)
            ).first() is not None
            is_coach = is_secondary
            
        if not is_coach:
            # Check if user is parent of student in this group
            is_parent = db.query(StudentGuardian).join(Student).filter(
                StudentGuardian.user_id == current_user.id,
                Student.group_id == group_id
            ).first() is not None
            
            if not is_parent:
                raise HTTPException(status_code=403, detail="Not authorized to access this group chat")

    messages = db.query(Message).options(
        joinedload(Message.sender),
        joinedload(Message.group)
    ).filter(
        Message.group_id == group_id,
        Message.chat_type.in_([ChatType.group_chat, ChatType.schedule_notification])
    ).order_by(Message.created_at.desc()).offset(skip).limit(limit).all()
    
    # Reverse to show oldest first in chat UI
    messages.reverse()
    
    return [_message_to_response(m, current_user.id) for m in messages]

@router.post("/group/{group_id}", response_model=MessageResponse)
async def send_group_message(
    group_id: int,
    message_in: MessageCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Send a message to a group chat"""
    # Validate group exists
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")

    # Check permission to send message
    if current_user.role not in ["super_admin", "admin", "owner"]:
        # Check if user is coach (primary or secondary)
        is_coach = (group.coach_id == current_user.id)
        if not is_coach:
            is_secondary = db.query(Group).filter(
                Group.id == group_id, 
                Group.coaches.any(id=current_user.id)
            ).first() is not None
            is_coach = is_secondary
            
        if not is_coach:
            # Check if user is parent of student in this group
            is_parent = db.query(StudentGuardian).join(Student).filter(
                StudentGuardian.user_id == current_user.id,
                Student.group_id == group_id
            ).first() is not None
            
            if not is_parent:
                raise HTTPException(status_code=403, detail="Not authorized to send messages to this group")

    message = Message(
        group_id=group_id,
        sender_id=current_user.id,
        chat_type=ChatType.group_chat,
        content=message_in.content,
        is_general=False,
        created_at=now_naive(),
        is_read=False
    )
    db.add(message)
    db.commit()
    db.refresh(message)
    
    # Reload with relationships for response
    message = db.query(Message).options(
        joinedload(Message.sender),
        joinedload(Message.group)
    ).filter(Message.id == message.id).first()
    
    return _message_to_response(message, current_user.id)

# ==================== DIRECT MESSAGES ====================

@router.get("/direct/{user_id}", response_model=List[MessageResponse])
async def get_direct_messages(
    user_id: int,
    limit: int = 50,
    skip: int = 0,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get direct messages between current user and another user"""
    messages = db.query(Message).options(
        joinedload(Message.sender),
        joinedload(Message.recipient)
    ).filter(
        Message.chat_type == ChatType.direct,
        or_(
            and_(Message.sender_id == current_user.id, Message.recipient_id == user_id),
            and_(Message.sender_id == user_id, Message.recipient_id == current_user.id)
        )
    ).order_by(Message.created_at.desc()).offset(skip).limit(limit).all()
    
    # Reverse to show oldest first
    messages.reverse()
    
    # Mark received messages as read
    unread_ids = [m.id for m in messages if m.recipient_id == current_user.id and not m.is_read]
    if unread_ids:
        db.query(Message).filter(Message.id.in_(unread_ids)).update({"is_read": True}, synchronize_session=False)
        db.commit()
    
    return [_message_to_response(m, current_user.id) for m in messages]

@router.post("/direct/{user_id}", response_model=MessageResponse)
async def send_direct_message(
    user_id: int,
    message_in: MessageCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Send a direct message to another user"""
    recipient = db.query(User).filter(User.id == user_id).first()
    if not recipient:
        raise HTTPException(status_code=404, detail="User not found")

    message = Message(
        sender_id=current_user.id,
        recipient_id=user_id,
        chat_type=ChatType.direct,
        content=message_in.content,
        is_general=False,
        created_at=now_naive(),
        is_read=False
    )
    db.add(message)
    db.commit()
    db.refresh(message)
    
    # Reload with relationships
    message = db.query(Message).options(
        joinedload(Message.sender),
        joinedload(Message.recipient)
    ).filter(Message.id == message.id).first()
    
    return _message_to_response(message, current_user.id)

# ==================== BULK SMS ====================

@router.post("/bulk-sms", response_model=dict)
async def send_bulk_sms(
    request: BulkSMSRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Send bulk SMS to students/parents.
    Currently simulates sending by logging and creating system messages.
    """
    if current_user.role.lower() not in ["super_admin", "admin", "owner"]:
        raise HTTPException(status_code=403, detail="Not authorized to send bulk SMS")
        
    # Build query for recipients
    query = db.query(Student).filter(Student.deleted_at.is_(None))
    
    if request.all_students:
        query = query.filter(Student.status == 'active')
    elif request.debtors_only:
        query = query.filter(or_(Student.is_debtor == True, Student.balance < 0))
    elif request.group_ids:
        query = query.filter(Student.group_id.in_(request.group_ids))
    elif request.student_ids:
        query = query.filter(Student.id.in_(request.student_ids))
    else:
        return {"status": "error", "message": "No recipients selected", "sent": 0}
        
    students = query.all()
    count = 0
    
    # Collect parent user IDs to send messages to
    recipient_ids = set()
    
    for student in students:
        # Find guardians to send in-app message
        guardians = db.query(StudentGuardian).filter(StudentGuardian.student_id == student.id).all()
        for g in guardians:
            recipient_ids.add(g.user_id)

        if not student.parent_phone:
            continue
            
        # Here we would integrate with SMS provider
        # For now, we just log it
        logger.info(f"SMS to {student.parent_phone} ({student.first_name}): {request.message}")
        count += 1
        
    # Create in-app messages for parents
    for user_id in recipient_ids:
        msg = Message(
            sender_id=current_user.id,
            recipient_id=user_id,
            chat_type=ChatType.system,
            content=request.message,
            is_general=False,
            created_at=now_naive(),
            is_read=False
        )
        db.add(msg)
    
    if recipient_ids:
        db.commit()
        
    return {"status": "success", "sent": count, "message": f"Queued {count} SMS messages and {len(recipient_ids)} in-app notifications"}

# ==================== SUPPORT CHAT ====================

@router.get("/support", response_model=List[MessageResponse])
async def get_support_messages(
    limit: int = 50,
    skip: int = 0,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get support messages for current user (if not admin)"""
    messages = db.query(Message).options(
        joinedload(Message.sender)
    ).filter(
        Message.chat_type == ChatType.support,
        or_(Message.sender_id == current_user.id, Message.recipient_id == current_user.id)
    ).order_by(Message.created_at.desc()).offset(skip).limit(limit).all()
    
    messages.reverse()
    
    return [_message_to_response(m, current_user.id) for m in messages]

@router.post("/support", response_model=MessageResponse)
async def send_support_message(
    message_in: MessageCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Send a message to support (admins)"""
    # Find an admin to assign as recipient (or just leave recipient null for 'support channel')
    # For now, we can assign to the first owner/admin or handle it as a broadcast to admins
    # A better approach is to leave recipient_id null and have admins query by chat_type=SUPPORT
    
    message = Message(
        sender_id=current_user.id,
        chat_type=ChatType.support,
        content=message_in.content,
        is_general=False,
        created_at=now_naive(),
        is_read=False
    )
    db.add(message)
    db.commit()
    db.refresh(message)
    
    message = db.query(Message).options(joinedload(Message.sender)).filter(Message.id == message.id).first()
    return _message_to_response(message, current_user.id)

@router.get("/support/chats", response_model=List[dict])
async def get_support_chats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get list of users who have sent support messages (for admins)"""
    if current_user.role.lower() not in ["super_admin", "admin", "owner"]:
        raise HTTPException(status_code=403, detail="Not authorized")
        
    # Get unique senders of support messages
    # distinct on sender_id
    subquery = db.query(
        Message.sender_id,
        func.max(Message.created_at).label("last_message_at"),
        func.count(Message.id).filter(
            Message.is_read == False,
            or_(Message.recipient_id == current_user.id, Message.recipient_id.is_(None))
        ).label("unread_count")
    ).filter(
        Message.chat_type == ChatType.support,
        Message.sender_id != current_user.id
    ).group_by(Message.sender_id).subquery()
    
    results = db.query(User, subquery.c.last_message_at, subquery.c.unread_count)\
        .join(subquery, User.id == subquery.c.sender_id)\
        .order_by(subquery.c.last_message_at.desc()).all()
        
    chats = []
    for user, last_at, unread in results:
        chats.append({
            "user": {
                "id": user.id,
                "full_name": user.full_name,
                "role": user.role,
                "avatar_url": user.avatar_url
            },
            "last_message_at": last_at,
            "unread_count": unread
        })
    return chats

@router.get("/support/chat/{user_id}", response_model=List[MessageResponse])
async def get_support_chat_with_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get support chat history with a specific user (for admins)"""
    if current_user.role.lower() not in ["super_admin", "admin", "owner"]:
        raise HTTPException(status_code=403, detail="Not authorized")
        
    messages = db.query(Message).options(
        joinedload(Message.sender),
        joinedload(Message.recipient)
    ).filter(
        Message.chat_type == ChatType.support,
        or_(
            Message.sender_id == user_id,
            and_(Message.sender_id == current_user.id, Message.recipient_id == user_id),
            and_(
                Message.sender_id.in_(
                    db.query(User.id).filter(User.role.in_(["super_admin", "admin", "owner"]))
                ),
                Message.recipient_id == user_id
            )
        )
    ).order_by(Message.created_at.desc()).all()

    unread_ids: list[int] = []
    for m in messages:
        if m.is_read:
            continue
        if m.recipient_id == current_user.id:
            unread_ids.append(m.id)
        elif m.recipient_id is None and m.sender_id == user_id:
            unread_ids.append(m.id)

    if unread_ids:
        db.query(Message).filter(Message.id.in_(unread_ids)).update(
            {"is_read": True}, synchronize_session=False
        )
        db.commit()
        for m in messages:
            if m.id in unread_ids:
                m.is_read = True

    messages.reverse()
    return [_message_to_response(m, current_user.id) for m in messages]

@router.post("/support/reply/{user_id}", response_model=MessageResponse)
async def reply_to_support(
    user_id: int,
    message_in: MessageCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Reply to a user in support chat"""
    if current_user.role.lower() not in ["super_admin", "admin", "owner"]:
        raise HTTPException(status_code=403, detail="Not authorized")
        
    message = Message(
        sender_id=current_user.id,
        recipient_id=user_id, # Target user
        chat_type=ChatType.support,
        content=message_in.content,
        is_general=False,
        created_at=now_naive(),
        is_read=False
    )
    db.add(message)
    db.commit()
    db.refresh(message)
    
    message = db.query(Message).options(joinedload(Message.sender)).filter(Message.id == message.id).first()
    return _message_to_response(message, current_user.id)

# ==================== NOTIFICATIONS ====================

@router.get("/notifications", response_model=List[MessageResponse])
async def get_notifications(
    limit: int = 50,
    skip: int = 0,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get notifications for current user"""
    # Notifications are messages with type SYSTEM or SCHEDULE_NOTIFICATION
    # Or announcements
    
    messages = db.query(Message).options(
        joinedload(Message.sender),
        joinedload(Message.group)
    ).filter(
        or_(
            Message.recipient_id == current_user.id,
            Message.is_general == True # Global announcements
        ),
        Message.chat_type.in_([
            ChatType.system,
            ChatType.schedule_notification,
            ChatType.announcement,
            ChatType.freeze_request
        ])
    ).order_by(Message.created_at.desc()).offset(skip).limit(limit).all()
    
    return [_message_to_response(m, current_user.id) for m in messages]

@router.post("/group/{group_id}/read")
async def mark_group_chat_read(
    group_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Mark all messages in a group chat as read for the current user"""
    status = db.query(GroupChatReadStatus).filter(
        GroupChatReadStatus.user_id == current_user.id,
        GroupChatReadStatus.group_id == group_id
    ).first()
    
    if status:
        status.last_read_at = now_naive()
    else:
        status = GroupChatReadStatus(
            user_id=current_user.id,
            group_id=group_id,
            last_read_at=now_naive()
        )
        db.add(status)
    
    db.commit()
    return {"status": "ok"}

def _get_user_group_ids_for_unread(db: Session, user: User) -> List[int]:
    """Helper to get user group IDs for unread count"""
    user_role = user.role.lower() if user.role else ""
    
    if user_role in ["super_admin", "admin", "owner"]:
        return [g.id for g in db.query(Group).all()]
    elif user_role == "coach":
        # Check primary coach
        primary_ids = [g.id for g in db.query(Group).filter(Group.coach_id == user.id).all()]
        # Check secondary coach
        secondary_ids = [g.id for g in db.query(Group).filter(Group.coaches.any(id=user.id)).all()]
        return list(set(primary_ids + secondary_ids))
    else:
        # Parent - groups via children
        guardian_links = db.query(StudentGuardian).filter(StudentGuardian.user_id == user.id).all()
        student_ids = [link.student_id for link in guardian_links]
        if not student_ids:
            return []
        students = db.query(Student).filter(Student.id.in_(student_ids)).all()
        return list(set(s.group_id for s in students if s.group_id))

@router.get("/notifications/unread-total", response_model=dict)
async def get_unread_total_count(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get total unread messages count (Direct + Notifications + Support + Feed/Announcements).
    """
    # 1. Direct Messages (recipient is current user)
    direct_query = db.query(func.count(Message.id)).filter(
        Message.recipient_id == current_user.id,
        Message.is_read == False,
        Message.chat_type == ChatType.direct
    )
    direct_count = direct_query.scalar() or 0

    # 2. Notifications (recipient is current user)
    # Includes: system, schedule_notification, announcement (if sent as message), freeze_request
    notification_query = db.query(func.count(Message.id)).filter(
        Message.recipient_id == current_user.id,
        Message.is_read == False,
        Message.chat_type.in_([
            ChatType.system,
            ChatType.schedule_notification,
            ChatType.announcement,
            ChatType.freeze_request
        ])
    )
    notification_count = notification_query.scalar() or 0
    
    # 3. Support Messages
    support_count = 0
    if current_user.role.lower() in ["super_admin", "admin", "owner"]:
        # For admins, count unread support messages from users
        support_query = db.query(func.count(Message.id)).filter(
            Message.chat_type.in_([ChatType.support]),
            Message.is_read == False,
            Message.sender_id != current_user.id, # Don't count own messages
            or_(
                Message.recipient_id == current_user.id,
                Message.recipient_id.is_(None)
            )
        )
        support_count = support_query.scalar() or 0
    else:
        # For regular users, count replies from support
        support_query = db.query(func.count(Message.id)).filter(
            Message.recipient_id == current_user.id,
            Message.is_read == False,
            Message.chat_type.in_([ChatType.support])
        )
        support_count = support_query.scalar() or 0

    # 4. Feed (Unconfirmed Announcements)
    # Get user's groups
    user_group_ids = _get_user_group_ids_for_unread(db, current_user)
    
    feed_query = db.query(func.count(Post.id)).filter(
        Post.is_published == True,
        Post.requires_confirmation == True,
        or_(
            Post.group_id.is_(None),
            Post.group_id.in_(user_group_ids) if user_group_ids else Post.group_id.is_(None)
        )
    )
    
    # Exclude posts already confirmed by user
    confirmed_subquery = db.query(AnnouncementRead.post_id).filter(
        AnnouncementRead.user_id == current_user.id
    ).subquery()
    
    feed_query = feed_query.filter(~Post.id.in_(confirmed_subquery))
    
    feed_count = feed_query.scalar() or 0

    # 5. Group Chats (Unread messages)
    group_chat_count = 0
    if user_group_ids:
        # Get last read timestamps for all groups
        read_statuses = db.query(GroupChatReadStatus).filter(
            GroupChatReadStatus.user_id == current_user.id,
            GroupChatReadStatus.group_id.in_(user_group_ids)
        ).all()
        
        read_map = {s.group_id: s.last_read_at for s in read_statuses}
        
        # Calculate unread for each group
        for group_id in user_group_ids:
            last_read = read_map.get(group_id)
            
            query = db.query(func.count(Message.id)).filter(
                Message.group_id == group_id,
                Message.chat_type.in_([ChatType.group_chat, ChatType.schedule_notification]),
                Message.sender_id != current_user.id # Don't count own messages
            )
            
            if last_read:
                query = query.filter(Message.created_at > last_read)
            
            # If no last_read record exists, we count all messages (or could limit to recent)
            # For now, counting all is the safest default to ensure they see activity
            
            count = query.scalar() or 0
            group_chat_count += count

    total = direct_count + notification_count + support_count + feed_count + group_chat_count
    
    return {
        "total": total,
        "direct": direct_count,
        "notifications": notification_count,
        "support": support_count,
        "feed": feed_count,
        "group_chat": group_chat_count
    }

@router.get("/notifications/unread", response_model=dict)
async def get_unread_notifications_count(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    count = db.query(func.count(Message.id)).filter(
        Message.recipient_id == current_user.id,
        Message.is_read == False,
        Message.chat_type.in_([
            ChatType.system,
            ChatType.schedule_notification,
            ChatType.announcement,
            ChatType.freeze_request
        ])
    ).scalar()
    return {"unread_count": count}

@router.post("/notifications/read-all")
async def mark_all_notifications_read(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    db.query(Message).filter(
        Message.recipient_id == current_user.id,
        Message.is_read == False
    ).update({"is_read": True}, synchronize_session=False)
    db.commit()
    return {"status": "ok"}

# ==================== COMMON ====================

@router.put("/{message_id}", response_model=MessageResponse)
async def update_message(
    message_id: int,
    message_in: MessageCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Update a message (only sender can update own messages).
    """
    message = db.query(Message).filter(Message.id == message_id).first()
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")
        
    # Check permission
    if message.sender_id != current_user.id:
        raise HTTPException(status_code=403, detail="You can only edit your own messages")
        
    # Update content
    message.content = message_in.content
    # message.updated_at = datetime.utcnow() # SQLAlchemy handles onupdate usually
    
    db.commit()
    db.refresh(message)
    return _message_to_response(message, current_user.id)


@router.delete("/{message_id}")
async def delete_message(
    message_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Delete a message.
    - User can delete their own messages.
    - Admins can delete any message (moderation).
    """
    message = db.query(Message).filter(Message.id == message_id).first()
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")
        
    user_role = current_user.role.lower() if current_user.role else ""
    is_admin = user_role in ["super_admin", "admin", "owner"]
    
    if message.sender_id != current_user.id and not is_admin:
        raise HTTPException(status_code=403, detail="You can only delete your own messages")
        
    db.delete(message)
    db.commit()
    return {"status": "ok", "message": "Message deleted"}
