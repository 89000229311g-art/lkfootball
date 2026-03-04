"""
API роутер для Ленты новостей (Posts) и Опросов (Polls)
"""
from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status, Query, UploadFile, File, Form
from sqlalchemy.orm import Session
from sqlalchemy import or_, desc
from pydantic import BaseModel, Field

from app.core.deps import get_db, get_current_user
from app.core.timezone import now_naive  # Moldova timezone
from app.models.user import User
from app.models.group import Group
from app.models.message import Post, PostType, PostReaction, Poll, PollVote, Message, ChatType
from app.models.improvements import AnnouncementRead
from app.models.student import Student
from app.models.student_guardian import StudentGuardian

router = APIRouter()


# ==================== SCHEMAS ====================

class PostCreate(BaseModel):
    title: Optional[str] = None
    content: str = Field(..., min_length=1, max_length=5000)
    post_type: str = "news"
    group_id: Optional[int] = None  # null = для всех
    is_pinned: bool = False
    media_urls: List[str] = []
    attachments: List[dict] = []
    requires_confirmation: bool = False  # NEW: Requires read confirmation
    confirmation_deadline: Optional[datetime] = None  # NEW: Deadline for confirmation


class PostResponse(BaseModel):
    id: int
    author_id: int
    author_name: str
    author_role: str
    group_id: Optional[int]
    group_name: Optional[str]
    post_type: str
    title: Optional[str]
    content: str
    media_urls: List[str]
    attachments: List[dict]
    views_count: int
    likes_count: int
    is_pinned: bool
    created_at: datetime
    user_liked: bool = False
    requires_confirmation: bool = False  # NEW
    confirmation_deadline: Optional[datetime] = None  # NEW
    user_confirmed: bool = False  # NEW: Has current user confirmed
    confirmations_count: int = 0  # NEW: Total confirmations

    model_config = {"from_attributes": True}


class PollCreate(BaseModel):
    question: str = Field(..., min_length=1, max_length=500)
    options: List[str] = Field(..., min_items=2, max_items=10)
    group_id: Optional[int] = None
    is_anonymous: bool = False
    is_multiple_choice: bool = False
    ends_at: Optional[datetime] = None


class PollResponse(BaseModel):
    id: int
    creator_id: int
    creator_name: str
    group_id: Optional[int]
    group_name: Optional[str]
    question: str
    options: List[str]
    votes: List[dict]  # [{"option_index": 0, "count": 5, "users": [...]}]
    total_votes: int
    is_anonymous: bool
    is_multiple_choice: bool
    ends_at: Optional[datetime]
    is_closed: bool
    created_at: datetime
    user_voted: Optional[int] = None  # index пользователя если голосовал

    model_config = {"from_attributes": True}


# ==================== POSTS (ЛЕНТА НОВОСТЕЙ) ====================

