"""
📅 Schedule Template Router
API для управления повторяющимся расписанием групп.

Функционал:
- Создание шаблонов расписания на год
- Генерация событий из шаблонов
- Редактирование отдельных событий
- Массовая отмена/перенос
- Исключения (праздники, каникулы)
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query, BackgroundTasks
from sqlalchemy.orm import Session
from datetime import datetime, timedelta, date, time
from sqlalchemy import and_
import json

from app.core.deps import get_db, get_current_user
from app.core.timezone import now_naive
from app.models import User, Group, Event, ScheduleTemplate, GeneratedEvent, ScheduleChange, Student, StudentGuardian
from app.schemas.schedule_template import (
    ScheduleTemplateCreate,
    ScheduleTemplateUpdate,
    ScheduleTemplateResponse,
    GenerateEventsRequest,
    GenerateEventsResponse,
    BulkCancelRequest,
    RescheduleEventRequest
)
from app.core.background_tasks import notify_schedule_change
from app.routers.messages import create_schedule_notification
from app.core.audit_service import log_create, log_update, log_delete, entity_to_dict

router = APIRouter()

# Названия дней недели
DAY_NAMES = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье']
DAY_NAMES_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']


def check_admin_or_coach(user: User, group_id: int, db: Session) -> bool:
    """Проверка прав: админ или тренер этой группы"""
    role = user.role.lower() if user.role else ""
    if role in ["super_admin", "admin", "owner"]:
        return True
    if role == "coach":
        group = db.query(Group).filter(Group.id == group_id).first()
        if group and group.coach_id == user.id:
            return True
        from app.models.group import group_coaches
        secondary = db.query(Group).join(
            group_coaches, Group.id == group_coaches.c.group_id
        ).filter(
            group_coaches.c.coach_id == user.id,
            Group.id == group_id
        ).first()
        return secondary is not None
    return False


# ==================== CRUD для шаблонов ====================

@router.post("/templates/clear-all", status_code=status.HTTP_200_OK)
async def clear_all_schedules(
    date_from: Optional[date] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    🧹 Полная очистка расписания (остановка всех шаблонов).
    
    Действия:
    1. Находит все АКТИВНЫЕ шаблоны.
    2. Деактивирует их (is_active=False).
    3. Удаляет все БУДУЩИЕ события, сгенерированные этими шаблонами.
    
    Это действие обратимо: можно зайти в Историю и восстановить шаблон (is_active=True),
    что запустит регенерацию событий.
    """
    if current_user.role not in ["super_admin", "admin", "owner"]:
        raise HTTPException(status_code=403, detail="Недостаточно прав")
    
    if not date_from:
        date_from = date.today()
        
    # 1. Находим активные шаблоны
    active_templates = db.query(ScheduleTemplate).filter(
        ScheduleTemplate.is_active == True
    ).all()
    
    count_templates = 0
    count_events = 0
    
    for template in active_templates:
        # Сохраняем для аудита
        old_data = entity_to_dict(template)
        
        # Деактивируем
        template.is_active = False
        db.add(template)
        
        # Удаляем будущие события
        generated_links = db.query(GeneratedEvent).filter(GeneratedEvent.template_id == template.id).all()
        event_ids = [ge.event_id for ge in generated_links]
        
        if event_ids:
            # Находим будущие события
            # Convert date_from to datetime for comparison with start_time
            start_datetime = datetime.combine(date_from, time.min)
            
            future_events = db.query(Event).filter(
                Event.id.in_(event_ids),
                Event.start_time >= start_datetime
            ).all()
            
            future_event_ids = [e.id for e in future_events]
            
            if future_event_ids:
                # Удаляем связи
                db.query(GeneratedEvent).filter(
                    GeneratedEvent.template_id == template.id,
                    GeneratedEvent.event_id.in_(future_event_ids)
                ).delete(synchronize_session=False)
                
                # Удаляем события (Soft delete было бы лучше, но здесь логика удаления)
                # В текущей реализации update_template делает hard delete для generated events
                # Чтобы поддержать "вернуть действие", лучше бы использовать soft delete,
                # но GeneratedEvent не имеет deleted_at.
                # Однако, если мы восстановим шаблон, он СГЕНЕРИРУЕТ их заново.
                # Так что hard delete допустим для generated events.
                
                db.query(Event).filter(Event.id.in_(future_event_ids)).delete(synchronize_session=False)
                count_events += len(future_event_ids)
        
        # Логируем изменение
        log_update(
            db, 
            "schedule_template", 
            template, 
            old_data, 
            user=current_user,
            reason="Массовая очистка расписания"
        )
        count_templates += 1
        
    db.commit()
    
    return {
        "message": f"Расписание очищено. Осталовлено шаблонов: {count_templates}, удалено событий: {count_events}",
        "templates_stopped": count_templates,
        "events_deleted": count_events
    }


