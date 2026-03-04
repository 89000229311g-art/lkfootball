from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query, BackgroundTasks
from sqlalchemy.orm import Session
from datetime import datetime

from app.core.deps import get_db, get_current_user
from app.core.timezone import now as get_now, now_naive  # Moldova timezone
from app.core.audit_service import log_create, log_update, log_delete, entity_to_dict
from app.models import User, Event, Group, Student, Message, ChatType
from app.models.student_guardian import StudentGuardian
from app.models.schedule_template import GeneratedEvent, ScheduleTemplate
from app.schemas.event import (
    EventCreate,
    EventUpdate,
    EventResponse,
    EventWithDetails,
    EventPagination
)
from app.core.background_tasks import notify_booking_confirmed, notify_booking_to_coach, notify_event_created

router = APIRouter()

@router.post("/", response_model=EventResponse)
async def create_event(
    *,
    db: Session = Depends(get_db),
    event_in: EventCreate,
    current_user: User = Depends(get_current_user),
    background_tasks: BackgroundTasks
) -> Event:
    """
    Create a new event (admin and coach only).
    Coaches can only create events for their own groups.
    """
    user_role = current_user.role.lower() if current_user.role else ""
    if user_role not in ["super_admin", "admin", "coach"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough permissions"
        )
    
    # Validate group exists
    group = db.query(Group).filter(Group.id == event_in.group_id).first()
    if not group:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Group not found"
        )
    
    # Check if coach is creating event for their own group (primary or secondary)
    if user_role == "coach":
        is_coach = group.coach_id == current_user.id
        if not is_coach:
            is_coach = any(c.id == current_user.id for c in group.coaches)
        
        if not is_coach:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Coaches can only create events for their own groups"
            )
    
    # Validate time range
    if event_in.start_time >= event_in.end_time:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="End time must be after start time"
        )
    
    # Check for overlapping events (optional conflict detection)
    overlapping = db.query(Event).filter(
        Event.group_id == event_in.group_id,
        Event.start_time < event_in.end_time,
        Event.end_time > event_in.start_time
    ).first()
    
    if overlapping:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Event time conflicts with an existing event for this group"
        )
    
    event = Event(
        group_id=event_in.group_id,
        start_time=event_in.start_time,
        end_time=event_in.end_time,
        type=event_in.type,
        location=event_in.location,
        status=event_in.status,
        notes=event_in.notes,
        # coach_id=event_in.coach_id,  # Removed as it's not in Event model
        student_id=event_in.student_id,
        # Поля для игр
        opponent_team=event_in.opponent_team,
        home_away=event_in.home_away,
        score_home=event_in.score_home,
        score_away=event_in.score_away,
        meeting_time=event_in.meeting_time,
        departure_time=event_in.departure_time,
        transport_info=event_in.transport_info,
        uniform_color=event_in.uniform_color,
        equipment_required=event_in.equipment_required
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    
    # Log creation in audit
    log_create(db, "event", event, user=current_user)
    
    # Notify parents if event is created
    try:
        if event_in.send_notification and event.type in ["TOURNAMENT", "GAME", "CHAMPIONSHIP", "PARENT_MEETING", "TRAINING"]:
            background_tasks.add_task(notify_event_created, event.id, current_user.id)
    except Exception as e:
        print(f"Failed to queue notification task: {e}")
    
    # Notify coach if created by admin
    if group.coach_id and group.coach_id != current_user.id:
        msg = Message(
            sender_id=current_user.id,
            recipient_id=group.coach_id,
            chat_type=ChatType.schedule_notification,
            content=f"📅 Новая тренировка/игра назначена для группы {group.name}: {event.start_time.strftime('%d.%m %H:%M')}",
            is_read=False,
            created_at=datetime.utcnow()
        )
        db.add(msg)
    
    db.commit()
    
    return event

@router.get("/", response_model=EventPagination)
async def get_events(
    skip: int = 0,
    limit: int = 10000,
    group_id: Optional[int] = Query(None, description="Filter by group ID"),
    start_date: Optional[datetime] = Query(None, description="Filter events starting from this date"),
    end_date: Optional[datetime] = Query(None, description="Filter events ending before this date"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Retrieve events with optional filters.
    - Admins see all events
    - Coaches see only events for their assigned groups
    - Parents and others see all events (or could be filtered to their children's groups)
    """
    user_role = current_user.role.lower() if current_user.role else ""
    query = db.query(Event)
    
    # For coaches, filter to only their groups
    if user_role == "coach":
        coach_groups = db.query(Group).filter(
            (Group.coach_id == current_user.id) | 
            (Group.coaches.any(id=current_user.id))
        ).all()
        group_ids = [g.id for g in coach_groups]
        if group_ids:
            query = query.filter(Event.group_id.in_(group_ids))
        else:
            return {
                "data": [],
                "total": 0,
                "skip": skip,
                "limit": limit,
                "pages": 0
            }
            
    # For parents, filter to only their children's groups
    if user_role == "parent":
        # 1. Get all students linked to this parent (StudentGuardian)
        children_groups = db.query(Student.group_id).join(StudentGuardian).filter(
            StudentGuardian.user_id == current_user.id
        ).all()
        
        # 2. Extract group IDs (filter out None)
        parent_group_ids = [g[0] for g in children_groups if g[0]]
        
        # 3. Add filter if groups found, otherwise return empty
        if parent_group_ids:
            query = query.filter(Event.group_id.in_(parent_group_ids))
        else:
            return {
                "data": [],
                "total": 0,
                "skip": skip,
                "limit": limit,
                "pages": 0
            }
    
    # Apply filters
    if group_id:
        query = query.filter(Event.group_id == group_id)
    
    if start_date:
        query = query.filter(Event.start_time >= start_date)
    
    if end_date:
        query = query.filter(Event.end_time <= end_date)
    
    total = query.count()
    events = query.order_by(Event.start_time).offset(skip).limit(limit).all()
    
    return {
        "data": events,
        "total": total,
        "skip": skip,
        "limit": limit,
        "pages": (total + limit - 1) // limit if limit > 0 else 0
    }

@router.get("/{event_id}", response_model=EventWithDetails)
async def get_event(
    event_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Event:
    """
    Get event by ID with details.
    All authenticated users can view event details.
    """
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event not found"
        )
    
    return event

@router.put("/{event_id}", response_model=EventResponse)
async def update_event(
    *,
    db: Session = Depends(get_db),
    event_id: int,
    event_in: EventUpdate,
    update_future: bool = Query(False, description="Update this and all future events in the series"),
    current_user: User = Depends(get_current_user)
) -> Event:
    """
    Update event information (admin and coach only).
    Coaches can only update events for their own groups.
    If update_future=True, updates this event and all future events linked to the same schedule template.
    """
    user_role_update = current_user.role.lower() if current_user.role else ""
    if user_role_update not in ["super_admin", "admin", "coach"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough permissions"
        )
    
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event not found"
        )
    
    # Save old data for audit
    old_data = entity_to_dict(event)
    
    # Check permissions for coaches
    if user_role_update == "coach":
        group = db.query(Group).filter(Group.id == event.group_id).first()
        
        is_coach = False
        if group:
            if group.coach_id == current_user.id:
                is_coach = True
            else:
                # Check secondary coaches
                is_coach = any(c.id == current_user.id for c in group.coaches)
        
        if not is_coach:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Coaches can only update events for their own groups"
            )
    
    update_data = event_in.model_dump(exclude_unset=True)
    
    # Validate time range if being updated
    start_time = update_data.get('start_time', event.start_time)
    end_time = update_data.get('end_time', event.end_time)
    if start_time >= end_time:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="End time must be after start time"
        )
    
    events_to_update = [event]
    
    if update_future:
        gen_event = db.query(GeneratedEvent).filter(GeneratedEvent.event_id == event.id).first()
        if gen_event:
            future_events = db.query(Event).join(GeneratedEvent).filter(
                GeneratedEvent.template_id == gen_event.template_id,
                Event.start_time > event.start_time,
                Event.deleted_at.is_(None)
            ).all()
            events_to_update.extend(future_events)
    
    # Logic for updating future events times
    new_start_time = update_data.get('start_time')
    new_end_time = update_data.get('end_time')
    duration = None
    if new_start_time and new_end_time:
        duration = new_end_time - new_start_time
    
    for evt in events_to_update:
        if evt.id == event.id:
            # Direct update for the main event
            for field, value in update_data.items():
                setattr(evt, field, value)
            
            # Log update in audit for the main event
            log_update(db, "event", evt, old_data, user=current_user)
            
            # Notify coach if updated by admin
            if user_role_update != "coach":
                group = db.query(Group).filter(Group.id == evt.group_id).first()
                if group and group.coach_id and group.coach_id != current_user.id:
                    msg = Message(
                        sender_id=current_user.id,
                        recipient_id=group.coach_id,
                        chat_type=ChatType.schedule_notification,
                        content=f"✏️ Изменено расписание для группы {group.name}: {evt.start_time.strftime('%d.%m %H:%M')}",
                        is_read=False,
                        created_at=now_naive()
                    )
                    db.add(msg)
        else:
            # Update future events
            # 1. Update fields except ID, time (handled specially)
            for field, value in update_data.items():
                if field in ['start_time', 'end_time']:
                    continue
                if hasattr(evt, field):
                    setattr(evt, field, value)
            
            # 2. Handle time update
            if new_start_time and duration:
                # Keep the same date, but update time of day
                target_date = evt.start_time.date()
                
                # Combine target date with new time of day
                evt_new_start = datetime.combine(target_date, new_start_time.time())
                evt_new_end = evt_new_start + duration
                
                evt.start_time = evt_new_start
                evt.end_time = evt_new_end
        
        db.add(evt)
    
    db.commit()
    db.refresh(event)
    
    return event

@router.delete("/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_event(
    *,
    db: Session = Depends(get_db),
    event_id: int,
    delete_future: bool = Query(False, description="Delete this and all future events in the series"),
    current_user: User = Depends(get_current_user)
):
    """
    Delete an event (admin only) - uses soft delete.
    If delete_future=True, deletes this event and all future events linked to the same schedule template.
    """
    
    user_role_delete = current_user.role.lower() if current_user.role else ""
    if user_role_delete not in ["super_admin", "admin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough permissions"
        )
    
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event not found"
        )
    
    events_to_delete = [event]
    
    if delete_future:
        # Check if event is part of a series
        gen_event = db.query(GeneratedEvent).filter(GeneratedEvent.event_id == event.id).first()
        if gen_event:
            # Find all future events from the same template
            future_events = db.query(Event).join(GeneratedEvent).filter(
                GeneratedEvent.template_id == gen_event.template_id,
                Event.start_time > event.start_time,
                Event.deleted_at.is_(None)
            ).all()
            events_to_delete.extend(future_events)
    
    for evt in events_to_delete:
        # Log deletion in audit BEFORE soft delete
        # Only log the main event with full details, others maybe just log silently or skip to avoid audit spam
        # But for history tracking, we should probably log them.
        if evt.id == event.id:
            log_delete(db, "event", evt, user=current_user)
        
        # Soft delete the event
        evt.deleted_at = now_naive()
        evt.deleted_by_id = current_user.id
        db.add(evt)
    
    db.commit()

@router.get("/group/{group_id}", response_model=List[EventResponse])
async def get_events_by_group(
    group_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> List[Event]:
    """
    Get all events for a specific group.
    All authenticated users can view events.
    """
    # Validate group exists
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Group not found"
        )
    
    events = db.query(Event).filter(Event.group_id == group_id).order_by(Event.start_time).all()
    return events


# ==================== NEW: Schedule & Booking Endpoints ====================

@router.get("/schedule/weekly")
async def get_weekly_schedule(
    week_offset: int = Query(0, description="Week offset from current week (0=current, -1=previous, 1=next)"),
    group_id: Optional[int] = Query(None, description="Filter by group ID"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> dict:
    """
    📅 Get weekly schedule for mobile app.
    Returns events grouped by day of the week.
    """
    from datetime import date, timedelta
    
    today = date.today()
    week_start = today - timedelta(days=today.weekday()) + timedelta(weeks=week_offset)
    week_end = week_start + timedelta(days=6)
    
    query = db.query(Event).filter(
        Event.start_time >= datetime.combine(week_start, datetime.min.time()),
        Event.start_time <= datetime.combine(week_end, datetime.max.time())
    )
    
    # Filter by group
    if group_id:
        query = query.filter(Event.group_id == group_id)
    
    # For coaches, only show their groups (both main and assistant)
    user_role = current_user.role.lower() if current_user.role else ""
    if user_role == "coach":
        coach_groups = db.query(Group).filter(
            (Group.coach_id == current_user.id) | 
            (Group.coaches.any(id=current_user.id))
        ).all()
        group_ids = [g.id for g in coach_groups]
        if group_ids:
            query = query.filter(Event.group_id.in_(group_ids))
            
    # For parents, only show their children's groups
    if user_role == "parent":
        # 1. Get all students linked to this parent (StudentGuardian)
        children_groups = db.query(Student.group_id).join(StudentGuardian).filter(
            StudentGuardian.user_id == current_user.id
        ).all()
        
        # 2. Extract group IDs (filter out None)
        parent_group_ids = [g[0] for g in children_groups if g[0]]
        
        if parent_group_ids:
            query = query.filter(Event.group_id.in_(parent_group_ids))
        else:
            # If parent has no children in groups, show nothing
            return {
                "week_start": week_start.isoformat(),
                "week_end": week_end.isoformat(),
                "days": []
            }
    
    events = query.order_by(Event.start_time).all()
    
    # Group by day
    days = {}
    for i in range(7):
        day_date = week_start + timedelta(days=i)
        day_key = day_date.strftime("%Y-%m-%d")
        days[day_key] = {
            "date": day_key,
            "day_name": day_date.strftime("%A"),
            "events": []
        }
    
    for event in events:
        day_key = event.start_time.date().strftime("%Y-%m-%d")
        if day_key in days:
            group = db.query(Group).filter(Group.id == event.group_id).first()
            coach = db.query(User).filter(User.id == group.coach_id).first() if group and group.coach_id else None
            
            days[day_key]["events"].append({
                "id": event.id,
                "type": event.type,
                "start_time": event.start_time.isoformat(),
                "end_time": event.end_time.isoformat(),
                "location": event.location,
                "group_id": event.group_id,
                "group_name": group.name if group else None,
                "coach_name": coach.full_name if coach else None
            })
    
    return {
        "week_start": week_start.isoformat(),
        "week_end": week_end.isoformat(),
        "days": list(days.values())
    }


@router.get("/booking/coaches")
async def get_available_coaches(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> List[dict]:
    """
    👨‍🏫 Get list of coaches available for booking individual trainings.
    """
    coaches = db.query(User).filter(
        User.role.in_(["coach", "Coach", "COACH"]),
        User.is_active == True  # Filter active coaches only
    ).all()
    
    result = []
    for coach in coaches:
        # Count groups and students
        groups_count = db.query(Group).filter(Group.coach_id == coach.id).count()
        
        result.append({
            "id": coach.id,
            "name": coach.full_name,
            "phone": coach.phone,
            "avatar_url": coach.avatar_url,
            "groups_count": groups_count,
            "specialization": "Individual Training"
        })
    
    return result


@router.get("/booking/slots/{coach_id}")
async def get_coach_available_slots(
    coach_id: int,
    date_str: str = Query(..., description="Date in YYYY-MM-DD format"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> dict:
    """
    🗓️ Get available time slots for a coach on a specific date.
    """
    from datetime import time
    
    # Validate coach
    coach = db.query(User).filter(User.id == coach_id).first()
    if not coach:
        raise HTTPException(status_code=404, detail="Coach not found")
    
    try:
        target_date = datetime.strptime(date_str, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
    
    # Get existing events for this coach on this date
    existing_events = db.query(Event).join(Group).filter(
        Group.coach_id == coach_id,
        Event.start_time >= datetime.combine(target_date, time.min),
        Event.start_time <= datetime.combine(target_date, time.max)
    ).all()
    
    # Generate available slots (working hours: 09:00 - 20:00, 1 hour slots)
    slots = []
    for hour in range(9, 20):
        slot_start = datetime.combine(target_date, time(hour=hour))
        slot_end = datetime.combine(target_date, time(hour=hour + 1))
        
        # Check if slot conflicts with existing events
        is_available = True
        for event in existing_events:
            if event.start_time < slot_end and event.end_time > slot_start:
                is_available = False
                break
        
        slots.append({
            "start_time": slot_start.isoformat(),
            "end_time": slot_end.isoformat(),
            "available": is_available
        })
    
    return {
        "coach_id": coach_id,
        "coach_name": coach.full_name,
        "date": date_str,
        "slots": slots
    }


@router.post("/booking/book")
async def book_individual_training(
    coach_id: int,
    start_time: str,
    student_name: str,
    phone: str,
    notes: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    background_tasks: BackgroundTasks = None
) -> dict:
    """
    📝 Book an individual training session.
    """
    from datetime import timedelta
    
    # Validate coach
    coach = db.query(User).filter(User.id == coach_id).first()
    if not coach:
        raise HTTPException(status_code=404, detail="Coach not found")
    
    try:
        start_dt = datetime.fromisoformat(start_time)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid start_time format")
    
    end_dt = start_dt + timedelta(hours=1)
    
    # Check slot availability
    coach_groups = db.query(Group).filter(Group.coach_id == coach_id).all()
    group_ids = [g.id for g in coach_groups]
    
    if group_ids:
        conflict = db.query(Event).filter(
            Event.group_id.in_(group_ids),
            Event.start_time < end_dt,
            Event.end_time > start_dt
        ).first()
        
        if conflict:
            raise HTTPException(status_code=400, detail="This time slot is no longer available")
    
    # Create a special individual training group if doesn't exist
    individual_group = db.query(Group).filter(
        Group.name == f"Individual - {coach.full_name}",
        Group.coach_id == coach_id
    ).first()
    
    if not individual_group:
        individual_group = Group(
            name=f"Individual - {coach.full_name}",
            coach_id=coach_id,
            age_group="All",
            schedule="By appointment",
            max_students=1
        )
        db.add(individual_group)
        db.commit()
        db.refresh(individual_group)
    
    # Create the event
    event = Event(
        group_id=individual_group.id,
        start_time=start_dt,
        end_time=end_dt,
        type="individual",
        location=f"Individual: {student_name} ({phone})" + (f" - {notes}" if notes else "")
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    
    # 🔔 Send FCM notifications in background
    if background_tasks:
        # Notify the user who booked
        background_tasks.add_task(
            notify_booking_confirmed,
            booking_id=event.id,
            user_id=current_user.id,
            coach_name=coach.full_name,
            date_str=start_dt.date().isoformat(),
            time_str=start_dt.strftime('%H:%M')
        )
        
        # Notify the coach
        background_tasks.add_task(
            notify_booking_to_coach,
            booking_id=event.id,
            coach_user_id=coach.id,
            student_name=student_name,
            date_str=start_dt.date().isoformat(),
            time_str=start_dt.strftime('%H:%M')
        )
    
    return {
        "success": True,
        "booking_id": event.id,
        "message": "Individual training booked successfully",
        "details": {
            "coach": coach.full_name,
            "date": start_dt.date().isoformat(),
            "time": f"{start_dt.strftime('%H:%M')} - {end_dt.strftime('%H:%M')}",
            "student_name": student_name,
            "phone": phone
        }
    }


@router.get("/booking/my-bookings")
async def get_my_bookings(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> List[dict]:
    """
    Get current user's booking history.
    
    For parents: shows individual trainings booked for their children
    For coaches: shows their individual training sessions
    For admins: shows all individual trainings
    """
    user_role = current_user.role.lower() if current_user.role else ""
    
    query = db.query(Event).filter(Event.type == "individual")
    
    if user_role == "coach":
        # Coach sees only their individual trainings
        coach_groups = db.query(Group).filter(Group.coach_id == current_user.id).all()
        group_ids = [g.id for g in coach_groups]
        if group_ids:
            query = query.filter(Event.group_id.in_(group_ids))
        else:
            return []  # No groups = no bookings
    elif user_role == "parent":
        # Parent sees bookings where their phone/name is in location field
        # This is a workaround since we store booking info in location field
        user_phone = current_user.phone or ""
        user_name = current_user.full_name or ""
        query = query.filter(
            Event.location.ilike(f"%{user_phone}%") | 
            Event.location.ilike(f"%{user_name}%")
        )
    elif user_role not in ["super_admin", "admin"]:
        return []  # Other roles don't see bookings
    
    events = query.order_by(Event.start_time.desc()).limit(50).all()
    
    result = []
    for event in events:
        group = db.query(Group).filter(Group.id == event.group_id).first()
        coach = db.query(User).filter(User.id == group.coach_id).first() if group else None
        
        result.append({
            "id": event.id,
            "date": event.start_time.date().isoformat(),
            "start_time": event.start_time.isoformat(),
            "end_time": event.end_time.isoformat(),
            "coach_name": coach.full_name if coach else "Unknown",
            "type": event.type,
            "status": "confirmed" if event.start_time > get_now() else "completed",  # Moldova timezone
            "details": event.location
        })
    
    return result
