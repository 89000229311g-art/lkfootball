"""
Parent Improvements Router:
- Absence requests (mark absence in advance)
- Photo gallery
- Achievements
- Coach recommendations (view)
"""

from typing import List, Optional
from datetime import date
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form, Query, BackgroundTasks
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import and_, or_
import os
import uuid

from app.core.deps import get_db, get_current_user
from app.core.timezone import now_naive  # Moldova timezone
from app.models import (
    User, Student, StudentGuardian, Group,
    Achievement, StudentPhoto, AbsenceRequest, CoachRecommendation, Message, ChatType
)

router = APIRouter()


# ==================== CHILDREN ENDPOINT ====================

@router.get("/children")
async def get_my_children(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> List[dict]:
    """
    👨‍👩‍👧 Get all children for the current parent.
    Returns detailed info about each child including group.
    """
    if current_user.role.lower() != "parent":
        # Allow admins to see empty list or test
        if current_user.role.lower() in ["super_admin", "admin"]:
            return []
        raise HTTPException(status_code=403, detail="Only parents can access this endpoint")
    
    # --- AUTO-LINKING LOGIC START (REFRESH) ---
    def normalize_phone(p):
        if not p: return ""
        # Remove all non-digits
        digits = "".join(filter(str.isdigit, str(p)))
        # Return last 8 digits if available
        # Молдавские номера: +373 69 123456 -> 69123456 (8 digits)
        # Но могут быть записаны как 069 123 456 -> 069123456 (9 digits)
        # Поэтому берем последние 8 цифр, это наиболее надежно
        return digits[-8:] if len(digits) >= 8 else digits

    # Get parent's phone numbers (primary and secondary)
    parent_phones = set()
    if current_user.phone:
        p = normalize_phone(current_user.phone)
        if p: parent_phones.add(p)
    if current_user.phone_secondary:
        p = normalize_phone(current_user.phone_secondary)
        if p: parent_phones.add(p)
    
    # Также проверяем логин пользователя, если он похож на телефон
    if current_user.phone and not current_user.phone.startswith("+"):
         # Если логин без плюса, возможно это локальный формат
         p = normalize_phone(current_user.phone)
         if p: parent_phones.add(p)

    if parent_phones:
        print(f"DEBUG: Auto-linking for user {current_user.id} ({current_user.full_name}). Phones: {parent_phones}")
        # Fetch ALL students to be safe, filtering in python is fast enough for <1000 students
        # and safer for string manipulation logic
        all_students = db.query(Student).filter(
            Student.deleted_at.is_(None)
        ).all()
        
        for student in all_students:
            student_phones = set()
            if student.parent_phone:
                p = normalize_phone(student.parent_phone)
                if p: student_phones.add(p)
            if student.emergency_phone:
                p = normalize_phone(student.emergency_phone)
                if p: student_phones.add(p)
            
            # Check for intersection (any matching phone number)
            if not parent_phones.isdisjoint(student_phones):
                print(f"DEBUG: Match found for student {student.id} ({student.first_name}) with phones {student_phones}")
                # Check if link exists
                exists = db.query(StudentGuardian).filter(
                    StudentGuardian.student_id == student.id,
                    StudentGuardian.user_id == current_user.id
                ).first()
                
                if not exists:
                    print(f"DEBUG: Creating link for student {student.id} and user {current_user.id}")
                    link = StudentGuardian(
                        student_id=student.id,
                        user_id=current_user.id,
                        relationship_type="Parent (Auto-linked)"
                    )
                    db.add(link)
        
        db.commit()
    else:
        print(f"DEBUG: No valid phones for user {current_user.id} ({current_user.full_name})")
    # --- AUTO-LINKING LOGIC END ---

    # Find all student links
    guardian_relations = db.query(StudentGuardian).filter(
        StudentGuardian.user_id == current_user.id
    ).all()
    
    student_ids = [rel.student_id for rel in guardian_relations]
    
    if not student_ids:
        return []
    
    # Fetch students with group info
    students = db.query(Student).options(
        joinedload(Student.group),
        joinedload(Student.achievements)
    ).filter(
        Student.id.in_(student_ids),
        Student.deleted_at.is_(None)
    ).all()
    
    result = []
    for s in students:
        result.append({
            "id": s.id,
            "first_name": s.first_name,
            "last_name": s.last_name,
            "full_name": f"{s.first_name} {s.last_name}",
            "dob": str(s.dob) if s.dob else None,
            "group_id": s.group_id,
            "group_name": s.group.name if s.group else None,
            "avatar_url": s.avatar_url,
            "status": s.status,
            "medical_certificate_expires": str(s.medical_certificate_expires) if s.medical_certificate_expires else None,
            "achievements": [
                {
                    "id": a.id,
                    "title": a.title, 
                    "date": str(a.achievement_date)
                } for a in s.achievements
            ]
        })
        
    return result


# ==================== ABSENCE REQUESTS ====================

@router.get("/absence-requests/all")
async def get_all_absence_requests(
    status: Optional[str] = Query(None, description="Filter by status"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> List[dict]:
    """
    Get all absence requests (for admins/coaches).
    Admins see all. Coaches see only for their students.
    """
    if current_user.role.lower() not in ["super_admin", "admin", "coach"]:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    
    query = db.query(AbsenceRequest).options(
        joinedload(AbsenceRequest.student).joinedload(Student.group),
        joinedload(AbsenceRequest.requester),
        joinedload(AbsenceRequest.approver)
    )
    
    if status:
        query = query.filter(AbsenceRequest.status == status)
    
    # Filter by role
    if current_user.role.lower() == "coach":
        # Get groups coached by this user
        coach_groups = db.query(Group).filter(Group.coach_id == current_user.id).all()
        coach_group_ids = [g.id for g in coach_groups]
        
        # Filter requests where student belongs to one of these groups
        query = query.join(Student).filter(Student.group_id.in_(coach_group_ids))
    
    requests = query.order_by(AbsenceRequest.created_at.desc()).limit(100).all()
    
    return [
        {
            "id": r.id,
            "student_id": r.student_id,
            "student_name": f"{r.student.first_name} {r.student.last_name}" if r.student else "Unknown",
            "group_id": r.student.group_id if r.student else None,
            "group_name": r.student.group.name if r.student and r.student.group else "No Group",
            "absence_date": str(r.absence_date),
            "reason": r.reason,
            "status": r.status,
            "requested_by": r.requester.full_name if r.requester else None,
            "approved_by": r.approver.full_name if r.approver else None,
            "created_at": str(r.created_at)
        }
        for r in requests
    ]


@router.post("/students/{student_id}/absence-request")
async def create_absence_request(
    student_id: int,
    absence_date: date,
    reason: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> dict:
    """
    Create absence request for a student.
    Parent can request for their children.
    Notifies the coach automatically.
    """
    # Check permissions
    if current_user.role.lower() not in ["super_admin", "admin", "coach"]:
        # Parent - check guardian relationship
        guardian = db.query(StudentGuardian).filter(
            StudentGuardian.student_id == student_id,
            StudentGuardian.user_id == current_user.id
        ).first()
        if not guardian:
            raise HTTPException(status_code=403, detail="Not authorized for this student")
    
    # Check if request already exists for this date
    existing = db.query(AbsenceRequest).filter(
        AbsenceRequest.student_id == student_id,
        AbsenceRequest.absence_date == absence_date
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Заявка на эту дату уже создана")
    
    # Create request
    absence = AbsenceRequest(
        student_id=student_id,
        requested_by=current_user.id,
        absence_date=absence_date,
        reason=reason,
        status="pending" if current_user.role.lower() == "parent" else "approved"
    )
    
    # Auto-approve for admin/coach
    if current_user.role.lower() in ["super_admin", "admin", "coach"]:
        absence.approved_by = current_user.id
    
    db.add(absence)
    db.commit()
    db.refresh(absence)
    
    # --- Notification Logic ---
    try:
        student = db.query(Student).get(student_id)
        if student:
            recipients = []
            
            # 1. Notify Coach
            if student.group and student.group.coach_id:
                recipients.append(student.group.coach_id)
            
            # 2. Notify Admins and Super Admins (Owners)
            admins = db.query(User).filter(
                User.role.in_(["super_admin", "admin"]),
                User.is_active == True,
                User.deleted_at.is_(None)
            ).all()
            
            for admin in admins:
                if admin.id != current_user.id and admin.id not in recipients:
                    recipients.append(admin.id)
            
            # Create message content
            msg_text = f"🔔 Заявка на пропуск: {student.first_name} {student.last_name}\n📅 Дата: {absence_date.strftime('%d.%m.%Y')}\n❓ Причина: {reason or 'Не указана'}"
            
            # Send internal messages
            for recipient_id in recipients:
                notification = Message(
                    sender_id=current_user.id,
                    receiver_id=recipient_id,
                    content=msg_text,
                    chat_type=ChatType.system,
                    is_read=False,
                    created_at=now_naive()
                )
                db.add(notification)
            
            db.commit()

            # 3. Send Real SMS to Admins/Coach (Improvement)
            # Use background tasks to avoid blocking response
            from app.core.sms_service import sms_service
            
            # Notify Admins via SMS
            for admin in admins:
                if admin.phone and admin.id != current_user.id:
                    # Simple SMS text
                    sms_text = f"Academy: Заявка на пропуск. {student.first_name} {student.last_name} ({absence_date.strftime('%d.%m')}). {reason or ''}"
                    # We can use background task or direct async call if we are in async context.
                    # Since we are in async def, we can await. But better to catch errors individually.
                    try:
                        await sms_service.send_sms(admin.phone, sms_text)
                    except Exception as e:
                        print(f"Failed to send SMS to admin {admin.id}: {e}")

            # Notify Coach via SMS
            if student.group and student.group.coach_id:
                coach = db.query(User).get(student.group.coach_id)
                if coach and coach.phone and coach.id != current_user.id:
                    sms_text = f"Academy: Ученик {student.first_name} {student.last_name} пропустит {absence_date.strftime('%d.%m')}. {reason or ''}"
                    try:
                        await sms_service.send_sms(coach.phone, sms_text)
                    except Exception as e:
                        print(f"Failed to send SMS to coach {coach.id}: {e}")
            
    except Exception as e:
        print(f"Failed to send notification: {e}")
        # Non-blocking error
    
    return {
        "id": absence.id,
        "message": "Заявка успешно отправлена тренеру",
        "status": absence.status
    }


@router.get("/students/{student_id}/absence-requests")
async def get_student_absence_requests(
    student_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> List[dict]:
    """
    Get all absence requests for a student.
    """
    # Check permissions
    if current_user.role.lower() not in ["super_admin", "admin", "coach"]:
        guardian = db.query(StudentGuardian).filter(
            StudentGuardian.student_id == student_id,
            StudentGuardian.user_id == current_user.id
        ).first()
        if not guardian:
            raise HTTPException(status_code=403, detail="Not authorized")
    
    requests = db.query(AbsenceRequest).options(
        joinedload(AbsenceRequest.requester),
        joinedload(AbsenceRequest.approver)
    ).filter(
        AbsenceRequest.student_id == student_id
    ).order_by(AbsenceRequest.absence_date.desc()).all()
    
    return [
        {
            "id": r.id,
            "absence_date": str(r.absence_date),
            "reason": r.reason,
            "status": r.status,
            "requested_by": r.requester.full_name if r.requester else None,
            "approved_by": r.approver.full_name if r.approver else None,
            "created_at": str(r.created_at)
        }
        for r in requests
    ]


@router.put("/absence-requests/{request_id}/approve")
async def approve_absence_request(
    request_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> dict:
    """
    Approve absence request.
    Admin/Coach only.
    """
    if current_user.role.lower() not in ["super_admin", "admin", "coach"]:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    
    absence = db.query(AbsenceRequest).options(joinedload(AbsenceRequest.student)).filter(AbsenceRequest.id == request_id).first()
    if not absence:
        raise HTTPException(status_code=404, detail="Request not found")
    
    absence.status = "approved"
    absence.approved_by = current_user.id
    absence.updated_at = now_naive()  # Moldova timezone
    
    # --- Notification Logic (ROBUST) ---
    try:
        print(f"🔄 Processing approval notification for request {request_id}...")
        
        # 1. Verify Requester
        requester_id = absence.requested_by
        if not requester_id:
            print(f"❌ Warning: Absence request {request_id} has no requested_by user!")
        else:
            requester = db.query(User).filter(User.id == requester_id).first()
            if not requester:
                print(f"❌ Warning: User ID {requester_id} not found in DB!")
            else:
                print(f"✅ Found requester: {requester.full_name} (ID: {requester.id})")
                
                # 2. Create System Message
                student_name = f"{absence.student.first_name} {absence.student.last_name}" if absence.student else "Вашего ребенка"
                msg_text = f"✅ Заявка на пропуск одобрена!\n👤 Ученик: {student_name}\n📅 Дата: {absence.absence_date.strftime('%d.%m.%Y')}"
                
                notification = Message(
                    sender_id=current_user.id,
                    recipient_id=requester.id,  # Explicitly use requester.id
                    content=msg_text,
                    chat_type=ChatType.system,
                    is_read=False,
                    created_at=now_naive()
                )
                db.add(notification)
                db.flush() # Ensure ID is generated
                print(f"✅ Notification created in DB! Message ID: {notification.id}")
                
                # 3. Push Notification (Background)
                from app.core.background_tasks import send_fcm_notification
                background_tasks.add_task(
                    send_fcm_notification,
                    user_id=requester.id,
                    title="✅ Пропуск одобрен",
                    body=f"Заявка на {absence.absence_date.strftime('%d.%m')} ({student_name}) одобрена.",
                    data={
                        "type": "absence_approved",
                        "student_id": str(absence.student_id),
                        "screen": "/communications"
                    },
                    notification_type="system_notification"
                )
                
                # 4. SMS Notification (Background)
                if requester.phone:
                    from app.core.background_tasks import send_new_message_sms
                    content = f"✅ Academy: Заявка одобрена. {student_name} ({absence.absence_date.strftime('%d.%m')})"
                    
                    background_tasks.add_task(
                        send_new_message_sms,
                        recipient_phone=requester.phone,
                        sender_name="Academy",
                        message_content=content,
                        message_type="absence_approved"
                    )
                    print(f"✅ SMS task added for {requester.phone}")

    except Exception as e:
        print(f"❌ CRITICAL ERROR in notification logic: {e}")
        import traceback
        traceback.print_exc()

    db.commit() # Commit changes including message
    
    return {"message": "Absence request approved"}


@router.put("/absence-requests/{request_id}/reject")
async def reject_absence_request(
    request_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> dict:
    """
    Reject absence request.
    Admin/Coach only.
    """
    if current_user.role.lower() not in ["super_admin", "admin", "coach"]:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    
    absence = db.query(AbsenceRequest).options(joinedload(AbsenceRequest.student)).filter(AbsenceRequest.id == request_id).first()
    if not absence:
        raise HTTPException(status_code=404, detail="Request not found")
    
    absence.status = "rejected"
    absence.approved_by = current_user.id
    absence.updated_at = now_naive()  # Moldova timezone
    
    # --- Notification Logic (ROBUST) ---
    try:
        print(f"🔄 Processing rejection notification for request {request_id}...")
        
        # 1. Verify Requester
        requester_id = absence.requested_by
        if not requester_id:
            print(f"❌ Warning: Absence request {request_id} has no requested_by user!")
        else:
            requester = db.query(User).filter(User.id == requester_id).first()
            if not requester:
                print(f"❌ Warning: User ID {requester_id} not found in DB!")
            else:
                print(f"✅ Found requester: {requester.full_name} (ID: {requester.id})")
                
                # 2. Create System Message
                student_name = f"{absence.student.first_name} {absence.student.last_name}" if absence.student else "Вашего ребенка"
                msg_text = f"❌ Заявка на пропуск отклонена.\n👤 Ученик: {student_name}\n📅 Дата: {absence.absence_date.strftime('%d.%m.%Y')}"
                
                notification = Message(
                    sender_id=current_user.id,
                    recipient_id=requester.id,
                    content=msg_text,
                    chat_type=ChatType.system,
                    is_read=False,
                    created_at=now_naive()
                )
                db.add(notification)
                db.flush()
                print(f"✅ Notification created in DB! Message ID: {notification.id}")
                
                # 3. Push Notification
                from app.core.background_tasks import send_fcm_notification
                background_tasks.add_task(
                    send_fcm_notification,
                    user_id=requester.id,
                    title="❌ Пропуск отклонен",
                    body=f"Заявка на {absence.absence_date.strftime('%d.%m')} отклонена.",
                    data={
                        "type": "absence_rejected",
                        "student_id": str(absence.student_id),
                        "screen": "/communications"
                    },
                    notification_type="system_notification"
                )
                
                # 4. SMS Notification
                if requester.phone:
                    from app.core.background_tasks import send_new_message_sms
                    content = f"❌ Academy: Заявка отклонена. {student_name} ({absence.absence_date.strftime('%d.%m')})"
                    
                    background_tasks.add_task(
                        send_new_message_sms,
                        recipient_phone=requester.phone,
                        sender_name="Academy",
                        message_content=content,
                        message_type="absence_rejected"
                    )

    except Exception as e:
        print(f"❌ CRITICAL ERROR in notification logic: {e}")
        import traceback
        traceback.print_exc()

    db.commit()
    
    return {"message": "Absence request rejected"}


# ==================== ACHIEVEMENTS ====================

@router.get("/students/{student_id}/achievements")
async def get_student_achievements(
    student_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> List[dict]:
    """
    Get all achievements for a student.
    """
    # Check permissions
    if current_user.role.lower() not in ["super_admin", "admin", "coach"]:
        guardian = db.query(StudentGuardian).filter(
            StudentGuardian.student_id == student_id,
            StudentGuardian.user_id == current_user.id
        ).first()
        if not guardian:
            raise HTTPException(status_code=403, detail="Not authorized")
    
    achievements = db.query(Achievement).options(
        joinedload(Achievement.coach)
    ).filter(
        Achievement.student_id == student_id
    ).order_by(Achievement.achievement_date.desc()).all()
    
    return [
        {
            "id": a.id,
            "title": a.title,
            "description": a.description,
            "achievement_type": a.achievement_type,
            "achievement_date": str(a.achievement_date),
            "event_name": a.event_name,
            "place": a.place,
            "image_url": a.image_url,
            "awarded_by": a.coach.full_name if a.coach else None
        }
        for a in achievements
    ]


@router.post("/students/{student_id}/achievements")
async def create_achievement(
    student_id: int,
    title: str = Form(...),
    achievement_type: str = Form(...),
    achievement_date: date = Form(...),
    description: Optional[str] = Form(None),
    event_name: Optional[str] = Form(None),
    place: Optional[int] = Form(None),
    image: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> dict:
    """
    Add achievement for a student.
    Coach/Admin only.
    """
    if current_user.role.lower() not in ["super_admin", "admin", "coach"]:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    
    # Verify student exists
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    
    image_url = None
    if image:
        upload_dir = "uploads/achievements"
        os.makedirs(upload_dir, exist_ok=True)
        file_ext = os.path.splitext(image.filename)[1]
        unique_filename = f"achievement_{student_id}_{uuid.uuid4()}{file_ext}"
        file_path = os.path.join(upload_dir, unique_filename)
        
        with open(file_path, "wb") as f:
            content = await image.read()
            f.write(content)
        
        image_url = f"/uploads/achievements/{unique_filename}"
    
    achievement = Achievement(
        student_id=student_id,
        title=title,
        description=description,
        achievement_type=achievement_type,
        achievement_date=achievement_date,
        event_name=event_name,
        place=place,
        image_url=image_url,
        awarded_by=current_user.id
    )
    
    db.add(achievement)
    db.commit()
    db.refresh(achievement)
    
    return {
        "id": achievement.id,
        "message": "Achievement added successfully"
    }


@router.delete("/achievements/{achievement_id}")
async def delete_achievement(
    achievement_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> dict:
    """
    Delete an achievement.
    Admin only.
    """
    if current_user.role.lower() not in ["super_admin", "admin"]:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    
    achievement = db.query(Achievement).filter(Achievement.id == achievement_id).first()
    if not achievement:
        raise HTTPException(status_code=404, detail="Achievement not found")
    
    # Delete image if exists
    if achievement.image_url:
        file_path = achievement.image_url.lstrip("/")
        if os.path.exists(file_path):
            os.remove(file_path)
    
    db.delete(achievement)
    db.commit()
    
    return {"message": "Achievement deleted"}


# ==================== PHOTO GALLERY ====================

@router.get("/students/{student_id}/photos")
async def get_student_photos(
    student_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> List[dict]:
    """
    Get photo gallery for a student.
    """
    # Check permissions
    if current_user.role.lower() not in ["super_admin", "admin", "coach"]:
        guardian = db.query(StudentGuardian).filter(
            StudentGuardian.student_id == student_id,
            StudentGuardian.user_id == current_user.id
        ).first()
        if not guardian:
            raise HTTPException(status_code=403, detail="Not authorized")
    
    photos = db.query(StudentPhoto).options(
        joinedload(StudentPhoto.uploader),
        joinedload(StudentPhoto.group)
    ).filter(
        StudentPhoto.student_id == student_id
    ).order_by(StudentPhoto.created_at.desc()).all()
    
    return [
        {
            "id": p.id,
            "photo_url": p.photo_url,
            "thumbnail_url": p.thumbnail_url,
            "caption": p.caption,
            "training_date": str(p.training_date) if p.training_date else None,
            "group_name": p.group.name if p.group else None,
            "uploaded_by": p.uploader.full_name if p.uploader else None,
            "is_profile_worthy": p.is_profile_worthy,
            "created_at": str(p.created_at)
        }
        for p in photos
    ]


@router.post("/students/{student_id}/photos")
async def upload_student_photo(
    student_id: int,
    photo: UploadFile = File(...),
    caption: Optional[str] = Form(None),
    training_date: Optional[date] = Form(None),
    is_profile_worthy: bool = Form(False),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> dict:
    """
    Upload photo to student gallery.
    Coach/Admin can upload.
    """
    if current_user.role.lower() not in ["super_admin", "admin", "coach"]:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    
    # Validate file type
    allowed_types = ["image/jpeg", "image/png", "image/gif", "image/webp"]
    if photo.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail="Invalid file type")
    
    upload_dir = "uploads/student_photos"
    os.makedirs(upload_dir, exist_ok=True)
    
    file_ext = os.path.splitext(photo.filename)[1]
    unique_filename = f"student_{student_id}_{uuid.uuid4()}{file_ext}"
    file_path = os.path.join(upload_dir, unique_filename)
    
    with open(file_path, "wb") as f:
        content = await photo.read()
        f.write(content)
    
    photo_url = f"/uploads/student_photos/{unique_filename}"
    
    student_photo = StudentPhoto(
        student_id=student_id,
        photo_url=photo_url,
        caption=caption,
        training_date=training_date,
        group_id=student.group_id,
        uploaded_by=current_user.id,
        is_profile_worthy=is_profile_worthy
    )
    
    db.add(student_photo)
    db.commit()
    db.refresh(student_photo)
    
    return {
        "id": student_photo.id,
        "photo_url": photo_url,
        "message": "Photo uploaded successfully"
    }


@router.delete("/photos/{photo_id}")
async def delete_student_photo(
    photo_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> dict:
    """
    Delete a photo from gallery.
    """
    if current_user.role.lower() not in ["super_admin", "admin", "coach"]:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    
    photo = db.query(StudentPhoto).filter(StudentPhoto.id == photo_id).first()
    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")
    
    # Delete file
    if photo.photo_url:
        file_path = photo.photo_url.lstrip("/")
        if os.path.exists(file_path):
            os.remove(file_path)
    
    db.delete(photo)
    db.commit()
    
    return {"message": "Photo deleted"}


# ==================== COACH RECOMMENDATIONS ====================

@router.get("/students/{student_id}/recommendations")
async def get_student_recommendations(
    student_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> List[dict]:
    """
    Get coach recommendations for a student.
    Parents can view their children's recommendations.
    """
    # Check permissions
    if current_user.role.lower() not in ["super_admin", "admin", "coach"]:
        guardian = db.query(StudentGuardian).filter(
            StudentGuardian.student_id == student_id,
            StudentGuardian.user_id == current_user.id
        ).first()
        if not guardian:
            raise HTTPException(status_code=403, detail="Not authorized")
    
    recommendations = db.query(CoachRecommendation).options(
        joinedload(CoachRecommendation.coach)
    ).filter(
        CoachRecommendation.student_id == student_id
    ).order_by(CoachRecommendation.created_at.desc()).all()
    
    return [
        {
            "id": r.id,
            "title": r.title,
            "description": r.description,
            "recommendation_type": r.recommendation_type,
            "priority": r.priority,
            "target_date": str(r.target_date) if r.target_date else None,
            "is_completed": r.is_completed,
            "completed_at": str(r.completed_at) if r.completed_at else None,
            "coach_name": r.coach.full_name if r.coach else None,
            "created_at": str(r.created_at)
        }
        for r in recommendations
    ]


@router.post("/students/{student_id}/recommendations")
async def create_recommendation(
    student_id: int,
    title: str,
    description: str,
    recommendation_type: str,
    priority: str = "normal",
    target_date: Optional[date] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> dict:
    """
    Add coach recommendation for a student.
    Coach/Admin only.
    """
    if current_user.role.lower() not in ["super_admin", "admin", "coach"]:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    
    if recommendation_type not in ["technique", "fitness", "tactical", "mental", "other"]:
        raise HTTPException(status_code=400, detail="Invalid recommendation type")
    
    if priority not in ["low", "normal", "high"]:
        raise HTTPException(status_code=400, detail="Invalid priority")
    
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    
    recommendation = CoachRecommendation(
        student_id=student_id,
        coach_id=current_user.id,
        title=title,
        description=description,
        recommendation_type=recommendation_type,
        priority=priority,
        target_date=target_date
    )
    
    db.add(recommendation)
    db.commit()
    db.refresh(recommendation)
    
    return {
        "id": recommendation.id,
        "message": "Recommendation added successfully"
    }


@router.put("/recommendations/{recommendation_id}/complete")
async def mark_recommendation_complete(
    recommendation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> dict:
    """
    Mark a recommendation as completed.
    Coach/Admin only.
    """
    if current_user.role.lower() not in ["super_admin", "admin", "coach"]:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    
    recommendation = db.query(CoachRecommendation).filter(
        CoachRecommendation.id == recommendation_id
    ).first()
    if not recommendation:
        raise HTTPException(status_code=404, detail="Recommendation not found")
    
    recommendation.is_completed = True
    recommendation.completed_at = now_naive()  # Moldova timezone
    db.commit()
    
    return {"message": "Recommendation marked as complete"}


# ==================== GROUP TEAMMATES VIEW ====================

@router.get("/my-children/{student_id}/group-teammates")
async def get_child_group_teammates(
    student_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> dict:
    """
    👨‍👩‍👧 Get list of teammates in the child's group.
    
    Parent can view all students in their child's group to see who
    their child trains with.
    
    Returns:
    - group_info: Group name, schedule, coach info
    - teammates: List of students (without financial data)
    """
    # Verify parent has access to this student
    guardian = db.query(StudentGuardian).filter(
        StudentGuardian.student_id == student_id,
        StudentGuardian.user_id == current_user.id
    ).first()
    
    if not guardian:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Вы не являетесь родителем этого ребёнка"
        )
    
    # Get student with group
    student = db.query(Student).options(
        joinedload(Student.group).joinedload(Group.coach)
    ).filter(Student.id == student_id).first()
    
    if not student:
        raise HTTPException(status_code=404, detail="Ученик не найден")
    
    if not student.group:
        return {
            "group_info": None,
            "teammates": [],
            "message": "Ребёнок не привязан к группе"
        }
    
    group = student.group
    
    # Get all students in the group (excluding archived)
    teammates = db.query(Student).filter(
        Student.group_id == group.id,
        Student.status.in_(["active", "frozen"])
    ).order_by(Student.last_name, Student.first_name).all()
    
    # Prepare response (without financial data for privacy)
    teammates_list = []
    for t in teammates:
        teammates_list.append({
            "id": t.id,
            "first_name": t.first_name,
            "last_name": t.last_name,
            "full_name": f"{t.first_name} {t.last_name}",
            "avatar_url": t.avatar_url,
            "dob": str(t.dob) if t.dob else None,
            "age": (date.today().year - t.dob.year) if t.dob else None,
            "status": t.status,
            "is_my_child": t.id == student_id
        })
    
    return {
        "group_info": {
            "id": group.id,
            "name": group.name,
            "schedule": group.schedule,
            "coach_name": group.coach.full_name if group.coach else None,
            "coach_phone": group.coach.phone if group.coach else None,
            "students_count": len(teammates),
            "max_capacity": group.max_capacity
        },
        "teammates": teammates_list,
        "my_child_name": f"{student.first_name} {student.last_name}"
    }
