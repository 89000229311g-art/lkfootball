from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.core.deps import get_db, get_current_user
from app.models import User, Student
from app.services.birthday_service import get_birthday_students, check_birthday_status, send_birthday_greeting
from pydantic import BaseModel

router = APIRouter()

class BirthdayStatus(BaseModel):
    student_id: int
    full_name: str
    group_name: Optional[str]
    photo_url: Optional[str]
    group_sent: bool
    parents_sent: bool
    error: Optional[str] = None

from app.models.school_settings import SchoolSettings

class BirthdayTemplates(BaseModel):
    group_template: str
    individual_template: str

@router.get("/templates", response_model=BirthdayTemplates)
def get_birthday_templates(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get current birthday greeting templates."""
    if current_user.role not in ['admin', 'super_admin', 'owner']:
         raise HTTPException(status_code=403, detail="Not authorized")

    group_tmpl = db.query(SchoolSettings).filter(SchoolSettings.key == "birthday.template.group").first()
    ind_tmpl = db.query(SchoolSettings).filter(SchoolSettings.key == "birthday.template.individual").first()

    default_group = (
        "La mulți ani, {first_name}! 🎂🎉\n"
        "Astăzi sărbătorim ziua de naștere a lui {first_name} {last_name}! \n"
        "Echipa Academiei vă dorește multă sănătate, fericire și succes în fotbal! ⚽🥅"
    )
    
    default_individual = (
        "La mulți ani, {first_name}! 🎂🎉\n"
        "Academia vă felicită cu ocazia zilei de naștere! Vă dorim multe succese și realizări frumoase!"
    )

    return BirthdayTemplates(
        group_template=group_tmpl.value if group_tmpl and group_tmpl.value else default_group,
        individual_template=ind_tmpl.value if ind_tmpl and ind_tmpl.value else default_individual
    )

@router.post("/templates")
def update_birthday_templates(
    templates: BirthdayTemplates,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update birthday greeting templates."""
    if current_user.role not in ['admin', 'super_admin', 'owner']:
         raise HTTPException(status_code=403, detail="Not authorized")

    # Update Group Template
    group_tmpl = db.query(SchoolSettings).filter(SchoolSettings.key == "birthday.template.group").first()
    if not group_tmpl:
        group_tmpl = SchoolSettings(key="birthday.template.group", value=templates.group_template, description="Template for birthday greetings in group chat")
        db.add(group_tmpl)
    else:
        group_tmpl.value = templates.group_template

    # Update Individual Template
    ind_tmpl = db.query(SchoolSettings).filter(SchoolSettings.key == "birthday.template.individual").first()
    if not ind_tmpl:
        ind_tmpl = SchoolSettings(key="birthday.template.individual", value=templates.individual_template, description="Template for birthday greetings to parents")
        db.add(ind_tmpl)
    else:
        ind_tmpl.value = templates.individual_template

    db.commit()
    return {"status": "success"}

@router.get("/today", response_model=List[BirthdayStatus])
def get_todays_birthdays(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get all students with birthdays today and their notification status."""
    if current_user.role not in ['admin', 'super_admin', 'owner', 'coach']:
         raise HTTPException(status_code=403, detail="Not authorized")

    students = get_birthday_students(db)
    result = []
    
    for student in students:
        status_info = check_birthday_status(db, student)
        result.append(BirthdayStatus(
            student_id=student.id,
            full_name=f"{student.first_name} {student.last_name}",
            group_name=student.group.name if student.group else None,
            photo_url=student.avatar_url,
            group_sent=status_info.get("group_sent", False),
            parents_sent=status_info.get("parents_sent", False),
            error=status_info.get("error")
        ))
    
    return result

@router.post("/{student_id}/send")
def send_birthday_notification(
    student_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Manually send birthday notification for a student."""
    if current_user.role not in ['admin', 'super_admin', 'owner']:
         raise HTTPException(status_code=403, detail="Not authorized")

    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    success = send_birthday_greeting(db, student, sender_id=current_user.id)
    
    if not success:
        raise HTTPException(status_code=500, detail="Failed to send notification")
        
    return {"status": "success", "message": "Notification sent"}
