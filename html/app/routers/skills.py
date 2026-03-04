"""
Skills API Router - CRUD for student skill ratings
Coaches can rate students, parents can view their children's ratings
Updated for 10-point scale and Long-Term Performance Tracking.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import and_, func
from typing import List, Optional
from datetime import date, timedelta

from app.core.deps import get_db, get_current_user
from app.core.timezone import now_naive, today as get_today  # Moldova timezone
from app.models import User, Student, StudentSkills, StudentGuardian, Payment, Group, SeasonSummary
from app.schemas.skills import (
    SkillRatingCreate, SkillRatingUpdate, SkillRatingResponse,
    SkillsHistory, StudentCardResponse, SeasonSummarySchema,
    GroupAnalyticsResponse, StudentAnalyticsSummary
)

router = APIRouter(prefix="/skills", tags=["skills"])

# Russian month names for chart
MONTH_NAMES_RU = {
    1: "Янв", 2: "Фев", 3: "Мар", 4: "Апр", 5: "Май", 6: "Июн",
    7: "Июл", 8: "Авг", 9: "Сен", 10: "Окт", 11: "Ноя", 12: "Дек"
}


def update_season_summary(db: Session, student_id: int, year: int):
    """
    Recalculate and update Season Summary (GPA) for a student for a specific year.
    Should be called whenever a skill rating is added or updated.
    """
    # 1. Fetch all ratings for this student in this year
    ratings = db.query(StudentSkills).filter(
        and_(
            StudentSkills.student_id == student_id,
            StudentSkills.rating_year == year
        )
    ).all()
    
    if not ratings:
        return
        
    count = len(ratings)
    
    # 2. Calculate averages
    sum_technique = sum(r.technique or 0 for r in ratings)
    sum_tactics = sum(r.tactics or 0 for r in ratings)
    sum_physical = sum(r.physical or 0 for r in ratings)
    sum_discipline = sum(r.discipline or 0 for r in ratings)
    sum_speed = sum(r.speed or 0 for r in ratings)
    
    gpa_technique = sum_technique / count
    gpa_tactics = sum_tactics / count
    gpa_physical = sum_physical / count
    gpa_discipline = sum_discipline / count
    gpa_speed = sum_speed / count
    
    total_gpa = (gpa_technique + gpa_tactics + gpa_physical + gpa_discipline + gpa_speed) / 5
    
    # 3. Find or Create SeasonSummary
    summary = db.query(SeasonSummary).filter(
        and_(
            SeasonSummary.student_id == student_id,
            SeasonSummary.season_year == year
        )
    ).first()
    
    if not summary:
        summary = SeasonSummary(
            student_id=student_id,
            season_year=year
        )
        db.add(summary)
    
    # 4. Update fields
    summary.gpa_technique = round(gpa_technique, 2)
    summary.gpa_tactics = round(gpa_tactics, 2)
    summary.gpa_physical = round(gpa_physical, 2)
    summary.gpa_discipline = round(gpa_discipline, 2)
    summary.gpa_speed = round(gpa_speed, 2)
    summary.total_gpa = round(total_gpa, 2)
    summary.created_at = now_naive()
    
    db.commit()


def get_skills_history(db: Session, student_id: int, limit: int = 12) -> SkillsHistory:
    """Get skills history for chart display (last N months)"""
    ratings = db.query(StudentSkills).filter(
        StudentSkills.student_id == student_id
    ).order_by(
        StudentSkills.rating_year.asc(),
        StudentSkills.rating_month.asc()
    ).limit(limit).all()
    
    months = []
    technique = []
    tactics = []
    physical = []
    discipline = []
    speed = []
    
    for r in ratings:
        month_name = f"{MONTH_NAMES_RU.get(r.rating_month, str(r.rating_month))} {r.rating_year}"
        months.append(month_name)
        technique.append(r.technique or 5)
        tactics.append(r.tactics or 5)
        physical.append(r.physical or 5)
        discipline.append(r.discipline or 5)
        speed.append(r.speed or 5)
    
    return SkillsHistory(
        months=months,
        technique=technique,
        tactics=tactics,
        physical=physical,
        discipline=discipline,
        speed=speed
    )


def get_quarterly_history_logic(db: Session, student_id: int, limit: int = 8) -> SkillsHistory:
    """
    Get skills history aggregated by quarter.
    Limit is number of quarters to return.
    """
    # Fetch all ratings, sorted
    ratings = db.query(StudentSkills).filter(
        StudentSkills.student_id == student_id
    ).order_by(
        StudentSkills.rating_year.asc(),
        StudentSkills.rating_month.asc()
    ).all()

    # Group by Quarter
    # Key: (year, quarter) -> list of ratings
    quarters = {}
    
    for r in ratings:
        q = (r.rating_month - 1) // 3 + 1
        key = (r.rating_year, q)
        if key not in quarters:
            quarters[key] = []
        quarters[key].append(r)
    
    # Sort keys
    sorted_keys = sorted(quarters.keys())[-limit:]
    
    months = []
    technique = []
    tactics = []
    physical = []
    discipline = []
    speed = []
    
    for year, q in sorted_keys:
        q_ratings = quarters[(year, q)]
        count = len(q_ratings)
        
        # Calculate average for the quarter
        avg_tech = sum(r.technique or 5 for r in q_ratings) / count
        avg_tact = sum(r.tactics or 5 for r in q_ratings) / count
        avg_phys = sum(r.physical or 5 for r in q_ratings) / count
        avg_disc = sum(r.discipline or 5 for r in q_ratings) / count
        avg_speed = sum(r.speed or 5 for r in q_ratings) / count
        
        months.append(f"Q{q} {year}")
        technique.append(round(avg_tech))
        tactics.append(round(avg_tact))
        physical.append(round(avg_phys))
        discipline.append(round(avg_disc))
        speed.append(round(avg_speed))
        
    return SkillsHistory(
        months=months,
        technique=technique,
        tactics=tactics,
        physical=physical,
        discipline=discipline,
        speed=speed
    )


def calculate_age(dob: date) -> int:
    """Calculate age from date of birth"""
    if not dob:
        return None
    today = date.today()
    return today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))


@router.post("/", response_model=SkillRatingResponse, status_code=status.HTTP_201_CREATED)
async def create_skill_rating(
    rating_in: SkillRatingCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Create or update skill rating for a student.
    Only coaches, admins, and super_admins can rate.
    If rating for same month/year exists, it updates instead.
    """
    # Check permissions
    user_role = current_user.role.lower() if current_user.role else ""
    if user_role not in ["coach", "admin", "super_admin", "owner"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only coaches and admins can rate students"
        )
    
    # Normalize rating_month to the end of the quarter (3, 6, 9, 12)
    # This allows users to submit ratings "any time" during the quarter
    # if 1 <= rating_in.rating_month <= 12:
    #     rating_in.rating_month = ((rating_in.rating_month - 1) // 3 + 1) * 3
    # else:
    if not (1 <= rating_in.rating_month <= 12):
        # Fallback validation if it's somehow out of 1-12 range (schema handles this usually)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Month must be between 1 and 12"
        )

    # Check student exists
    student = db.query(Student).filter(Student.id == rating_in.student_id).first()
    if not student:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Student not found"
        )
    
    # Coach authorization: can only rate their own students
    if user_role == "coach":
        # Check if student belongs to coach's groups
        is_coach = db.query(Group).filter(
            Group.id == student.group_id,
            (Group.coach_id == current_user.id) | (Group.coaches.any(id=current_user.id))
        ).first() is not None
        
        if not is_coach:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only rate students in your assigned groups"
            )
    
    # Check if rating for this month already exists
    existing = db.query(StudentSkills).filter(
        and_(
            StudentSkills.student_id == rating_in.student_id,
            StudentSkills.rating_month == rating_in.rating_month,
            StudentSkills.rating_year == rating_in.rating_year
        )
    ).first()
    
    if existing:
        # Update existing rating
        for field in ["technique", "tactics", "physical", "discipline", "speed", "coach_comment"]:
            setattr(existing, field, getattr(rating_in, field))
        existing.rated_by_id = current_user.id
        existing.updated_at = now_naive()
        db.commit()
        db.refresh(existing)
        
        # Trigger Season Summary Recalculation
        update_season_summary(db, rating_in.student_id, rating_in.rating_year)
        
        return SkillRatingResponse(
            **{k: v for k, v in existing.__dict__.items() if not k.startswith('_')},
            rated_by_name=current_user.full_name
        )
    
    # Create new rating
    new_rating = StudentSkills(
        student_id=rating_in.student_id,
        rating_month=rating_in.rating_month,
        rating_year=rating_in.rating_year,
        technique=rating_in.technique,
        tactics=rating_in.tactics,
        physical=rating_in.physical,
        discipline=rating_in.discipline,
        speed=rating_in.speed,
        coach_comment=rating_in.coach_comment,
        talent_tags=rating_in.talent_tags,
        rated_by_id=current_user.id
    )
    
    db.add(new_rating)
    db.commit()
    db.refresh(new_rating)
    
    # Trigger Season Summary Recalculation
    update_season_summary(db, rating_in.student_id, rating_in.rating_year)
    
    return SkillRatingResponse(
        **{k: v for k, v in new_rating.__dict__.items() if not k.startswith('_')},
        rated_by_name=current_user.full_name
    )


