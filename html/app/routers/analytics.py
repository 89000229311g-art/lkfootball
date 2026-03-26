from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, extract, and_, case, desc
from typing import Optional, List, Dict
from datetime import datetime, date, timedelta

from app.core.deps import get_current_user, get_db
from app.models import User, Payment, Student, Group, Attendance, Event, AttendanceStatus, StudentSkills, UserRole, SalaryPayment, Expense
from app.services.analytics_export_service import export_monthly_analytics_task

import logging
logger = logging.getLogger(__name__)

router = APIRouter()

# ==================== EXPORT ENDPOINTS ====================

@router.post("/export-monthly")
async def trigger_monthly_export(
    year: int = None,
    month: int = None,
    current_user: User = Depends(get_current_user),
    background_tasks: BackgroundTasks = None
):
    """
    Manual trigger for monthly analytics export to Google Drive.
    Admin only.
    If year/month not provided, defaults to previous month.
    """
    if current_user.role.lower() not in ["super_admin", "owner"] and not (current_user.role.lower() == "admin" and current_user.can_view_analytics):
        raise HTTPException(status_code=403, detail="Not authorized")
    
    if not year or not month:
        today = datetime.now()
        if today.month == 1:
            month = 12
            year = today.year - 1
        else:
            month = today.month - 1
            year = today.year
            
    # Run in background to avoid blocking response
    background_tasks.add_task(export_monthly_analytics_task, year, month)
    
    return {"message": f"Export started for {month}.{year}"}


# ==================== ANALYTICS ENDPOINTS (Restored) ====================