@router.post("/templates", response_model=ScheduleTemplateResponse)
async def create_schedule_template(
    template_in: ScheduleTemplateCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    📅 Создать шаблон расписания для группы.
    """
    try:
        # Проверка прав
        if not check_admin_or_coach(current_user, template_in.group_id, db):
            raise HTTPException(status_code=403, detail="Нет прав на создание расписания для этой группы")
        
        # Проверка группы
        group = db.query(Group).filter(Group.id == template_in.group_id).first()
        if not group:
            raise HTTPException(status_code=404, detail="Группа не найдена")
        
        # Валидация дат
        if template_in.valid_from >= template_in.valid_until:
            raise HTTPException(status_code=400, detail="Дата окончания должна быть позже даты начала")
        
        # Валидация правил
        for rule in template_in.schedule_rules:
            try:
                # Support both HH:MM and HH:MM:SS
                time_str = rule.start_time
                if len(time_str) == 8: # HH:MM:SS
                    time_str = time_str[:5]
                datetime.strptime(time_str, "%H:%M")
                
                time_str = rule.end_time
                if len(time_str) == 8:
                    time_str = time_str[:5]
                datetime.strptime(time_str, "%H:%M")
            except ValueError:
                raise HTTPException(status_code=400, detail=f"Неверный формат времени: {rule.start_time} - {rule.end_time}")
        
        # Создание шаблона
        # Ensure times are HH:MM
        clean_rules = []
        for rule in template_in.schedule_rules:
            r_dict = rule.model_dump()
            if len(r_dict['start_time']) > 5:
                r_dict['start_time'] = r_dict['start_time'][:5]
            if len(r_dict['end_time']) > 5:
                r_dict['end_time'] = r_dict['end_time'][:5]
            clean_rules.append(r_dict)

        template = ScheduleTemplate(
            group_id=template_in.group_id,
            name=template_in.name,
            valid_from=template_in.valid_from,
            valid_until=template_in.valid_until,
            schedule_rules=clean_rules,
            excluded_dates=template_in.excluded_dates,
            is_active=template_in.is_active,
            created_by=current_user.id
        )
        db.add(template)
        db.commit()
        db.refresh(template)
        
        # Аудит логирование
        log_create(db, "schedule_template", template, user=current_user)
        
        # 🚀 АВТОМАТИЧЕСКАЯ ГЕНЕРАЦИЯ СОБЫТИЙ ЕСЛИ АКТИВЕН
        events_count = 0
        if template.is_active:
            try:
                # Генерируем события (await так как функция async)
                await generate_events_from_template(
                    template_id=template.id,
                    start_date=None,
                    end_date=None,
                    db=db,
                    current_user=current_user
                )
                # Считаем
                events_count = db.query(GeneratedEvent).filter(GeneratedEvent.template_id == template.id).count()
            except Exception as e:
                import traceback
                traceback.print_exc()
                print(f"Error generating events for template {template.id}: {e}")
                # Don't fail the request, just log it
                # User can manually generate later
        
        return ScheduleTemplateResponse(
            id=template.id,
            group_id=template.group_id,
            name=template.name,
            valid_from=template.valid_from,
            valid_until=template.valid_until,
            is_active=template.is_active,
            schedule_rules=template.schedule_rules,
            excluded_dates=template.excluded_dates or [],
            created_at=template.created_at,
            updated_at=template.updated_at,
            group_name=group.name,
            events_generated=events_count
        )
    except Exception as e:
        import traceback
        tb = traceback.format_exc()
        print(tb)
        raise HTTPException(status_code=500, detail=f"Internal Server Error: {str(e)}\n{tb}")


@router.get("/templates", response_model=List[ScheduleTemplateResponse])
async def get_schedule_templates(
    group_id: Optional[int] = Query(None, description="Фильтр по группе"),
    active_only: bool = Query(True, description="Только активные шаблоны"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """📋 Получить список шаблонов расписания"""
    role = current_user.role.lower() if current_user.role else ""
    if role not in ["super_admin", "admin", "owner", "coach"]:
        raise HTTPException(status_code=403, detail="Недостаточно прав")

    query = db.query(ScheduleTemplate)
    
    if group_id:
        query = query.filter(ScheduleTemplate.group_id == group_id)
    
    if active_only:
        query = query.filter(ScheduleTemplate.is_active == True)
    
    # Для тренеров - только их группы (включая группы, где они вторые тренеры)
    if role == "coach":
        from app.models.group import group_coaches
        coach_groups = db.query(Group).filter(
            (Group.coach_id == current_user.id) | 
            (Group.coaches.any(id=current_user.id))
        ).all()
        group_ids = [g.id for g in coach_groups]
        query = query.filter(ScheduleTemplate.group_id.in_(group_ids))
    
    # Filter out deleted templates
    query = query.filter(ScheduleTemplate.deleted_at.is_(None))
    
    templates = query.order_by(ScheduleTemplate.created_at.desc()).all()
    
    result = []
    for t in templates:
        group = db.query(Group).filter(Group.id == t.group_id).first()
        events_count = db.query(GeneratedEvent).filter(GeneratedEvent.template_id == t.id).count()

        raw_rules = t.schedule_rules or []
        if isinstance(raw_rules, str):
            try:
                raw_rules = json.loads(raw_rules)
            except Exception:
                raw_rules = []

        raw_excluded = t.excluded_dates or []
        if isinstance(raw_excluded, str):
            try:
                raw_excluded = json.loads(raw_excluded)
            except Exception:
                raw_excluded = []
        
        result.append(ScheduleTemplateResponse(
            id=t.id,
            group_id=t.group_id,
            name=t.name,
            valid_from=t.valid_from,
            valid_until=t.valid_until,
            is_active=t.is_active,
            schedule_rules=raw_rules,
            excluded_dates=raw_excluded,
            created_at=t.created_at,
            updated_at=t.updated_at,
            group_name=group.name if group else None,
            events_generated=events_count
        ))
    
    return result


@router.get("/templates/{template_id}", response_model=ScheduleTemplateResponse)
async def get_schedule_template(
    template_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """📖 Получить шаблон расписания по ID"""
    template = db.query(ScheduleTemplate).filter(ScheduleTemplate.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Шаблон не найден")
    
    group = db.query(Group).filter(Group.id == template.group_id).first()
    events_count = db.query(GeneratedEvent).filter(GeneratedEvent.template_id == template.id).count()

    raw_rules = template.schedule_rules or []
    if isinstance(raw_rules, str):
        try:
            raw_rules = json.loads(raw_rules)
        except Exception:
            raw_rules = []

    raw_excluded = template.excluded_dates or []
    if isinstance(raw_excluded, str):
        try:
            raw_excluded = json.loads(raw_excluded)
        except Exception:
            raw_excluded = []
    
    return ScheduleTemplateResponse(
        id=template.id,
        group_id=template.group_id,
        name=template.name,
        valid_from=template.valid_from,
        valid_until=template.valid_until,
        is_active=template.is_active,
        schedule_rules=raw_rules,
        excluded_dates=raw_excluded,
        created_at=template.created_at,
        updated_at=template.updated_at,
        group_name=group.name if group else None,
        events_generated=events_count
    )


@router.put("/templates/{template_id}", response_model=ScheduleTemplateResponse)
async def update_schedule_template(
    template_id: int,
    template_in: ScheduleTemplateUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """✏️ Обновить шаблон расписания"""
    template = db.query(ScheduleTemplate).filter(ScheduleTemplate.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Шаблон не найден")
    
    if not check_admin_or_coach(current_user, template.group_id, db):
        raise HTTPException(status_code=403, detail="Нет прав на изменение этого шаблона")
    
    # Сохраняем старые данные для аудита
    old_data = entity_to_dict(template)
    
    update_data = template_in.model_dump(exclude_unset=True)
    
    # Извлекаем флаг регенерации, так как его нет в модели БД
    regenerate_future = update_data.pop('regenerate_future', False)
    
    # Определяем изменение статуса
    is_stopping = template.is_active and update_data.get('is_active') is False
    is_restoring = not template.is_active and update_data.get('is_active') is True

    if 'schedule_rules' in update_data and update_data['schedule_rules']:
        update_data['schedule_rules'] = [rule.model_dump() if hasattr(rule, 'model_dump') else rule for rule in update_data['schedule_rules']]
    
    for field, value in update_data.items():
        setattr(template, field, value)
    
    db.commit()
    db.refresh(template)
    
    # Аудит логирование
    log_update(db, "schedule_template", template, old_data, user=current_user)
    
    # Логика для STOP/RESTORE или регенерации
    
    # 1. Если ОСТАНОВИЛИ шаблон или запросили регенерацию -> Удаляем будущие события
    if is_stopping or regenerate_future:
        now_dt = now_naive()
        # Ensure we use today's date for cleanup if stopping, to catch events later today
        if is_stopping:
            # Use current time, but maybe with a small buffer or just strict >=
            pass
            
        generated_links = db.query(GeneratedEvent).filter(GeneratedEvent.template_id == template_id).all()
        event_ids = [ge.event_id for ge in generated_links]
        
        if event_ids:
            future_events = db.query(Event).filter(
                Event.id.in_(event_ids),
                Event.start_time >= now_dt
            ).all()
            future_event_ids = [e.id for e in future_events]
            
            if future_event_ids:
                # Log deletion for debugging
                print(f"Stopping template {template_id}: Deleting {len(future_event_ids)} future events")
                
                db.query(GeneratedEvent).filter(
                    GeneratedEvent.template_id == template_id,
                    GeneratedEvent.event_id.in_(future_event_ids)
                ).delete(synchronize_session=False)
                
                db.query(Event).filter(Event.id.in_(future_event_ids)).delete(synchronize_session=False)
                db.commit()
    
    # 2. Если ВОЗОБНОВИЛИ шаблон или запросили регенерацию -> Генерируем события
    if is_restoring or regenerate_future:
        await generate_events_from_template(
            template_id=template.id,
            start_date=date.today().strftime("%Y-%m-%d"),
            end_date=None,
            db=db,
            current_user=current_user
        )
    
    group = db.query(Group).filter(Group.id == template.group_id).first()
    events_count = db.query(GeneratedEvent).filter(GeneratedEvent.template_id == template.id).count()
    
    return ScheduleTemplateResponse(
        id=template.id,
        group_id=template.group_id,
        name=template.name,
        valid_from=template.valid_from,
        valid_until=template.valid_until,
        is_active=template.is_active,
        schedule_rules=template.schedule_rules or [],
        excluded_dates=template.excluded_dates or [],
        created_at=template.created_at,
        updated_at=template.updated_at,
        group_name=group.name if group else None,
        events_generated=events_count
    )


@router.delete("/templates/{template_id}")
async def delete_schedule_template(
    template_id: int,
    delete_events: bool = Query(True, description="Удалить также все будущие сгенерированные события"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    🗑️ Удалить шаблон расписания.
    
    По умолчанию (delete_events=True):
    - Удаляет сам шаблон.
    - Удаляет ВСЕ БУДУЩИЕ события (начиная с текущего момента), созданные этим шаблоном.
    - Оставляет ПРОШЛЫЕ события (для истории), но отвязывает их от шаблона.
    """
    template = db.query(ScheduleTemplate).filter(ScheduleTemplate.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Шаблон не найден")
    
    if not check_admin_or_coach(current_user, template.group_id, db):
        raise HTTPException(status_code=403, detail="Нет прав на удаление этого шаблона")
    
    # Логика удаления событий
    if delete_events:
        # 1. Находим все связанные события
        generated_links = db.query(GeneratedEvent).filter(GeneratedEvent.template_id == template_id).all()
        event_ids = [ge.event_id for ge in generated_links]
        
        if event_ids:
            # 2. Разделяем на прошлые и будущие
            # Будущими считаем те, у которых start_time >= сейчас (или сегодня 00:00?)
            # Лучше от сейчас, чтобы не удалить уже прошедшую утреннюю тренировку
            now_dt = now_naive()
            
            # Находим будущие события
            future_events = db.query(Event).filter(
                Event.id.in_(event_ids),
                Event.start_time >= now_dt
            ).all()
            
            future_event_ids = [e.id for e in future_events]
            
            if future_event_ids:
                # 3. Удаляем будущие события
                # Сначала удаляем записи из generated_events для них (хотя cascade должен сработать, но явно безопаснее)
                db.query(GeneratedEvent).filter(
                    GeneratedEvent.template_id == template_id,
                    GeneratedEvent.event_id.in_(future_event_ids)
                ).delete(synchronize_session=False)
                
                # Удаляем сами события
                db.query(Event).filter(Event.id.in_(future_event_ids)).delete(synchronize_session=False)
                
    # Аудит логирование ПЕРЕД удалением
    log_delete(db, "schedule_template", template, user=current_user)
    
    # Soft Delete
    now_dt = now_naive()
    template.deleted_at = now_dt
    template.deleted_by_id = current_user.id
    template.deletion_reason = "Удалено пользователем"
    
    # Log deletion in ScheduleChange for History tab
    change = ScheduleChange(
        group_id=template.group_id,
        change_type='template_deleted',
        reason=f"Удален шаблон расписания: {template.name}",
        changed_by=current_user.id,
        created_at=now_dt
    )
    db.add(change)
    
    # Удаляем сам шаблон (оставшиеся связи generated_events удалятся каскадно)
    # db.delete(template)
    db.add(template)
    db.commit()
    
    return {"success": True, "message": "Шаблон и будущие события удалены (в корзину)"}


@router.post("/templates/{template_id}/cleanup-future")
async def cleanup_future_events(
    template_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    🧹 Принудительно удалить будущие события для шаблона.
    Полезно, если автоматическая очистка не сработала.
    """
    template = db.query(ScheduleTemplate).filter(ScheduleTemplate.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Шаблон не найден")
    
    if not check_admin_or_coach(current_user, template.group_id, db):
        raise HTTPException(status_code=403, detail="Нет прав")
    
    now_dt = now_naive()
    generated_links = db.query(GeneratedEvent).filter(GeneratedEvent.template_id == template_id).all()
    event_ids = [ge.event_id for ge in generated_links]
    
    deleted_count = 0
    if event_ids:
        future_events = db.query(Event).filter(
            Event.id.in_(event_ids),
            Event.start_time >= now_dt
        ).all()
        future_event_ids = [e.id for e in future_events]
        
        if future_event_ids:
            deleted_count = len(future_event_ids)
            db.query(GeneratedEvent).filter(
                GeneratedEvent.template_id == template_id,
                GeneratedEvent.event_id.in_(future_event_ids)
            ).delete(synchronize_session=False)
            
            db.query(Event).filter(Event.id.in_(future_event_ids)).delete(synchronize_session=False)
            db.commit()
    
    return {"success": True, "deleted_count": deleted_count, "message": f"Удалено {deleted_count} будущих событий"}


# ==================== Генерация событий ====================

@router.post("/templates/{template_id}/generate", response_model=GenerateEventsResponse)
async def generate_events_from_template(
    template_id: int,
    start_date: Optional[str] = Query(None, description="С какой даты (YYYY-MM-DD), по умолчанию - сегодня"),
    end_date: Optional[str] = Query(None, description="До какой даты (YYYY-MM-DD), по умолчанию - valid_until"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    🚀 Генерировать события из шаблона расписания.
    
    Создает события в таблице events на основе правил шаблона.
    Пропускает даты из excluded_dates и уже существующие события.
    """
    template = db.query(ScheduleTemplate).filter(ScheduleTemplate.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Шаблон не найден")
    
    if not check_admin_or_coach(current_user, template.group_id, db):
        raise HTTPException(status_code=403, detail="Нет прав на генерацию событий")
    
    # Определяем период генерации
    try:
        gen_start = datetime.strptime(start_date, "%Y-%m-%d").date() if start_date else date.today()
        gen_end = datetime.strptime(end_date, "%Y-%m-%d").date() if end_date else template.valid_until.date()
    except ValueError:
        raise HTTPException(status_code=400, detail="Неверный формат даты")
    
    # Ограничиваем период шаблона
    gen_start = max(gen_start, template.valid_from.date())
    gen_end = min(gen_end, template.valid_until.date())
    
    if gen_start >= gen_end:
        raise HTTPException(status_code=400, detail="Некорректный период генерации")
    
    # Список исключенных дат
    excluded = set(template.excluded_dates or [])
    
    events_created = 0
    events_skipped = 0
    
    # Проходим по каждому дню в периоде
    current_date = gen_start
    while current_date <= gen_end:
        date_str = current_date.strftime("%Y-%m-%d")
        weekday = current_date.weekday()  # 0=Пн, 6=Вс
        
        # Проверяем исключения
        if date_str in excluded:
            current_date += timedelta(days=1)
            continue
        
        # Ищем правила для этого дня недели
        for rule in (template.schedule_rules or []):
            if rule.get('day') != weekday:
                continue
            
            # Пропускаем выходные (type='rest')
            if rule.get('type') == 'rest':
                continue
            
            # Парсим время
            try:
                start_str = rule['start_time']
                if len(start_str) > 5:
                    start_str = start_str[:5]
                end_str = rule['end_time']
                if len(end_str) > 5:
                    end_str = end_str[:5]
                    
                start_time = datetime.strptime(start_str, "%H:%M").time()
                end_time = datetime.strptime(end_str, "%H:%M").time()
            except (ValueError, KeyError) as e:
                print(f"Skipping rule due to time error: {rule} - {e}")
                continue
            
            event_start = datetime.combine(current_date, start_time)
            event_end = datetime.combine(current_date, end_time)
            
            # Проверяем нет ли уже события в это время для этой группы
            existing = db.query(Event).filter(
                Event.group_id == template.group_id,
                Event.start_time == event_start
            ).first()
            
            if existing:
                events_skipped += 1
                continue
            
            # Создаем событие
            event_type = rule.get('type', 'training')
            if event_type:
                event_type = event_type.upper()
                
            event = Event(
                group_id=template.group_id,
                start_time=event_start,
                end_time=event_end,
                type=event_type,
                location=rule.get('location', ''),
                status='scheduled'
            )
            db.add(event)
            db.flush()  # Получаем ID
            
            # Связываем с шаблоном
            generated = GeneratedEvent(
                template_id=template.id,
                event_id=event.id,
                original_date=event_start
            )
            db.add(generated)
            events_created += 1
        
        current_date += timedelta(days=1)
    
    db.commit()
    
    if events_created > 0:
        # Notify about schedule update
        try:
            # Import here to avoid circular imports if any
            from app.core.background_tasks import notify_schedule_change
            from app.models import Message, ChatType
            
            # Send internal message to group chat
            group = db.query(Group).filter(Group.id == template.group_id).first()
            group_name = group.name if group else "Unknown"
            
            start_str = gen_start.strftime("%d.%m.%Y")
            end_str = gen_end.strftime("%d.%m.%Y")
            
            content = (
                f"📅 Расписание обновлено!\n"
                f"Группа: {group_name}\n"
                f"Добавлено {events_created} событий на период {start_str} - {end_str}.\n"
                f"Проверьте календарь."
            )
            
            msg = Message(
                sender_id=current_user.id,
                group_id=template.group_id,
                chat_type=ChatType.schedule_notification,
                content=content,
                is_general=True,
                is_read=False,
                created_at=datetime.utcnow()
            )
            db.add(msg)
            db.commit()
            
            # Optional: Send push via background task if needed
            # background_tasks.add_task(...)
            
        except Exception as e:
            print(f"Failed to send schedule notification: {e}")

    msg = f"Создано {events_created} событий"
    if events_skipped > 0:
        msg += f", пропущено {events_skipped} (дубликаты)"
        
    if events_created == 0 and events_skipped == 0:
        msg = "События не созданы. Проверьте период действия шаблона и дни недели."
    
    return GenerateEventsResponse(
        success=True,
        events_created=events_created,
        events_skipped=events_skipped,
        message=msg
    )


# ==================== Управление событиями ====================

@router.post("/events/cancel-bulk")
async def cancel_events_bulk(
    request: BulkCancelRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """🚫 Массовая отмена событий с уведомлением родителей"""
    role = current_user.role.lower() if current_user.role else ""
    if role not in ["super_admin", "admin", "coach"]:
        raise HTTPException(status_code=403, detail="Недостаточно прав")
    
    if not request.reason:
        raise HTTPException(status_code=400, detail="Необходимо указать причину отмены")
    
    cancelled = 0
    groups_affected = set()
    
    for event_id in request.event_ids:
        event = db.query(Event).filter(Event.id == event_id).first()
        if event:
            # Проверка прав для тренера
            if role == "coach":
                group = db.query(Group).filter(Group.id == event.group_id).first()
                if not group or group.coach_id != current_user.id:
                    continue
            
            # Сохраняем старые данные для аудита
            old_data = entity_to_dict(event)
            
            old_start = event.start_time
            event.status = 'cancelled'
            event.notes = f"Отменено: {request.reason}"
            
            # Отмечаем в generated_events
            ge = db.query(GeneratedEvent).filter(GeneratedEvent.event_id == event_id).first()
            if ge:
                ge.is_cancelled = True
            
            # Логируем в аудит
            log_update(
                db=db, 
                entity_type="event", 
                entity=event, 
                old_data=old_data, 
                user=current_user,
                reason=f"Event cancelled: {request.reason}"
            )
            
            # Логируем изменение (ScheduleChange)
            change = ScheduleChange(
                event_id=event_id,
                group_id=event.group_id,
                change_type='cancelled',
                reason=request.reason,
                old_start_time=old_start,
                changed_by=current_user.id
            )
            db.add(change)
            
            groups_affected.add(event.group_id)
            cancelled += 1
    
    db.commit()
    
    # Отправляем уведомления для каждой затронутой группы
    send_sms = getattr(request, 'send_sms', True)
    for group_id in groups_affected:
        # Находим событие этой группы для даты
        event = db.query(Event).filter(
            Event.group_id == group_id,
            Event.id.in_(request.event_ids)
        ).first()
        if event:
            event_date = event.start_time.strftime("%d.%m.%Y")
            event_time = event.start_time.strftime("%H:%M")
            
            # Создаем уведомление в коммуникациях
            create_schedule_notification(
                db=db,
                group_id=group_id,
                change_type="cancel",
                old_time=f"{event_date} {event_time}",
                new_time="",
                reason=request.reason,
                sender_id=current_user.id
            )
            
            # SMS-уведомление
            background_tasks.add_task(
                notify_schedule_change,
                group_id=group_id,
                change_type='cancelled',
                reason=request.reason,
                event_date=event_date,
                old_time=event_time,
                send_sms=send_sms,
                db=None
            )
    
    return {"success": True, "cancelled": cancelled, "notifications_queued": len(groups_affected)}


@router.post("/events/reschedule")
async def reschedule_event(
    request: RescheduleEventRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """📅 Перенести событие на другое время с уведомлением родителей"""
    role = current_user.role.lower() if current_user.role else ""
    if role not in ["super_admin", "admin", "coach"]:
        raise HTTPException(status_code=403, detail="Недостаточно прав")
    
    if not request.reason:
        raise HTTPException(status_code=400, detail="Необходимо указать причину переноса")
    
    event = db.query(Event).filter(Event.id == request.event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Событие не найдено")
    
    # Проверка прав для тренера
    if role == "coach":
        group = db.query(Group).filter(Group.id == event.group_id).first()
        if not group or group.coach_id != current_user.id:
            raise HTTPException(status_code=403, detail="Нет прав на это событие")
    
    # Сохраняем старые данные для аудита
    old_data = entity_to_dict(event)
    
    # Сохраняем старые значения
    old_start = event.start_time
    old_end = event.end_time
    
    # Обновляем время
    event.start_time = request.new_start_time
    event.end_time = request.new_end_time
    event.notes = f"Перенесено: {request.reason}"
    
    # Отмечаем как измененное
    ge = db.query(GeneratedEvent).filter(GeneratedEvent.event_id == request.event_id).first()
    if ge:
        ge.is_modified = True
    
    # Логируем в аудит
    log_update(
        db=db, 
        entity_type="event", 
        entity=event, 
        old_data=old_data, 
        user=current_user,
        reason=f"Event rescheduled: {request.reason}"
    )
    
    # Логируем изменение (ScheduleChange)
    change = ScheduleChange(
        event_id=request.event_id,
        group_id=event.group_id,
        change_type='rescheduled',
        reason=request.reason,
        old_start_time=old_start,
        new_start_time=request.new_start_time,
        old_end_time=old_end,
        new_end_time=request.new_end_time,
        changed_by=current_user.id
    )
    db.add(change)
    
    db.commit()
    
    # Отправляем уведомления
    send_sms = getattr(request, 'send_sms', True)
    event_date = old_start.strftime("%d.%m.%Y")
    old_time = old_start.strftime("%H:%M")
    new_time = request.new_start_time.strftime("%H:%M")
    new_date = request.new_start_time.strftime("%d.%m.%Y")
    
    # Создаем уведомление в коммуникациях
    create_schedule_notification(
        db=db,
        group_id=event.group_id,
        change_type="reschedule",
        old_time=f"{event_date} {old_time}",
        new_time=f"{new_date} {new_time}",
        reason=request.reason,
        sender_id=current_user.id
    )
    
    # SMS-уведомление
    background_tasks.add_task(
        notify_schedule_change,
        group_id=event.group_id,
        change_type='rescheduled',
        reason=request.reason,
        event_date=event_date,
        old_time=old_time,
        new_time=new_time,
        send_sms=send_sms,
        db=None
    )
    
    return {
        "success": True,
        "message": f"Событие перенесено на {request.new_start_time.strftime('%d.%m.%Y %H:%M')}",
        "notification_queued": True
    }


@router.post("/templates/{template_id}/add-exclusion")
async def add_exclusion_date(
    template_id: int,
    date_str: str = Query(..., description="Дата исключения YYYY-MM-DD"),
    reason: Optional[str] = Query(None, description="Причина (праздник, каникулы)"),
    cancel_existing: bool = Query(True, description="Отменить существующие события на эту дату"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """➕ Добавить дату в исключения (праздники, каникулы)"""
    template = db.query(ScheduleTemplate).filter(ScheduleTemplate.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Шаблон не найден")
    
    if not check_admin_or_coach(current_user, template.group_id, db):
        raise HTTPException(status_code=403, detail="Нет прав")
    
    # Добавляем в исключения
    excluded = list(template.excluded_dates or [])
    if date_str not in excluded:
        excluded.append(date_str)
        template.excluded_dates = excluded
    
    # Отменяем существующие события
    cancelled_events = 0
    if cancel_existing:
        try:
            exc_date = datetime.strptime(date_str, "%Y-%m-%d").date()
            events = db.query(Event).filter(
                Event.group_id == template.group_id,
                Event.start_time >= datetime.combine(exc_date, time.min),
                Event.start_time <= datetime.combine(exc_date, time.max)
            ).all()
            
            for event in events:
                event.status = 'cancelled'
                event.notes = f"Отменено: {reason or 'Исключение'}"
                ge = db.query(GeneratedEvent).filter(GeneratedEvent.event_id == event.id).first()
                if ge:
                    ge.is_cancelled = True
                cancelled_events += 1
        except ValueError:
            pass
    
    db.commit()
    
    return {
        "success": True,
        "message": f"Дата {date_str} добавлена в исключения. Отменено событий: {cancelled_events}"
    }


@router.delete("/templates/{template_id}/remove-exclusion")
async def remove_exclusion_date(
    template_id: int,
    date_str: str = Query(..., description="Дата для удаления из исключений"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """➖ Удалить дату из исключений"""
    template = db.query(ScheduleTemplate).filter(ScheduleTemplate.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Шаблон не найден")
    
    if not check_admin_or_coach(current_user, template.group_id, db):
        raise HTTPException(status_code=403, detail="Нет прав")
    
    excluded = list(template.excluded_dates or [])
    if date_str in excluded:
        excluded.remove(date_str)
        template.excluded_dates = excluded
        db.commit()
    
    return {"success": True, "message": f"Дата {date_str} удалена из исключений"}


# ==================== Просмотр расписания ====================

@router.get("/calendar/month")
async def get_month_calendar(
    year: int = Query(..., description="Год"),
    month: int = Query(..., ge=1, le=12, description="Месяц"),
    group_id: Optional[int] = Query(None, description="Фильтр по группе"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    📆 Получить календарь на месяц с событиями.
    Удобно для отображения в UI.
    """
    from calendar import monthrange
    
    # Определяем границы месяца
    first_day = date(year, month, 1)
    last_day = date(year, month, monthrange(year, month)[1])
    
    query = db.query(Event).filter(
        Event.start_time >= datetime.combine(first_day, time.min),
        Event.start_time <= datetime.combine(last_day, time.max)
    )
    
    if group_id:
        query = query.filter(Event.group_id == group_id)
    
    # Ограничения по ролям
    role = current_user.role.lower() if current_user.role else ""
    if role not in ["super_admin", "admin", "owner", "coach", "parent"]:
        raise HTTPException(status_code=403, detail="Недостаточно прав")

    if role == "coach":
        from app.models.group import group_coaches
        coach_groups = db.query(Group).filter(
            (Group.coach_id == current_user.id) |
            (Group.coaches.any(id=current_user.id))
        ).all()
        group_ids = [g.id for g in coach_groups]
        if group_id and group_id not in group_ids:
            query = query.filter(False)
        else:
            query = query.filter(Event.group_id.in_(group_ids))

    if role == "parent":
        children_groups = db.query(Student.group_id).join(StudentGuardian).filter(
            StudentGuardian.user_id == current_user.id,
            Student.deleted_at.is_(None)
        ).all()
        parent_group_ids = [g[0] for g in children_groups if g[0]]
        if not parent_group_ids:
            query = query.filter(False)
        elif group_id and group_id not in parent_group_ids:
            query = query.filter(False)
        else:
            query = query.filter(Event.group_id.in_(parent_group_ids))
    
    events = query.order_by(Event.start_time).all()
    
    # Группируем по дням
    calendar_data = {}
    for day in range(1, last_day.day + 1):
        day_date = date(year, month, day)
        calendar_data[day] = {
            "date": day_date.isoformat(),
            "day_of_week": day_date.weekday(),
            "day_name": DAY_NAMES_SHORT[day_date.weekday()],
            "events": []
        }
    
    for event in events:
        day = event.start_time.day
        if day in calendar_data:
            group = db.query(Group).filter(Group.id == event.group_id).first()
            ge = db.query(GeneratedEvent).filter(GeneratedEvent.event_id == event.id).first()
            
            calendar_data[day]["events"].append({
                "id": event.id,
                "type": event.type,
                "start_time": event.start_time.strftime("%H:%M"),
                "end_time": event.end_time.strftime("%H:%M"),
                "location": event.location,
                "status": event.status,
                "group_id": event.group_id,
                "group_name": group.name if group else None,
                "is_modified": ge.is_modified if ge else False,
                "is_from_template": ge is not None
            })
    
    return {
        "year": year,
        "month": month,
        "month_name": ['', 'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
                       'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'][month],
        "days": list(calendar_data.values())
    }


@router.get("/groups/{group_id}/schedule-preview")
async def get_group_schedule_preview(
    group_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    👁️ Предпросмотр недельного расписания группы из активного шаблона.
    Показывает расписание на типичную неделю.
    """
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Группа не найдена")
    
    # Находим активный шаблон
    template = db.query(ScheduleTemplate).filter(
        ScheduleTemplate.group_id == group_id,
        ScheduleTemplate.is_active == True
    ).first()
    
    if not template:
        return {
            "group_id": group_id,
            "group_name": group.name,
            "has_schedule": False,
            "weekly_schedule": []
        }
    
    # Формируем недельное расписание
    weekly = []
    for day in range(7):
        day_schedule = {
            "day": day,
            "day_name": DAY_NAMES[day],
            "day_name_short": DAY_NAMES_SHORT[day],
            "events": []
        }
        
        for rule in (template.schedule_rules or []):
            if rule.get('day') == day:
                day_schedule["events"].append({
                    "start_time": rule.get('start_time'),
                    "end_time": rule.get('end_time'),
                    "type": rule.get('type', 'training'),
                    "location": rule.get('location')
                })
        
        weekly.append(day_schedule)
    
    return {
        "group_id": group_id,
        "group_name": group.name,
        "has_schedule": True,
        "template_id": template.id,
        "template_name": template.name,
        "valid_from": template.valid_from.isoformat(),
        "valid_until": template.valid_until.isoformat(),
        "weekly_schedule": weekly,
        "excluded_dates_count": len(template.excluded_dates or [])
    }


# ==================== Точечное редактирование событий ====================

from pydantic import BaseModel, Field

class EventUpdateRequest(BaseModel):
    """Запрос на точечное редактирование события"""
    action: str = Field(..., description="Действие: cancel, reschedule, change_location")
    reason: str = Field(..., min_length=3, description="Причина изменения (обязательна)")
    new_start_time: Optional[datetime] = Field(None, description="Новое время начала")
    new_end_time: Optional[datetime] = Field(None, description="Новое время окончания")
    new_location: Optional[str] = Field(None, description="Новое место")
    training_plan: Optional[str] = Field(None, description="План тренировки")
    send_sms: bool = Field(True, description="Отправить SMS родителям")
    notify_coach: bool = Field(True, description="Уведомить тренера")
    update_future: bool = Field(False, description="Применить ко всем будущим событиям серии")


@router.post("/events/{event_id}/update")
async def update_event_with_notification(
    event_id: int,
    request: EventUpdateRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    ✏️ Точечное редактирование события с уведомлением.
    
    Действия:
    - cancel: Отменить событие
    - reschedule: Перенести на другое время
    - change_location: Изменить место проведения
    - update_details: Обновить детали (план тренировки)
    """
    role = current_user.role.lower() if current_user.role else ""
    if role not in ["super_admin", "admin", "coach"]:
        raise HTTPException(status_code=403, detail="Недостаточно прав")
    
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Событие не найдено")
    
    # Проверка прав для тренера
    if role == "coach":
        group = db.query(Group).filter(Group.id == event.group_id).first()
        if not group or group.coach_id != current_user.id:
            raise HTTPException(status_code=403, detail="Нет прав на это событие")
    
    # Сохраняем старые данные для аудита
    old_data = entity_to_dict(event)
    
    # Сохраняем старые значения
    old_start = event.start_time
    old_end = event.end_time
    old_location = event.location
    event_date = old_start.strftime("%d.%m.%Y")
    
    change_type = request.action
    notification_params = {
        "group_id": event.group_id,
        "reason": request.reason,
        "event_date": event_date,
        "send_sms": request.send_sms,
        "db": None
    }
    
    events_to_update = [event]
    
    if request.update_future:
        ge = db.query(GeneratedEvent).filter(GeneratedEvent.event_id == event_id).first()
        if ge:
            future_events = db.query(Event).join(GeneratedEvent).filter(
                GeneratedEvent.template_id == ge.template_id,
                Event.start_time > event.start_time,
                Event.status != 'cancelled'
            ).all()
            events_to_update.extend(future_events)
            
    for evt in events_to_update:
        is_main = (evt.id == event_id)
        
        if request.action == "cancel":
            evt.status = 'cancelled'
            evt.notes = f"Отменено: {request.reason}"
            
            ge_link = db.query(GeneratedEvent).filter(GeneratedEvent.event_id == evt.id).first()
            if ge_link:
                ge_link.is_cancelled = True
                ge_link.is_modified = True
            
            if is_main:
                change_type = 'cancelled'
                notification_params["change_type"] = 'cancelled'
                notification_params["old_time"] = old_start.strftime("%H:%M")
            
        elif request.action == "reschedule":
            if not request.new_start_time or not request.new_end_time:
                raise HTTPException(status_code=400, detail="Укажите новое время начала и окончания")
            
            if is_main:
                evt.start_time = request.new_start_time
                evt.end_time = request.new_end_time
                change_type = 'rescheduled'
                notification_params["change_type"] = 'rescheduled'
                notification_params["old_time"] = old_start.strftime("%H:%M")
                notification_params["new_time"] = request.new_start_time.strftime("%H:%M")
            else:
                # Apply time of day shift
                target_date = evt.start_time.date()
                duration = request.new_end_time - request.new_start_time
                evt.start_time = datetime.combine(target_date, request.new_start_time.time())
                evt.end_time = evt.start_time + duration
            
            evt.notes = f"Перенесено: {request.reason}"
            
            ge_link = db.query(GeneratedEvent).filter(GeneratedEvent.event_id == evt.id).first()
            if ge_link:
                ge_link.is_modified = True
            
        elif request.action == "change_location":
            if not request.new_location:
                raise HTTPException(status_code=400, detail="Укажите новое место")
            evt.location = request.new_location
            evt.notes = f"Место изменено: {request.reason}"
            
            ge_link = db.query(GeneratedEvent).filter(GeneratedEvent.event_id == evt.id).first()
            if ge_link:
                ge_link.is_modified = True
            
            if is_main:
                change_type = 'location_changed'
                notification_params["change_type"] = 'location_changed'
                notification_params["old_location"] = old_location
                notification_params["new_location"] = request.new_location

        elif request.action == "update_details":
            if request.training_plan is not None:
                evt.training_plan = request.training_plan
            
            evt.notes = f"Обновлено: {request.reason}"
            
            if is_main:
                change_type = 'details_updated'
                notification_params["change_type"] = 'details_updated'

        else:
            raise HTTPException(status_code=400, detail="Неизвестное действие")
    
    # Логируем в аудит (только главное событие)
    log_update(
        db=db, 
        entity_type="event", 
        entity=event, 
        old_data=old_data, 
        user=current_user,
        reason=f"Event updated: {request.action} - {request.reason}"
    )
    
    # Логируем изменение (ScheduleChange)
    change = ScheduleChange(
        event_id=event_id,
        group_id=event.group_id,
        change_type=change_type,
        reason=request.reason,
        old_start_time=old_start,
        new_start_time=request.new_start_time,
        old_end_time=old_end,
        new_end_time=request.new_end_time,
        old_location=old_location,
        new_location=request.new_location,
        changed_by=current_user.id
    )
    db.add(change)
    
    db.commit()
    
    # Отправляем уведомления
    background_tasks.add_task(notify_schedule_change, **notification_params)
    
    return {
        "success": True,
        "change_type": change_type,
        "message": f"Событие изменено: {change_type}" + (" (и будущие)" if request.update_future else ""),
        "notification_queued": True
    }


# ==================== Удаление событий ====================

@router.delete("/events/{event_id}")
async def delete_event(
    event_id: int,
    delete_future: bool = Query(False, description="Удалить это и все будущие события серии"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    🗑️ Удалить событие из расписания (Soft Delete).
    Доступно для админов и тренеров (только своих групп).
    """
    role = current_user.role.lower() if current_user.role else ""
    if role not in ["super_admin", "admin", "coach"]:
        raise HTTPException(status_code=403, detail="Недостаточно прав")
    
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Событие не найдено")
    
    # Проверка прав для тренера
    if role == "coach":
        group = db.query(Group).filter(Group.id == event.group_id).first()
        if not group or group.coach_id != current_user.id:
            raise HTTPException(status_code=403, detail="Нет прав на удаление этого события")
    
    events_to_delete = [event]
    
    # Если нужно удалить будущие и это часть серии
    if delete_future:
        # Проверяем связь с шаблоном
        ge = db.query(GeneratedEvent).filter(GeneratedEvent.event_id == event_id).first()
        if ge:
            # Находим все будущие события этого шаблона
            future_links = db.query(GeneratedEvent).join(Event).filter(
                GeneratedEvent.template_id == ge.template_id,
                Event.start_time > event.start_time,
                Event.deleted_at.is_(None)
            ).all()
            
            for link in future_links:
                if link.event:
                    events_to_delete.append(link.event)
    
    count = 0
    for e in events_to_delete:
        if e.deleted_at:
            continue
            
        # Логируем изменение (ScheduleChange)
        change = ScheduleChange(
            event_id=e.id,
            group_id=e.group_id,
            change_type='cancelled', # Используем cancelled, чтобы отображалось как отмена
            reason='Событие удалено из расписания',
            old_start_time=e.start_time,
            old_location=e.location,
            changed_by=current_user.id
        )
        db.add(change)
        
        # Soft delete
        e.deleted_at = now_naive()
        e.deleted_by_id = current_user.id
        e.status = 'cancelled'
        
        # Mark GeneratedEvent as cancelled if exists
        ge = db.query(GeneratedEvent).filter(GeneratedEvent.event_id == e.id).first()
        if ge:
            ge.is_cancelled = True
        
        db.add(e)
        count += 1
    
    db.commit()
    
    return {"success": True, "message": f"Удалено событий: {count}"}


# ==================== История изменений ====================

@router.get("/changes")
async def get_schedule_changes(
    group_id: Optional[int] = Query(None, description="Фильтр по группе"),
    limit: int = Query(50, le=100),
    skip: int = Query(0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    📜 История изменений расписания.
    Доступ для админов и тренеров.
    """
    role = current_user.role.lower() if current_user.role else ""
    if role not in ["super_admin", "admin", "coach"]:
        raise HTTPException(status_code=403, detail="Недостаточно прав")
    
    query = db.query(ScheduleChange)
    
    if group_id:
        query = query.filter(ScheduleChange.group_id == group_id)
    
    # Для тренера - только его группы
    if role == "coach":
        coach_groups = db.query(Group).filter(Group.coach_id == current_user.id).all()
        group_ids = [g.id for g in coach_groups]
        query = query.filter(ScheduleChange.group_id.in_(group_ids))
    
    total = query.count()
    changes = query.order_by(ScheduleChange.created_at.desc()).offset(skip).limit(limit).all()
    
    result = []
    for c in changes:
        group = db.query(Group).filter(Group.id == c.group_id).first()
        changed_by_user = db.query(User).filter(User.id == c.changed_by).first() if c.changed_by else None
        
        result.append({
            "id": c.id,
            "event_id": c.event_id,
            "group_id": c.group_id,
            "group_name": group.name if group else None,
            "change_type": c.change_type,
            "reason": c.reason,
            "old_start_time": c.old_start_time.isoformat() if c.old_start_time else None,
            "new_start_time": c.new_start_time.isoformat() if c.new_start_time else None,
            "old_location": c.old_location,
            "new_location": c.new_location,
            "changed_by": c.changed_by,
            "changed_by_name": changed_by_user.full_name if changed_by_user else None,
            "notification_sent": c.notification_sent,
            "parents_notified": c.parents_notified,
            "coach_notified": c.coach_notified,
            "created_at": c.created_at.isoformat() if c.created_at else None
        })
    
    return {
        "data": result,
        "total": total,
        "skip": skip,
        "limit": limit
    }


@router.get("/changes/my")
async def get_my_schedule_changes(
    limit: int = Query(20, le=50),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    📱 История изменений для текущего пользователя.
    Для родителя - изменения в группах его детей.
    """
    from app.models.student_guardian import StudentGuardian
    from app.models.student import Student
    
    role = current_user.role.lower() if current_user.role else ""
    
    # Собираем группы пользователя
    group_ids = set()
    
    if role == "parent":
        # Группы детей
        guardian_links = db.query(StudentGuardian).filter(
            StudentGuardian.user_id == current_user.id
        ).all()
        for gl in guardian_links:
            student = db.query(Student).filter(Student.id == gl.student_id).first()
            if student and student.group_id:
                group_ids.add(student.group_id)
    elif role == "coach":
        # Группы тренера
        coach_groups = db.query(Group).filter(Group.coach_id == current_user.id).all()
        for g in coach_groups:
            group_ids.add(g.id)
    else:
        # Админы видят всё
        pass
    
    query = db.query(ScheduleChange)
    if group_ids:
        query = query.filter(ScheduleChange.group_id.in_(group_ids))
    
    changes = query.order_by(ScheduleChange.created_at.desc()).limit(limit).all()
    
    result = []
    for c in changes:
        group = db.query(Group).filter(Group.id == c.group_id).first()
        
        result.append({
            "id": c.id,
            "group_name": group.name if group else None,
            "change_type": c.change_type,
            "reason": c.reason,
            "old_time": c.old_start_time.strftime("%H:%M") if c.old_start_time else None,
            "new_time": c.new_start_time.strftime("%H:%M") if c.new_start_time else None,
            "event_date": c.old_start_time.strftime("%d.%m.%Y") if c.old_start_time else None,
            "old_location": c.old_location,
            "new_location": c.new_location,
            "created_at": c.created_at.isoformat() if c.created_at else None
        })
    
    return {"changes": result}