@router.delete("/{rating_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_skill_rating(
    rating_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Delete a skill rating.
    Only coaches (of the student's group) and admins can delete.
    """
    # 1. Fetch rating
    rating = db.query(StudentSkills).filter(StudentSkills.id == rating_id).first()
    if not rating:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Rating not found"
        )
        
    student_id = rating.student_id
    rating_year = rating.rating_year
    
    # 2. Check permissions
    user_role = current_user.role.lower() if current_user.role else ""
    if user_role not in ["coach", "admin", "super_admin", "owner"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to delete ratings"
        )
        
    if user_role == "coach":
        # Check if student belongs to coach's groups
        student = db.query(Student).filter(Student.id == student_id).first()
        if not student:
            # Should not happen if rating exists (FK), but safety check
            raise HTTPException(status_code=404, detail="Student not found")
            
        is_coach = db.query(Group).filter(
            Group.id == student.group_id,
            (Group.coach_id == current_user.id) | (Group.coaches.any(id=current_user.id))
        ).first() is not None
        
        if not is_coach:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only delete ratings for students in your assigned groups"
            )

    # 3. Delete
    db.delete(rating)
    db.commit()
    
    # 4. Recalculate Season Summary
    update_season_summary(db, student_id, rating_year)
    
    return None


@router.get("/student/{student_id}", response_model=List[SkillRatingResponse])
async def get_student_skills(
    student_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get all skill ratings for a student"""
    # Parents can only see their own children
    if current_user.role == "parent":
        guardian_link = db.query(StudentGuardian).filter(
            and_(
                StudentGuardian.user_id == current_user.id,
                StudentGuardian.student_id == student_id
            )
        ).first()
        if not guardian_link:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only view your own children's skills"
            )
    
    ratings = db.query(StudentSkills).filter(
        StudentSkills.student_id == student_id
    ).order_by(
        StudentSkills.rating_year.desc(),
        StudentSkills.rating_month.desc()
    ).all()
    
    result = []
    for r in ratings:
        coach = db.query(User).filter(User.id == r.rated_by_id).first() if r.rated_by_id else None
        result.append(SkillRatingResponse(
            **{k: v for k, v in r.__dict__.items() if not k.startswith('_')},
            rated_by_name=coach.full_name if coach else None
        ))
    
    return result


@router.get("/student/{student_id}/history", response_model=SkillsHistory)
async def get_skills_history_endpoint(
    student_id: int,
    limit: int = 12,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get skills history for chart display"""
    # Parents can only see their own children
    if current_user.role == "parent":
        guardian_link = db.query(StudentGuardian).filter(
            and_(
                StudentGuardian.user_id == current_user.id,
                StudentGuardian.student_id == student_id
            )
        ).first()
        if not guardian_link:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only view your own children's skills"
            )
    
    return get_skills_history(db, student_id, limit)


@router.get("/student/{student_id}/history/quarterly", response_model=SkillsHistory)
async def get_skills_history_quarterly_endpoint(
    student_id: int,
    limit: int = 8,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get skills history aggregated by quarter"""
    # Parents can only see their own children
    if current_user.role == "parent":
        guardian_link = db.query(StudentGuardian).filter(
            and_(
                StudentGuardian.user_id == current_user.id,
                StudentGuardian.student_id == student_id
            )
        ).first()
        if not guardian_link:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only view your own children's skills"
            )
    
    return get_quarterly_history_logic(db, student_id, limit)


@router.get("/card/{student_id}", response_model=StudentCardResponse)
async def get_student_card(
    student_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get full student card for modal display.
    Includes: profile, finances, guardian info, skills, and season summaries.
    """
    # Parents can only see their own children
    if current_user.role == "parent":
        guardian_link = db.query(StudentGuardian).filter(
            and_(
                StudentGuardian.user_id == current_user.id,
                StudentGuardian.student_id == student_id
            )
        ).first()
        if not guardian_link:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only view your own children"
            )
    
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Student not found"
        )
    
    # Calculate total paid
    # Use cached value if available, otherwise calculate
    if student.total_paid_cache is not None:
        total_paid = student.total_paid_cache
    else:
        total_paid = db.query(func.coalesce(func.sum(Payment.amount), 0)).filter(
            and_(
                Payment.student_id == student_id,
                Payment.status == "completed",
                Payment.deleted_at.is_(None)
            )
        ).scalar() or 0.0
    
    # ======== PAYMENT LOGIC ========
    from dateutil.relativedelta import relativedelta
    today = date.today()
    if today.day >= 25:
        target_date = (today.replace(day=1) + relativedelta(months=1))
    else:
        target_date = today.replace(day=1)
    
    month_names_ru = {
        1: "Январь", 2: "Февраль", 3: "Март", 4: "Апрель",
        5: "Май", 6: "Июнь", 7: "Июль", 8: "Август",
        9: "Сентябрь", 10: "Октябрь", 11: "Ноябрь", 12: "Декабрь"
    }
    target_month_name = f"{month_names_ru.get(target_date.month, '')} {target_date.year}"
    
    group = db.query(Group).filter(Group.id == student.group_id).first() if student.group_id else None
    
    payment_for_month = db.query(Payment).filter(
        Payment.student_id == student_id,
        Payment.payment_period == target_date
    ).first()
    
    is_paid_this_month = False
    monthly_balance = 0.0
    balance_color = None
    
    if payment_for_month:
        if payment_for_month.status == "completed":
            is_paid_this_month = True
            monthly_balance = payment_for_month.amount
            balance_color = "green"
        elif payment_for_month.status == "pending":
            is_paid_this_month = False
            monthly_balance = 0.0
            balance_color = "red"
    
    # ======== GUARDIAN INFO ========
    guardian_data = {}
    guardian_link = db.query(StudentGuardian).filter(StudentGuardian.student_id == student_id).first()
    if guardian_link:
        guardian = db.query(User).filter(User.id == guardian_link.user_id).first()
        if guardian:
            guardian_data = {
                "guardian_id": guardian_link.id,
                "guardian_name": guardian.full_name,
                "guardian_phone": guardian.phone,
                "guardian_user_id": guardian.id
            }
            
    # ======== LATEST SKILLS ========
    latest_skills_data = None
    latest = db.query(StudentSkills).filter(
        StudentSkills.student_id == student_id
    ).order_by(
        StudentSkills.rating_year.desc(),
        StudentSkills.rating_month.desc()
    ).first()
    
    if latest:
        coach = db.query(User).filter(User.id == latest.rated_by_id).first() if latest.rated_by_id else None
        latest_skills_data = SkillRatingResponse(
            **{k: v for k, v in latest.__dict__.items() if not k.startswith('_')},
            rated_by_name=coach.full_name if coach else None
        )

    # ======== SEASON SUMMARIES (ARCHIVE) ========
    summaries = db.query(SeasonSummary).filter(
        SeasonSummary.student_id == student_id
    ).order_by(SeasonSummary.season_year.desc()).all()
    
    season_summaries_data = [
        SeasonSummarySchema.from_orm(s) for s in summaries
    ]

    return StudentCardResponse(
        id=student.id,
        first_name=student.first_name,
        last_name=student.last_name,
        full_name=f"{student.first_name} {student.last_name}",
        avatar_url=student.avatar_url,
        dob=student.dob.isoformat() if student.dob else None,
        age=calculate_age(student.dob),
        group_id=group.id if group else None,
        group_name=group.name if group else None,
        position=student.position,
        dominant_foot=student.dominant_foot,
        tshirt_size=student.tshirt_size,
        height=student.height,
        weight=student.weight,
        total_paid=total_paid,
        balance=student.balance,
        is_debtor=student.balance < 0,
        monthly_balance=monthly_balance,
        balance_color=balance_color,
        is_paid_this_month=is_paid_this_month,
        target_month=target_month_name,
        latest_skills=latest_skills_data,
        season_summaries=season_summaries_data,
        **guardian_data
    )


@router.get("/group/{group_id}/analytics", response_model=GroupAnalyticsResponse)
async def get_group_analytics(
    group_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get bulk analytics for a group.
    Optimized to fetch all data in one request.
    """
    # 1. Verify Group and Permissions
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
        
    # Check permissions
    if current_user.role == "coach":
        is_coach = (group.coach_id == current_user.id) or \
                   (any(c.id == current_user.id for c in group.coaches))
        if not is_coach:
            raise HTTPException(status_code=403, detail="Not authorized for this group")
    elif current_user.role not in ["admin", "super_admin", "owner"]:
         raise HTTPException(status_code=403, detail="Not authorized")

    # 2. Fetch Students
    students = db.query(Student).filter(Student.group_id == group_id).all()
    
    student_summaries = []
    total_gpa_sum = 0
    count = 0
    
    for s in students:
        # Get latest skills
        latest = db.query(StudentSkills).filter(
            StudentSkills.student_id == s.id
        ).order_by(
            StudentSkills.rating_year.desc(), 
            StudentSkills.rating_month.desc()
        ).first()
        
        technique = latest.technique if latest else 0
        tactics = latest.tactics if latest else 0
        physical = latest.physical if latest else 0
        discipline = latest.discipline if latest else 0
        
        # Calculate GPA
        if latest:
            gpa = (technique + tactics + physical + discipline) / 4
        else:
            gpa = 0.0
            
        # Determine Risk (Discipline < 5 or Physical < 4)
        risk = (discipline < 5 or physical < 4) if latest else False
        
        student_summaries.append(StudentAnalyticsSummary(
            student_id=s.id,
            full_name=f"{s.first_name} {s.last_name}",
            avatar_url=s.avatar_url,
            gpa=round(gpa, 2),
            technique=technique,
            tactics=tactics,
            physical=physical,
            discipline=discipline,
            risk=risk
        ))
        
        if latest:
            total_gpa_sum += gpa
            count += 1
            
    # Calculate Group Average
    group_average = round(total_gpa_sum / count, 2) if count > 0 else 0.0
    
    return GroupAnalyticsResponse(
        group_id=group.id,
        group_name=group.name,
        average_gpa=group_average,
        students=sorted(student_summaries, key=lambda x: x.gpa, reverse=True)
    )