@router.get("/revenue")
async def get_revenue(
    period: str = "month",
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get total revenue for a period.
    """
    if current_user.role.lower() not in ["super_admin", "owner"] and not (current_user.role.lower() == "admin" and current_user.can_view_analytics):
        raise HTTPException(status_code=403, detail="Not authorized")
    
    query = db.query(func.sum(Payment.amount)).filter(
        Payment.status == "completed",
        Payment.deleted_at.is_(None)
    )
    
    if start_date and end_date:
        query = query.filter(Payment.payment_date >= start_date, Payment.payment_date <= end_date)
    else:
        today = date.today()
        if period == "month":
            # If no range provided, default to current month
            # BUT: Frontend should always provide start/end range now.
            query = query.filter(extract('month', Payment.payment_date) == today.month,
                                 extract('year', Payment.payment_date) == today.year)
        elif period == "year":
            query = query.filter(extract('year', Payment.payment_date) == today.year)
            
    total = query.scalar() or 0.0
    
    # Calculate previous period for comparison
    previous_total = 0.0
    if start_date and end_date:
        try:
            start_dt = datetime.strptime(start_date, '%Y-%m-%d').date()
            end_dt = datetime.strptime(end_date, '%Y-%m-%d').date()
            duration = end_dt - start_dt
            
            # Previous period is same duration before start_date
            prev_end = start_dt - timedelta(days=1)
            prev_start = prev_end - duration
            
            prev_query = db.query(func.sum(Payment.amount)).filter(
                Payment.status == "completed",
                Payment.deleted_at.is_(None),
                Payment.payment_date >= prev_start,
                Payment.payment_date <= prev_end
            )
            previous_total = prev_query.scalar() or 0.0
        except ValueError:
            pass # Invalid date format

    return {
        "total": total, 
        "currency": "MDL",
        "previous_total": previous_total,
        "growth": ((total - previous_total) / previous_total * 100) if previous_total > 0 else (100 if total > 0 else 0)
    }

@router.get("/total-revenue-cached")
async def get_total_revenue_cached(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get total revenue all time.
    """
    if current_user.role.lower() not in ["super_admin", "owner"] and not (current_user.role.lower() == "admin" and current_user.can_view_analytics):
        raise HTTPException(status_code=403, detail="Not authorized")
        
    total = db.query(func.sum(Payment.amount)).filter(
        Payment.status == "completed",
        Payment.deleted_at.is_(None)
    ).scalar() or 0.0
    return {"total": total, "currency": "MDL"}

@router.get("/revenue-by-group")
async def get_revenue_by_group(
    month: Optional[int] = None,
    year: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get revenue breakdown by group for a specific month.
    """
    if current_user.role.lower() not in ["super_admin", "owner"] and not (current_user.role.lower() == "admin" and current_user.can_view_analytics):
        raise HTTPException(status_code=403, detail="Not authorized")
        
    today = date.today()
    target_month = month or today.month
    target_year = year or today.year
    
    results = db.query(
        Group.name,
        func.sum(Payment.amount)
    ).join(Student, Payment.student_id == Student.id)\
     .join(Group, Student.group_id == Group.id)\
     .filter(
         Payment.status == "completed",
         Payment.deleted_at.is_(None),
         extract('month', Payment.payment_date) == target_month,
         extract('year', Payment.payment_date) == target_year
     )\
     .group_by(Group.name).all()
     
    return [{"group": r[0], "amount": r[1]} for r in results]

@router.get("/financial-overview")
async def get_financial_report(
    period_type: str = "month",
    months_back: int = 12,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get financial overview (revenue, salaries, expenses) for last N months or specific range.
    """
    if current_user.role.lower() not in ["super_admin", "owner"] and not (current_user.role.lower() == "admin" and current_user.can_view_analytics):
        raise HTTPException(status_code=403, detail="Not authorized")
        
    if current_user.role.lower() == "admin" and not current_user.can_view_analytics:
        raise HTTPException(status_code=403, detail="Not authorized")
        
    is_restricted = False # If admin has access, they see everything
        
    if start_date:
        query_start = start_date
    else:
        today = date.today()
        # Default to 1st day of the starting month to align periods
        start_dt = today - timedelta(days=30 * months_back)
        query_start = date(start_dt.year, start_dt.month, 1)
    
    # 1. Revenue (Payments)
    revenue_results = []
    if not is_restricted:
        revenue_query = db.query(
            extract('year', Payment.payment_date).label('year'),
            extract('month', Payment.payment_date).label('month'),
            func.sum(Payment.amount).label('total')
        ).filter(
            Payment.status == "completed",
            Payment.deleted_at.is_(None),
            Payment.payment_date >= query_start
        )

        if end_date:
            revenue_query = revenue_query.filter(Payment.payment_date <= end_date)

        revenue_results = revenue_query.group_by('year', 'month').order_by('year', 'month').all()

    # 2. Salaries
    salaries_results = []
    if not is_restricted:
        salaries_query = db.query(
            SalaryPayment.period_year.label('year'),
            SalaryPayment.period_month.label('month'),
            func.sum(SalaryPayment.amount).label('total')
        ).filter(
            SalaryPayment.status == "completed",
            SalaryPayment.payment_date >= query_start
        )
        
        if end_date:
            salaries_query = salaries_query.filter(SalaryPayment.payment_date <= end_date)
            
        salaries_results = salaries_query.group_by(SalaryPayment.period_year, SalaryPayment.period_month).all()

    # 3. Expenses
    expenses_query = db.query(
        extract('year', Expense.date).label('year'),
        extract('month', Expense.date).label('month'),
        func.sum(Expense.amount).label('total')
    ).filter(
        Expense.date >= query_start
    )
    
    if end_date:
        expenses_query = expenses_query.filter(Expense.date <= end_date)
        
    expenses_results = expenses_query.group_by('year', 'month').all()

    # Merge Data
    merged_data = {}
    
    def get_key(y, m):
        return f"{int(y)}-{int(m):02d}"

    for r in revenue_results:
        key = get_key(r.year, r.month)
        if key not in merged_data: merged_data[key] = {"period": key, "revenue": 0, "salary": 0, "expense": 0}
        merged_data[key]["revenue"] = float(r.total or 0)

    for r in salaries_results:
        key = get_key(r.year, r.month)
        if key not in merged_data: merged_data[key] = {"period": key, "revenue": 0, "salary": 0, "expense": 0}
        merged_data[key]["salary"] = float(r.total or 0)

    for r in expenses_results:
        key = get_key(r.year, r.month)
        if key not in merged_data: merged_data[key] = {"period": key, "revenue": 0, "salary": 0, "expense": 0}
        merged_data[key]["expense"] = float(r.total or 0)

    # Convert to list and sort
    data = sorted(list(merged_data.values()), key=lambda x: x["period"])
    
    # Calculate totals
    total_revenue = sum(d["revenue"] for d in data)
    total_salary = sum(d["salary"] for d in data)
    total_expense = sum(d["expense"] for d in data)
    net_profit = total_revenue - total_salary - total_expense
    
    average_revenue = total_revenue / len(data) if data else 0

    return {
        "total_revenue": total_revenue,
        "total_salary": total_salary,
        "total_expense": total_expense,
        "net_profit": net_profit,
        "average_revenue": average_revenue,
        "data": data
    }

@router.get("/attendance")
async def get_attendance_analytics(
    period: str = "month",
    months_back: int = 12,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get attendance statistics.
    """
    if current_user.role.lower() not in ["super_admin", "owner"] and not (current_user.role.lower() == "admin" and current_user.can_view_analytics):
        raise HTTPException(status_code=403, detail="Not authorized")
        
    if start_date:
        query_start = start_date
    else:
        today = date.today()
        query_start = today - timedelta(days=30 * months_back)
    
    # Calculate attendance statistics
    # 1. Global Stats
    query = db.query(Attendance).join(Event).filter(Event.start_time >= query_start)
    
    if end_date:
        # We need to filter by end_date too
        # Assuming end_date is inclusive, and start_time is datetime
        # We can use date(end_date) + 1 day for strictly less, or just compare dates if possible
        # Safest is to cast Event.start_time to date or use end of day
        # Let's assume end_date is a date object
        next_day = end_date + timedelta(days=1)
        query = query.filter(Event.start_time < next_day)

    total_records = query.count()
    
    present_count = query.filter(Attendance.status.in_([AttendanceStatus.PRESENT, AttendanceStatus.LATE])).count()
    absent_count = total_records - present_count
    attendance_rate = int((present_count / total_records * 100)) if total_records > 0 else 0
    
    # 2. Stats by Group
    groups_query = db.query(
        Group.name,
        func.count(Attendance.id).label('total'),
        func.sum(case((Attendance.status.in_([AttendanceStatus.PRESENT, AttendanceStatus.LATE]), 1), else_=0)).label('present')
    ).select_from(Attendance).join(Event).join(Student, Attendance.student_id == Student.id).join(Group, Student.group_id == Group.id).filter(
        Event.start_time >= query_start
    )

    if end_date:
        next_day = end_date + timedelta(days=1)
        groups_query = groups_query.filter(Event.start_time < next_day)

    groups_stats = groups_query.group_by(Group.name).all()
    
    by_groups = []
    for g in groups_stats:
        g_total = g.total
        g_present = int(g.present or 0)
        g_rate = int((g_present / g_total * 100)) if g_total > 0 else 0
        by_groups.append({
            "group_name": g.name,
            "rate": g_rate,
            "present": g_present,
            "total": g_total
        })
        
    return {
        "attendance_rate": attendance_rate,
        "present": present_count,
        "absent": absent_count,
        "total_records": total_records,
        "by_groups": by_groups
    }

@router.get("/coach-performance")
async def get_coach_performance(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get performance metrics for coaches:
    1. Win Rate (in games)
    2. Student Retention (active vs inactive in groups)
    3. Attendance Rate (in their sessions)
    4. Avg Skill Score (given by them)
    5. Avg Discipline Score (given by them)
    """
    if current_user.role.lower() not in ["super_admin", "owner"] and not (current_user.role.lower() == "admin" and current_user.can_view_analytics):
        raise HTTPException(status_code=403, detail="Not authorized")

    if not start_date:
        today = date.today()
        start_date = today - timedelta(days=180) # Default 6 months
    
    if not end_date:
        end_date = date.today()

    logger.info(f"Fetching coach performance from {start_date} to {end_date}")
    
    # Get all active coaches
    coaches = db.query(User).filter(
        func.lower(User.role) == "coach",
        User.is_active == True
    ).all()
    
    logger.info(f"Found {len(coaches)} active coaches for performance analytics")

    performance_data = []
    
    import traceback
    
    # Pre-fetch some data if possible, but loop is fine for N < 100 coaches
    for coach in coaches:
        try:
            # 1. Win Rate (Games)
            # Games for groups where this coach is assigned (primary)
            all_group_ids = [g.id for g in coach.coached_groups]
            
            # Use case-insensitive comparison or Enum
            games_query = db.query(Event).filter(
                Event.group_id.in_(all_group_ids),
                func.lower(Event.type) == "game",
                Event.status == "completed",
                Event.start_time >= start_date
            ) if all_group_ids else db.query(Event).filter(Event.id == -1)
            
            if end_date:
                games_query = games_query.filter(Event.start_time <= datetime.combine(end_date, datetime.max.time()))
                
            games = games_query.all()
            total_games = len(games)
            wins = 0
            for game in games:
                # Check if scores exist
                if game.score_home is None or game.score_away is None:
                    continue
                    
                is_home = (game.home_away or 'home').lower() == 'home'
                
                if is_home:
                    if game.score_home > game.score_away:
                        wins += 1
                else:
                    if game.score_away > game.score_home:
                        wins += 1
            
            win_rate = (wins / total_games * 100) if total_games > 0 else 0

            # 2. Attendance Rate
            attendance_rate = 0
            if all_group_ids:
                events_query = db.query(Event.id).filter(
                    Event.group_id.in_(all_group_ids),
                    Event.start_time >= start_date
                )
                
                if end_date:
                    end_dt = datetime.combine(end_date, datetime.max.time())
                    events_query = events_query.filter(Event.start_time <= end_dt)
                    
                event_ids = [e.id for e in events_query.all()]
                
                if event_ids:
                    stats = db.query(
                        func.count(Attendance.id).label('total'),
                        func.sum(case((Attendance.status.in_([AttendanceStatus.PRESENT, AttendanceStatus.LATE]), 1), else_=0)).label('present')
                    ).filter(Attendance.event_id.in_(event_ids)).first()
                    
                    total_recs = stats.total or 0
                    present_recs = stats.present or 0
                    attendance_rate = (present_recs / total_recs * 100) if total_recs > 0 else 0

            # 3. Retention (Active Students in Coach's Groups)
            all_groups = coach.coached_groups
            active_students = 0
            total_students_linked = 0
            
            for group in all_groups:
                g_students = group.students
                for s in g_students:
                    total_students_linked += 1
                    if s.status == "active":
                        active_students += 1
            
            retention_rate = (active_students / total_students_linked * 100) if total_students_linked > 0 else 0

            # 4. Skill & Discipline (Ratings given by this coach)
            skills_query = db.query(
                func.avg(StudentSkills.discipline).label('avg_discipline'),
                func.avg(StudentSkills.technique + StudentSkills.tactics + StudentSkills.physical + StudentSkills.speed).label('avg_skills')
            ).filter(
                StudentSkills.rated_by_id == coach.id,
                StudentSkills.created_at >= start_date
            )
            
            if end_date:
                skills_query = skills_query.filter(StudentSkills.created_at <= datetime.combine(end_date, datetime.max.time()))
                
            skills_stats = skills_query.first()
            avg_discipline = float(skills_stats.avg_discipline or 0)
            avg_skill_sum = float(skills_stats.avg_skills or 0)
            
            skill_score_pct = (avg_skill_sum / 40 * 100) if avg_skill_sum > 0 else 0

            performance_data.append({
                "id": coach.id,
                "name": coach.full_name,
                "avatar_url": coach.avatar_url,
                "win_rate": round(win_rate, 1),
                "total_games": total_games,
                "wins": wins,
                "attendance_rate": round(attendance_rate, 1),
                "retention_rate": round(retention_rate, 1),
                "active_students": active_students,
                "total_students": total_students_linked,
                "avg_discipline": round(avg_discipline, 1),
                "avg_skill_score_pct": round(skill_score_pct, 1)
            })
        except Exception as e:
            logger.error(f"Error calculating performance for coach {coach.id}: {str(e)}")
            logger.error(traceback.format_exc())
            # Skip this coach but continue with others
            continue

    return performance_data

@router.get("/top-players")
async def get_top_players(
    group_id: Optional[int] = None,
    month: Optional[int] = None,
    year: Optional[int] = None,
    limit: int = 10,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get top players based on Skills, Attendance, and Discipline.
    Score = (Skills Avg * 10 * 0.5) + (Attendance % * 0.3) + (Discipline * 10 * 0.2)
    """
    if current_user.role.lower() not in ["super_admin", "admin", "owner", "coach"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    # Time filters
    today = date.today()
    target_year = year or today.year
    
    # Base Query for Active Students
    students_query = db.query(Student).filter(Student.status == "active")
    
    if group_id:
        students_query = students_query.filter(Student.group_id == group_id)
        
    students = students_query.all()
    
    leaderboard = []
    
    # Determine date range for attendance
    if month:
        start_date = date(target_year, month, 1)
        if month == 12:
            end_date = date(target_year + 1, 1, 1)
        else:
            end_date = date(target_year, month + 1, 1)
    else:
        # Yearly aggregation
        start_date = date(target_year, 1, 1)
        end_date = date(target_year + 1, 1, 1)
        
    for student in students:
        # 1. Skills
        # If month provided: specific rating
        # If no month: average of all ratings in that year
        
        technique = 0
        tactics = 0
        physical = 0
        speed = 0
        discipline = 0
        
        if month:
            skill_record = db.query(StudentSkills).filter(
                StudentSkills.student_id == student.id,
                StudentSkills.rating_month == month,
                StudentSkills.rating_year == target_year
            ).first()
            
            if skill_record:
                technique = skill_record.technique
                tactics = skill_record.tactics
                physical = skill_record.physical
                speed = skill_record.speed
                discipline = skill_record.discipline
        else:
            # Yearly Average
            avg_skills = db.query(
                func.avg(StudentSkills.technique).label('tech'),
                func.avg(StudentSkills.tactics).label('tac'),
                func.avg(StudentSkills.physical).label('phys'),
                func.avg(StudentSkills.speed).label('spd'),
                func.avg(StudentSkills.discipline).label('disc')
            ).filter(
                StudentSkills.student_id == student.id,
                StudentSkills.rating_year == target_year
            ).first()
            
            if avg_skills and avg_skills.tech is not None:
                technique = float(avg_skills.tech)
                tactics = float(avg_skills.tac)
                physical = float(avg_skills.phys)
                speed = float(avg_skills.spd)
                discipline = float(avg_skills.disc)
        
        # Avg of physical/tech/tactics/speed (Discipline is separate metric)
        # Check if we have any data (sum > 0) to avoid 0 score for active students without ratings
        # If technique etc are 0, skill_avg is 0.
        
        skill_avg = (technique + tactics + physical + speed) / 4
        skill_score_component = skill_avg * 10 # 0-100
        
        discipline_score_component = discipline * 10 # 0-100
        
        # 2. Attendance
        attendance_stats = db.query(
            func.count(Attendance.id).label('total'),
            func.sum(case((Attendance.status.in_([AttendanceStatus.PRESENT, AttendanceStatus.LATE]), 1), else_=0)).label('present')
        ).join(Event).filter(
            Attendance.student_id == student.id,
            Event.start_time >= start_date,
            Event.start_time < end_date
        ).first()
        
        total_att = attendance_stats.total or 0
        present_att = float(attendance_stats.present or 0)
        attendance_pct = (present_att / total_att * 100) if total_att > 0 else 0
        
        # 3. Calculate Total Score (Weighted)
        # Weights: Skills 50%, Attendance 30%, Discipline 20%
        final_score = (skill_score_component * 0.5) + (attendance_pct * 0.3) + (discipline_score_component * 0.2)
        
        leaderboard.append({
            "id": student.id,
            "name": f"{student.first_name} {student.last_name}",
            "avatar_url": student.avatar_url,
            "group_name": student.group.name if student.group else "Без группы",
            "total_score": round(final_score, 1),
            "metrics": {
                "skill_rating": round(skill_avg, 1),
                "attendance_pct": round(attendance_pct, 1),
                "discipline_rating": discipline
            },
            "details": {
                "technique": technique,
                "tactics": tactics,
                "physical": physical,
                "speed": speed
            }
        })
            
    # Sort by Total Score DESC
    leaderboard.sort(key=lambda x: x["total_score"], reverse=True)
    
    return leaderboard[:limit]


@router.get("/revenue-by-service-type")
async def get_revenue_by_service_type(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    status: str = "completed",
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    📊 Аналитика доходов по типам услуг (на основе InvoiceItem.item_type).
    
    Параметры:
    - start_date, end_date: Диапазон дат (по умолчанию текущий месяц)
    - status: Фильтр по статусу платежей (completed, pending, all)
    
    Возвращает:
    - Разбивка по категориям услуг
    - Общая сумма по каждой категории
    - Процентное соотношение категорий
    - Количество транзакций по категориям
    """
    if current_user.role.lower() not in ["super_admin", "owner"] and not (current_user.role.lower() == "admin" and current_user.can_view_analytics):
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Импортируем модель InvoiceItem
    from app.models import InvoiceItem
    
    # Устанавливаем даты по умолчанию
    if not start_date:
        today = date.today()
        start_date = date(today.year, today.month, 1)
    if not end_date:
        today = date.today()
        if today.month == 12:
            end_date = date(today.year + 1, 1, 1) - timedelta(days=1)
        else:
            end_date = date(today.year, today.month + 1, 1) - timedelta(days=1)
    
    # Базовый запрос с учетом фильтра по статусу
    base_query = db.query(InvoiceItem).join(Payment)
    
    if status == "completed":
        base_query = base_query.filter(Payment.status == "completed")
    elif status == "pending":
        base_query = base_query.filter(Payment.status == "pending")
    elif status == "all":
        pass  # Без фильтра по статусу
    else:
        raise HTTPException(
            status_code=400, 
            detail="Неверный статус. Используйте: completed, pending, all"
        )
    
    # Фильтр по датам (используем payment_date из Payment)
    base_query = base_query.filter(
        Payment.payment_date >= start_date,
        Payment.payment_date <= end_date,
        Payment.deleted_at.is_(None)
    )
    
    # Получаем агрегированные данные по типам услуг
    results = base_query.with_entities(
        InvoiceItem.item_type,
        func.sum(InvoiceItem.total_price).label('total_amount'),
        func.count(InvoiceItem.id).label('transaction_count'),
        func.avg(InvoiceItem.unit_price).label('avg_unit_price')
    ).group_by(InvoiceItem.item_type).order_by(desc('total_amount')).all()
    
    # Общая сумма для расчета процентов
    total_amount = sum(r.total_amount for r in results) or 0.0
    
    # Формируем ответ
    service_types = []
    for r in results:
        service_types.append({
            "service_type": r.item_type,
            "total_amount": float(r.total_amount),
            "transaction_count": r.transaction_count,
            "avg_unit_price": float(r.avg_unit_price or 0),
            "percentage": round((r.total_amount / total_amount * 100), 2) if total_amount > 0 else 0
        })
    
    # Добавляем категории без транзакций (для полноты)
    all_categories = ["group_training", "individual_training", "equipment", "membership", "other"]
    existing_categories = [r.item_type for r in results]
    
    for category in all_categories:
        if category not in existing_categories:
            service_types.append({
                "service_type": category,
                "total_amount": 0.0,
                "transaction_count": 0,
                "avg_unit_price": 0.0,
                "percentage": 0.0
            })
    
    # Сортируем по сумме (убывание)
    service_types.sort(key=lambda x: x["total_amount"], reverse=True)
    
    return {
        "period": {
            "start_date": start_date.isoformat(),
            "end_date": end_date.isoformat(),
            "status_filter": status
        },
        "total_amount": float(total_amount),
        "service_types": service_types,
        "summary": {
            "total_transactions": sum(r.transaction_count for r in results),
            "categories_count": len([r for r in results if r.total_amount > 0]),
            "top_category": service_types[0]["service_type"] if service_types else None,
            "top_category_amount": service_types[0]["total_amount"] if service_types else 0.0
        }
    }


@router.get("/revenue-by-method")
async def get_revenue_by_method(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    status: str = "completed",
    group_by: str = "month", # month, none
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    📊 Аналитика доходов по методам оплаты (cash, card, bank_transfer).
    
    Параметры:
    - start_date, end_date: Диапазон дат
    - status: Фильтр по статусу платежей (completed, pending, all)
    - group_by: Группировка (month - по месяцам, none - за весь период)
    
    Возвращает:
    - Разбивка по методам оплаты
    """
    if current_user.role.lower() not in ["super_admin", "owner"] and not (current_user.role.lower() == "admin" and current_user.can_view_analytics):
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Устанавливаем даты по умолчанию
    if not start_date:
        today = date.today()
        start_date = date(today.year, today.month, 1)
    if not end_date:
        today = date.today()
        if today.month == 12:
            end_date = date(today.year + 1, 1, 1) - timedelta(days=1)
        else:
            end_date = date(today.year, today.month + 1, 1) - timedelta(days=1)
            
    # Базовый запрос
    base_query = db.query(Payment)
    
    if status == "completed":
        base_query = base_query.filter(Payment.status == "completed")
    elif status == "pending":
        base_query = base_query.filter(Payment.status == "pending")
    elif status == "all":
        pass
    else:
        # If status is not one of the above, assume it might be a comma-separated list or just ignore
        pass
        
    # IMPORTANT: Ensure date range is inclusive and covers full days
    # payment_date is Date, so >= and <= work for dates.
    # If start_date/end_date passed as strings, they are parsed automatically by FastAPI into date objects
    
    base_query = base_query.filter(
        Payment.payment_date >= start_date,
        Payment.payment_date <= end_date,
        Payment.deleted_at.is_(None)
    )

    if group_by == "month":
        # Группировка по месяцам и методам
        results = base_query.with_entities(
            extract('year', Payment.payment_date).label('year'),
            extract('month', Payment.payment_date).label('month'),
            Payment.method,
            func.sum(Payment.amount).label('total_amount'),
            func.count(Payment.id).label('transaction_count')
        ).group_by('year', 'month', Payment.method).order_by('year', 'month').all()
        
        # Формируем структуру данных
        time_series = {}
        
        for r in results:
            period_key = f"{int(r.year)}-{int(r.month):02d}"
            if period_key not in time_series:
                time_series[period_key] = {
                    "period": period_key,
                    "date": date(int(r.year), int(r.month), 1).isoformat(),
                    "total": 0.0,
                    "methods": {
                        "cash": 0.0,
                        "card": 0.0,
                        "bank_transfer": 0.0,
                        "other": 0.0
                    },
                    "counts": {
                        "cash": 0,
                        "card": 0,
                        "bank_transfer": 0,
                        "other": 0
                    }
                }
            
            method = r.method or "other"
            if method not in ["cash", "card", "bank_transfer"]:
                method = "other"
                
            amount = float(r.total_amount or 0)
            count = r.transaction_count
            
            time_series[period_key]["total"] += amount
            time_series[period_key]["methods"][method] += amount
            time_series[period_key]["counts"][method] += count
            
        # Преобразуем в список
        data = list(time_series.values())
        data.sort(key=lambda x: x["period"])
        
        return {
            "type": "monthly",
            "data": data,
            "total_period": sum(item["total"] for item in data)
        }
        
    else:
        # Группировка только по методам за весь период
        results = base_query.with_entities(
            Payment.method,
            func.sum(Payment.amount).label('total_amount'),
            func.count(Payment.id).label('transaction_count')
        ).group_by(Payment.method).all()
        
        methods_data = {
            "cash": 0.0,
            "card": 0.0,
            "bank_transfer": 0.0,
            "other": 0.0
        }
        counts_data = {
            "cash": 0,
            "card": 0,
            "bank_transfer": 0,
            "other": 0
        }
        
        total_amount = 0.0
        
        for r in results:
            method = r.method or "other"
            if method not in ["cash", "card", "bank_transfer"]:
                method = "other"
            
            amount = float(r.total_amount or 0)
            count = r.transaction_count
            
            methods_data[method] += amount
            counts_data[method] += count
            total_amount += amount
            
        return {
            "type": "total",
            "total_amount": total_amount,
            "methods": methods_data,
            "counts": counts_data
        }


@router.get("/service-type-analytics")
async def get_service_type_analytics(
    service_type: Optional[str] = None,
    group_by: str = "month",  # month, week, day
    months_back: int = 6,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    📈 Динамика доходов по типам услуг за последние месяцы.
    
    Параметры:
    - service_type: Фильтр по конкретному типу услуги (опционально)
    - group_by: Группировка по периодам (month, week, day)
    - months_back: Количество месяцев для анализа
    
    Возвращает временной ряд с динамикой доходов.
    """
    if current_user.role.lower() not in ["super_admin", "owner"] and not (current_user.role.lower() == "admin" and current_user.can_view_analytics):
        raise HTTPException(status_code=403, detail="Not authorized")
    
    from app.models import InvoiceItem
    
    # Определяем даты
    today = date.today()
    start_date = today - timedelta(days=30 * months_back)
    
    # Базовый запрос
    base_query = db.query(InvoiceItem).join(Payment).filter(
        Payment.status == "completed",
        Payment.payment_date >= start_date,
        Payment.deleted_at.is_(None)
    )
    
    # Фильтр по типу услуги
    if service_type:
        base_query = base_query.filter(InvoiceItem.item_type == service_type)
    
    # Группировка по периодам
    if group_by == "month":
        results = base_query.with_entities(
            extract('year', Payment.payment_date).label('year'),
            extract('month', Payment.payment_date).label('month'),
            InvoiceItem.item_type,
            func.sum(InvoiceItem.total_price).label('total_amount'),
            func.count(InvoiceItem.id).label('transaction_count')
        ).group_by('year', 'month', InvoiceItem.item_type).order_by('year', 'month').all()
        
        # Формируем временной ряд
        time_series = {}
        for r in results:
            period_key = f"{int(r.year)}-{int(r.month):02d}"
            if period_key not in time_series:
                time_series[period_key] = {
                    "period": period_key,
                    "date": date(int(r.year), int(r.month), 1).isoformat(),
                    "total_amount": 0.0,
                    "transaction_count": 0,
                    "service_types": {}
                }
            
            time_series[period_key]["total_amount"] += float(r.total_amount)
            time_series[period_key]["transaction_count"] += r.transaction_count
            time_series[period_key]["service_types"][r.item_type] = {
                "amount": float(r.total_amount),
                "count": r.transaction_count
            }
    
    elif group_by == "week":
        # Для недельной группировки нужно больше логики
        # Упрощенный вариант - группировка по дням недели
        results = base_query.with_entities(
            func.strftime('%Y-%W', Payment.payment_date).label('week'),
            InvoiceItem.item_type,
            func.sum(InvoiceItem.total_price).label('total_amount'),
            func.count(InvoiceItem.id).label('transaction_count')
        ).group_by('week', InvoiceItem.item_type).order_by('week').all()
        
        time_series = {}
        for r in results:
            week_key = r.week
            if week_key not in time_series:
                time_series[week_key] = {
                    "period": week_key,
                    "total_amount": 0.0,
                    "transaction_count": 0,
                    "service_types": {}
                }
            
            time_series[week_key]["total_amount"] += float(r.total_amount)
            time_series[week_key]["transaction_count"] += r.transaction_count
            time_series[week_key]["service_types"][r.item_type] = {
                "amount": float(r.total_amount),
                "count": r.transaction_count
            }
    
    else:  # day
        results = base_query.with_entities(
            func.date(Payment.payment_date).label('day'),
            InvoiceItem.item_type,
            func.sum(InvoiceItem.total_price).label('total_amount'),
            func.count(InvoiceItem.id).label('transaction_count')
        ).group_by('day', InvoiceItem.item_type).order_by('day').all()
        
        time_series = {}
        for r in results:
            day_key = r.day.isoformat()
            if day_key not in time_series:
                time_series[day_key] = {
                    "period": day_key,
                    "date": r.day.isoformat(),
                    "total_amount": 0.0,
                    "transaction_count": 0,
                    "service_types": {}
                }
            
            time_series[day_key]["total_amount"] += float(r.total_amount)
            time_series[day_key]["transaction_count"] += r.transaction_count
            time_series[day_key]["service_types"][r.item_type] = {
                "amount": float(r.total_amount),
                "count": r.transaction_count
            }
    
    # Конвертируем в список и сортируем
    data = list(time_series.values())
    data.sort(key=lambda x: x["period"])
    
    return {
        "filter": {
            "service_type": service_type,
            "group_by": group_by,
            "months_back": months_back,
            "start_date": start_date.isoformat(),
            "end_date": today.isoformat()
        },
        "data": data,
        "summary": {
            "total_amount": sum(item["total_amount"] for item in data),
            "total_transactions": sum(item["transaction_count"] for item in data),
            "periods_count": len(data)
        }
    }