@router.post("/posts", response_model=PostResponse)
async def create_post(
    post_in: PostCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Создать публикацию (только админ/руководитель)"""
    user_role = current_user.role.lower() if current_user.role else ""
    if user_role not in ["super_admin", "admin", "owner"]:
        raise HTTPException(status_code=403, detail="Только администраторы могут публиковать")
    
    post = Post(
        author_id=current_user.id,
        group_id=post_in.group_id,
        post_type=PostType(post_in.post_type) if post_in.post_type else PostType.news,
        title=post_in.title,
        content=post_in.content,
        media_urls=post_in.media_urls or [],
        attachments=post_in.attachments or [],
        is_pinned=post_in.is_pinned,
        requires_confirmation=post_in.requires_confirmation,
        confirmation_deadline=post_in.confirmation_deadline
    )
    db.add(post)
    db.commit()
    db.refresh(post)
    
    return _post_to_response(post, db, current_user.id)


@router.get("/posts", response_model=List[PostResponse])
async def get_posts(
    group_id: Optional[int] = Query(None, description="Фильтр по группе"),
    post_type: Optional[str] = Query(None, description="Фильтр по типу"),
    skip: int = 0,
    limit: int = 10000,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Получить ленту новостей"""
    user_role = current_user.role.lower() if current_user.role else ""
    user_group_ids = _get_user_group_ids(db, current_user)
    
    query = db.query(Post).filter(Post.is_published == True)
    
    # Фильтрация по доступным группам
    if user_role not in ["super_admin", "admin", "owner"]:
        if user_group_ids:
            query = query.filter(
                or_(
                    Post.group_id.is_(None),  # Общие посты
                    Post.group_id.in_(user_group_ids)
                )
            )
        else:
            # User has no groups - show only general posts
            query = query.filter(Post.group_id.is_(None))
    
    if group_id:
        # Show posts for specific group AND general posts
        query = query.filter(or_(Post.group_id == group_id, Post.group_id.is_(None)))
    
    if post_type:
        query = query.filter(Post.post_type == post_type)
    
    # Закрепленные сверху, потом по дате
    posts = query.order_by(
        desc(Post.is_pinned),
        desc(Post.created_at)
    ).offset(skip).limit(limit).all()
    
    return [_post_to_response(p, db, current_user.id) for p in posts]


@router.get("/posts/{post_id}", response_model=PostResponse)
async def get_post(
    post_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Получить пост и увеличить счетчик просмотров"""
    post = db.query(Post).filter(Post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Пост не найден")
    
    # Увеличить просмотры
    post.views_count += 1
    db.commit()
    
    return _post_to_response(post, db, current_user.id)


@router.post("/posts/{post_id}/like")
async def like_post(
    post_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Поставить/убрать лайк"""
    post = db.query(Post).filter(Post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Пост не найден")
    
    existing = db.query(PostReaction).filter(
        PostReaction.post_id == post_id,
        PostReaction.user_id == current_user.id
    ).first()
    
    if existing:
        db.delete(existing)
        post.likes_count = max(0, post.likes_count - 1)
        db.commit()
        return {"liked": False, "likes_count": post.likes_count}
    else:
        reaction = PostReaction(
            post_id=post_id,
            user_id=current_user.id,
            reaction_type="like"
        )
        db.add(reaction)
        post.likes_count += 1
        db.commit()
        return {"liked": True, "likes_count": post.likes_count}


@router.put("/posts/{post_id}/pin")
async def pin_post(
    post_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Закрепить/открепить пост (админ)"""
    user_role = current_user.role.lower() if current_user.role else ""
    if user_role not in ["super_admin", "admin", "owner"]:
        raise HTTPException(status_code=403, detail="Недостаточно прав")
    
    post = db.query(Post).filter(Post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Пост не найден")
    
    post.is_pinned = not post.is_pinned
    db.commit()
    
    return {"is_pinned": post.is_pinned}


@router.delete("/posts/{post_id}")
async def delete_post(
    post_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Удалить пост (админ или автор)"""
    post = db.query(Post).filter(Post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Пост не найден")
    
    user_role = current_user.role.lower() if current_user.role else ""
    if post.author_id != current_user.id and user_role not in ["super_admin", "admin", "owner"]:
        raise HTTPException(status_code=403, detail="Недостаточно прав")
    
    db.delete(post)
    db.commit()
    return {"status": "deleted"}


# ==================== ANNOUNCEMENT CONFIRMATIONS ====================

@router.post("/posts/{post_id}/confirm")
async def confirm_announcement(
    post_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Подтвердить прочтение важного объявления"""
    post = db.query(Post).filter(Post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Пост не найден")
    
    if not post.requires_confirmation:
        raise HTTPException(status_code=400, detail="Этот пост не требует подтверждения")
    
    # Check if already confirmed
    existing = db.query(AnnouncementRead).filter(
        AnnouncementRead.post_id == post_id,
        AnnouncementRead.user_id == current_user.id
    ).first()
    
    if existing:
        return {"confirmed": True, "confirmed_at": existing.read_at.isoformat()}
    
    # Create confirmation
    confirmation = AnnouncementRead(
        post_id=post_id,
        user_id=current_user.id
    )
    db.add(confirmation)
    db.commit()
    
    return {"confirmed": True, "message": "Объявление подтверждено"}


@router.get("/posts/{post_id}/confirmations")
async def get_announcement_confirmations(
    post_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Получить список подтверждений (для админа)"""
    user_role = current_user.role.lower() if current_user.role else ""
    if user_role not in ["super_admin", "admin", "owner", "coach"]:
        raise HTTPException(status_code=403, detail="Недостаточно прав")
    
    post = db.query(Post).filter(Post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Пост не найден")
    
    confirmations = db.query(AnnouncementRead).filter(
        AnnouncementRead.post_id == post_id
    ).all()
    
    confirmed_users = []
    for c in confirmations:
        user = db.query(User).filter(User.id == c.user_id).first()
        if user:
            confirmed_users.append({
                "user_id": user.id,
                "user_name": user.full_name,
                "confirmed_at": c.read_at.isoformat()
            })
    
    # If post is for a specific group, get expected users
    expected_count = 0
    not_confirmed = []
    
    if post.group_id:
        # Get all parents of students in the group
        students = db.query(Student).filter(
            Student.group_id == post.group_id,
            Student.status == "active"
        ).all()
        
        for student in students:
            guardians = db.query(StudentGuardian).filter(
                StudentGuardian.student_id == student.id
            ).all()
            for g in guardians:
                parent = db.query(User).filter(User.id == g.user_id).first()
                if parent:
                    expected_count += 1
                    # Check if confirmed
                    is_confirmed = any(c.user_id == parent.id for c in confirmations)
                    if not is_confirmed:
                        not_confirmed.append({
                            "user_id": parent.id,
                            "user_name": parent.full_name,
                            "student_name": f"{student.first_name} {student.last_name}"
                        })
    
    return {
        "post_id": post_id,
        "requires_confirmation": post.requires_confirmation,
        "confirmation_deadline": post.confirmation_deadline.isoformat() if post.confirmation_deadline else None,
        "confirmed_count": len(confirmations),
        "expected_count": expected_count,
        "confirmed_users": confirmed_users,
        "not_confirmed_users": not_confirmed
    }


@router.get("/posts/my-children")
async def get_posts_for_my_children(
    skip: int = 0,
    limit: int = 10000,
    unconfirmed_only: bool = Query(False, description="Show only unconfirmed announcements"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Получить новости только для групп своих детей.
    Для родителей - удобный эндпоинт для фильтрации новостей.
    """
    user_group_ids = _get_user_group_ids(db, current_user)
    
    query = db.query(Post).filter(Post.is_published == True)
    
    if user_group_ids:
        query = query.filter(
            or_(
                Post.group_id.is_(None),  # General posts
                Post.group_id.in_(user_group_ids)  # Posts for my children's groups
            )
        )
    else:
        query = query.filter(Post.group_id.is_(None))
    
    # Filter unconfirmed only
    if unconfirmed_only:
        query = query.filter(Post.requires_confirmation == True)
        # Exclude already confirmed
        confirmed_post_ids = db.query(AnnouncementRead.post_id).filter(
            AnnouncementRead.user_id == current_user.id
        ).subquery()
        query = query.filter(~Post.id.in_(confirmed_post_ids))
    
    posts = query.order_by(
        desc(Post.is_pinned),
        desc(Post.requires_confirmation),  # Announcements requiring confirmation first
        desc(Post.created_at)
    ).offset(skip).limit(limit).all()
    
    result = []
    for p in posts:
        response = _post_to_response(p, db, current_user.id)
        # Add children names for context
        if p.group_id and p.group_id in user_group_ids:
            group = db.query(Group).filter(Group.id == p.group_id).first()
            if group:
                # Get this user's children in this group
                guardian_links = db.query(StudentGuardian).filter(StudentGuardian.user_id == current_user.id).all()
                student_ids = [link.student_id for link in guardian_links]
                children_in_group = db.query(Student).filter(
                    Student.id.in_(student_ids),
                    Student.group_id == p.group_id
                ).all()
                response_dict = response.model_dump()
                response_dict["children_in_group"] = [
                    {"id": c.id, "name": f"{c.first_name} {c.last_name}"}
                    for c in children_in_group
                ]
                result.append(response_dict)
            else:
                result.append(response.model_dump())
        else:
            result.append(response.model_dump())
    
    return result


# ==================== POLLS (ОПРОСЫ) ====================

@router.post("/polls", response_model=PollResponse)
async def create_poll(
    poll_in: PollCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Создать опрос (админ/тренер)"""
    user_role = current_user.role.lower() if current_user.role else ""
    if user_role not in ["super_admin", "admin", "owner", "coach"]:
        raise HTTPException(status_code=403, detail="Недостаточно прав для создания опроса")
    
    poll = Poll(
        creator_id=current_user.id,
        group_id=poll_in.group_id,
        question=poll_in.question,
        options=poll_in.options,
        is_anonymous=poll_in.is_anonymous,
        is_multiple_choice=poll_in.is_multiple_choice,
        ends_at=poll_in.ends_at
    )
    db.add(poll)
    db.commit()
    db.refresh(poll)
    
    # Создаем сообщение с опросом в групповой чат
    if poll_in.group_id:
        message = Message(
            sender_id=current_user.id,
            group_id=poll_in.group_id,
            chat_type=ChatType.group_chat,
            content=f"📊 Опрос: {poll_in.question}",
            poll_id=poll.id
        )
        db.add(message)
        db.commit()
    
    return _poll_to_response(poll, db, current_user.id)


@router.get("/polls", response_model=List[PollResponse])
async def get_polls(
    group_id: Optional[int] = Query(None),
    skip: int = 0,
    limit: int = 10000,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Получить опросы"""
    user_group_ids = _get_user_group_ids(db, current_user)
    
    query = db.query(Poll)
    
    if group_id:
        if user_group_ids:
            query = query.filter(
                or_(
                    Poll.group_id.is_(None),
                    Poll.group_id.in_(user_group_ids)
                )
            )
        else:
            query = query.filter(Poll.group_id.is_(None))
    
    polls = query.order_by(desc(Poll.created_at)).offset(skip).limit(limit).all()
    return [_poll_to_response(p, db, current_user.id) for p in polls]


@router.post("/polls/{poll_id}/vote")
async def vote_poll(
    poll_id: int,
    option_index: int = Query(..., ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Проголосовать в опросе"""
    poll = db.query(Poll).filter(Poll.id == poll_id).first()
    if not poll:
        raise HTTPException(status_code=404, detail="Опрос не найден")
    
    if poll.is_closed:
        raise HTTPException(status_code=400, detail="Опрос закрыт")
    
    if poll.ends_at and now_naive() > poll.ends_at:  # Moldova timezone
        poll.is_closed = True
        db.commit()
        raise HTTPException(status_code=400, detail="Время опроса истекло")
    
    if option_index >= len(poll.options):
        raise HTTPException(status_code=400, detail="Неверный вариант ответа")
    
    # Проверяем существующий голос
    existing = db.query(PollVote).filter(
        PollVote.poll_id == poll_id,
        PollVote.user_id == current_user.id
    ).first()
    
    if existing and not poll.is_multiple_choice:
        # Обновляем голос
        existing.option_index = option_index
    else:
        vote = PollVote(
            poll_id=poll_id,
            user_id=current_user.id,
            option_index=option_index
        )
        db.add(vote)
    
    db.commit()
    return _poll_to_response(poll, db, current_user.id)


@router.put("/polls/{poll_id}/close")
async def close_poll(
    poll_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Закрыть опрос (создатель или админ)"""
    poll = db.query(Poll).filter(Poll.id == poll_id).first()
    if not poll:
        raise HTTPException(status_code=404, detail="Опрос не найден")
    
    user_role = current_user.role.lower() if current_user.role else ""
    if poll.creator_id != current_user.id and user_role not in ["super_admin", "admin", "owner"]:
        raise HTTPException(status_code=403, detail="Недостаточно прав")
    
    poll.is_closed = True
    db.commit()
    return {"status": "closed"}


# ==================== HELPER FUNCTIONS ====================

def _get_user_group_ids(db: Session, user: User) -> List[int]:
    """Получить ID групп пользователя"""
    user_role = user.role.lower() if user.role else ""
    
    if user_role in ["super_admin", "admin", "owner"]:
        return [g.id for g in db.query(Group).all()]
    elif user_role == "coach":
        return [g.id for g in db.query(Group).filter(Group.coach_id == user.id).all()]
    else:
        # Родитель - группы через детей
        guardian_links = db.query(StudentGuardian).filter(StudentGuardian.user_id == user.id).all()
        student_ids = [link.student_id for link in guardian_links]
        
        students = db.query(Student).filter(Student.id.in_(student_ids)).all() if student_ids else []
        return list(set(s.group_id for s in students if s.group_id))


def _post_to_response(post: Post, db: Session, current_user_id: int) -> PostResponse:
    """Конвертировать Post в ответ API"""
    author = db.query(User).filter(User.id == post.author_id).first()
    group = db.query(Group).filter(Group.id == post.group_id).first() if post.group_id else None
    
    user_liked = db.query(PostReaction).filter(
        PostReaction.post_id == post.id,
        PostReaction.user_id == current_user_id
    ).first() is not None
    
    # Check confirmation status
    user_confirmed = False
    confirmations_count = 0
    if post.requires_confirmation:
        user_confirmed = db.query(AnnouncementRead).filter(
            AnnouncementRead.post_id == post.id,
            AnnouncementRead.user_id == current_user_id
        ).first() is not None
        confirmations_count = db.query(AnnouncementRead).filter(
            AnnouncementRead.post_id == post.id
        ).count()
    
    media_urls = post.media_urls or []
    if isinstance(media_urls, str):
        if media_urls.strip().startswith("["):
            import json
            try:
                media_urls = json.loads(media_urls)
            except Exception:
                media_urls = []
        else:
            media_urls = []
    attachments = post.attachments or []
    if isinstance(attachments, str):
        if attachments.strip().startswith("["):
            import json
            try:
                attachments = json.loads(attachments)
            except Exception:
                attachments = []
        else:
            attachments = []

    return PostResponse(
        id=post.id,
        author_id=post.author_id,
        author_name=author.full_name if author else "Unknown",
        author_role=author.role if author else "",
        group_id=post.group_id,
        group_name=group.name if group else None,
        post_type=post.post_type.value if hasattr(post.post_type, "value") else str(post.post_type or "news"),
        title=post.title,
        content=post.content,
        media_urls=media_urls,
        attachments=attachments,
        views_count=post.views_count or 0,
        likes_count=post.likes_count or 0,
        is_pinned=post.is_pinned or False,
        created_at=post.created_at,
        user_liked=user_liked,
        requires_confirmation=post.requires_confirmation or False,
        confirmation_deadline=post.confirmation_deadline,
        user_confirmed=user_confirmed,
        confirmations_count=confirmations_count
    )


def _poll_to_response(poll: Poll, db: Session, current_user_id: int) -> PollResponse:
    """Конвертировать Poll в ответ API"""
    creator = db.query(User).filter(User.id == poll.creator_id).first()
    group = db.query(Group).filter(Group.id == poll.group_id).first() if poll.group_id else None
    
    # Подсчёт голосов
    votes_data = []
    total_votes = 0
    user_voted = None
    
    for i, option in enumerate(poll.options):
        option_votes = db.query(PollVote).filter(
            PollVote.poll_id == poll.id,
            PollVote.option_index == i
        ).all()
        
        count = len(option_votes)
        total_votes += count
        
        users = []
        if not poll.is_anonymous:
            for v in option_votes:
                u = db.query(User).filter(User.id == v.user_id).first()
                if u:
                    users.append({"id": u.id, "name": u.full_name})
        
        # Проверяем голос текущего пользователя
        for v in option_votes:
            if v.user_id == current_user_id:
                user_voted = i
        
        votes_data.append({
            "option_index": i,
            "option_text": option,
            "count": count,
            "users": users
        })
    
    return PollResponse(
        id=poll.id,
        creator_id=poll.creator_id,
        creator_name=creator.full_name if creator else "Unknown",
        group_id=poll.group_id,
        group_name=group.name if group else None,
        question=poll.question,
        options=poll.options,
        votes=votes_data,
        total_votes=total_votes,
        is_anonymous=poll.is_anonymous,
        is_multiple_choice=poll.is_multiple_choice,
        ends_at=poll.ends_at,
        is_closed=poll.is_closed,
        created_at=poll.created_at,
        user_voted=user_voted
    )
