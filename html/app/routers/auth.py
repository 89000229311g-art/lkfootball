from datetime import timedelta
from typing import Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query, Request, UploadFile, File
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.core.deps import get_db, get_current_active_superuser, get_current_user
from app.core.security import verify_password, get_password_hash, create_access_token
from app.core.config import settings
from app.core.rate_limiter import limiter, get_rate_limit
from app.core.timezone import now_naive  # Moldova timezone
from app.core import audit_service
from app.schemas.auth import Token, UserCreate, UserResponse, UserUpdate, UserPagination, PasswordChangeRequest, LanguageRequest
from app.models import User, UserCredential
from app.models.user_activity import UserActivityLog
from app.routers.upload import save_avatar

router = APIRouter()


# ==================== ФУНКЦИИ ДЛЯ РАБОТЫ С УЧЕТНЫМИ ДАННЫМИ ====================

def save_user_credential(
    db: Session,
    user_id: int,
    login: str,
    password: str,
    created_by_id: int = None,
    note: str = None
) -> UserCredential:
    """
    🔐 Сохранить учетные данные пользователя.
    Если запись уже существует - обновляет.
    """
    credential = db.query(UserCredential).filter(UserCredential.user_id == user_id).first()
    
    if credential:
        # Обновляем существующую запись
        credential.login = login
        credential.password_plain = password
        credential.updated_by_id = created_by_id
        if note:
            credential.note = note
    else:
        # Создаем новую запись
        credential = UserCredential(
            user_id=user_id,
            login=login,
            password_plain=password,
            created_by_id=created_by_id,
            note=note
        )
        db.add(credential)
    
    db.commit()
    db.refresh(credential)
    return credential


def get_role_display_name(role: str) -> str:
    """Получить отображаемое имя роли."""
    roles = {
        'owner': '🏆 Финансовый директор',
        'super_admin': '🏆 Спортивный директор',
        'admin': '🛡️ Администратор',
        'coach': '👨‍🏫 Тренер',
        'parent': '👨‍👩‍👧‍👦 Родитель',
        'accountant': '💰 Бухгалтер'
    }
    return roles.get(role, role)

@router.post("/login", response_model=Token)
@limiter.limit(get_rate_limit("login"))  # 5/minute - bruteforce protection
async def login(
    request: Request,
    db: Session = Depends(get_db),
    form_data: OAuth2PasswordRequestForm = Depends()
) -> Any:
    """OAuth2 compatible token login, get an access token for future requests."""
    # Try exact match first (only active users - not deleted)
    user = db.query(User).filter(User.phone == form_data.username, User.deleted_at.is_(None)).first()
    
    # If not found, try cleaning up phone number
    if not user:
        # Handle URL encoded + (%2B) if it comes through incorrectly, though FastAPI usually handles it
        # Also remove spaces, parens, dashes
        clean_username = form_data.username.replace("%2B", "+").replace(" ", "")
        
        # 1. Check exact match again with cleaned username
        user = db.query(User).filter(User.phone == clean_username, User.deleted_at.is_(None)).first()
        
        if not user:
            # 2. Try adding + if missing
            if not clean_username.startswith("+"):
                phone_with_plus = "+" + clean_username
                user = db.query(User).filter(User.phone == phone_with_plus, User.deleted_at.is_(None)).first()
            
            # 3. Try removing + if present (some dbs store without)
            if not user and clean_username.startswith("+"):
                phone_without_plus = clean_username[1:]
                user = db.query(User).filter(User.phone == phone_without_plus, User.deleted_at.is_(None)).first()

    if user is None or not verify_password(form_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect phone number or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
        
    # 📝 LOG ACTIVITY
    try:
        # Determine device info
        user_agent = request.headers.get("user-agent", "").lower()
        ip_address = request.client.host if request.client else None
        
        device_type = "desktop"
        if "mobile" in user_agent or "android" in user_agent or "iphone" in user_agent:
            device_type = "mobile"
        elif "tablet" in user_agent or "ipad" in user_agent:
            device_type = "tablet"
            
        platform = "unknown"
        if "windows" in user_agent: platform = "Windows"
        elif "macintosh" in user_agent or "mac os" in user_agent: platform = "macOS"
        elif "linux" in user_agent: platform = "Linux"
        elif "android" in user_agent: platform = "Android"
        elif "ios" in user_agent or "iphone" in user_agent or "ipad" in user_agent: platform = "iOS"
        
        activity = UserActivityLog(
            user_id=user.id,
            ip_address=ip_address,
            user_agent=request.headers.get("user-agent", ""),
            device_type=device_type,
            platform=platform
        )
        db.add(activity)
        db.commit()
    except Exception as e:
        db.rollback()
        print(f"Failed to log activity: {e}")
        # Don't block login
    
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.phone, "role": user.role.lower() if user.role else "parent"},
        expires_delta=access_token_expires
    )
    
    # --- AUTO-LINKING LOGIC START ---
    # If user is a parent, try to link students by phone number if not already linked
    if user.role.lower() == "parent":
        from app.models import Student, StudentGuardian
        
        # Normalize parent phone (last 8 digits)
        def normalize_phone(p):
            if not p: return ""
            return p.replace(" ", "").replace("-", "").replace("(", "").replace(")", "").replace("+", "")[-8:]
            
        parent_phone_clean = normalize_phone(user.phone)
        
        # Find students with matching parent_phone
        # Note: In SQLite/Postgres we might need to be careful with string manipulation
        # For simplicity, we fetch potential candidates and filter in Python or use exact match if format is consistent
        # Better approach: Fetch all students where parent_phone is not null, then filter
        # Optimization: Fetch only students not yet linked to THIS parent
        
        # Get all students that don't have this parent as guardian yet
        # We can't easily filter by normalized phone in SQL without custom functions
        potential_students = db.query(Student).filter(
            Student.parent_phone.isnot(None),
            Student.deleted_at.is_(None)
        ).all()
        
        for student in potential_students:
            if normalize_phone(student.parent_phone) == parent_phone_clean:
                # Check if link already exists
                exists = db.query(StudentGuardian).filter(
                    StudentGuardian.student_id == student.id,
                    StudentGuardian.user_id == user.id
                ).first()
                
                if not exists:
                    # Create link
                    link = StudentGuardian(
                        student_id=student.id,
                        user_id=user.id,
                        relationship_type="Parent (Auto-linked)"
                    )
                    db.add(link)
                    # Also update student's parent_phone to match exactly the user's phone for consistency
                    student.parent_phone = user.phone
                    
        db.commit()
    # --- AUTO-LINKING LOGIC END ---
    
    return {"access_token": access_token, "token_type": "bearer"}

@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)) -> Any:
    """Get current user info."""
    return current_user

@router.put("/me", response_model=UserResponse)
async def update_me(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    user_in: UserUpdate = None
) -> Any:
    """
    Update current user profile.
    
    Ограничения:
    - 🏆 Руководитель (super_admin) - может редактировать свой профиль
    - 🛡️ Администратор - НЕ может редактировать себя (только Руководитель)
    - 👨‍🏫 Тренер - НЕ может редактировать себя (только Админ/Руководитель)
    - 👨‍👩‍👧‍👦 Родитель - НЕ может редактировать себя (только Админ/Руководитель)
    """
    user_role = current_user.role.lower() if current_user.role else ""
    
    # Оба основателя (super_admin и owner) могут редактировать свой профиль
    if user_role not in ["super_admin", "owner"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="❌ Вы не можете редактировать свой профиль. Обратитесь к Администратору или Руководителю."
        )
    
    if not user_in:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No data provided"
        )
    
    # Check if phone is being changed and if it's already taken
    if user_in.phone and user_in.phone != current_user.phone:
        existing_user = db.query(User).filter(User.phone == user_in.phone).first()
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Этот номер телефона уже используется"
            )
        current_user.phone = user_in.phone
    
    if user_in.full_name is not None:
        current_user.full_name = user_in.full_name
    
    if user_in.phone_secondary is not None:
        current_user.phone_secondary = user_in.phone_secondary
    
    db.commit()
    db.refresh(current_user)
    
    return current_user


@router.post("/me/avatar")
async def upload_my_avatar(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Any:
    """
    📸 Загрузка аватара пользователя.
    Доступно для всех авторизованных пользователей (включая родителей).
    """
    # Загружаем файл
    avatar_url = save_avatar(file, prefix=f"user_{current_user.id}")
    
    # Обновляем URL аватара пользователя
    current_user.avatar_url = avatar_url
    db.commit()
    db.refresh(current_user)
    
    return {
        "message": "Avatar uploaded successfully",
        "avatar_url": avatar_url
    }


@router.put("/me/password")
@limiter.limit(get_rate_limit("password"))  # 3/minute - strict limit
async def change_password(
    request: Request,
    password_data: PasswordChangeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """
    Смена своего пароля.
    
    Любой пользователь может изменить свой пароль, если знает текущий пароль.
    """
    current_password = password_data.current_password
    new_password = password_data.new_password
    
    user_role = current_user.role.lower() if current_user.role else ""
    
    # Only allow self-service password change
    # Note: We removed the role restriction to allow all users to change their own password
    # if they know the current one.
    
    if not current_password or not new_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Both current and new password are required"
        )
    
    if not verify_password(current_password, current_user.password_hash):
        print(f"❌ Password change failed for user {current_user.phone}: Incorrect current password provided.")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect current password"
        )
    
    if len(new_password) < 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be at least 6 characters"
        )
    
    current_user.password_hash = get_password_hash(new_password)
    
    # Синхронизируем с таблицей credentials
    save_user_credential(
        db=db,
        user_id=current_user.id,
        login=current_user.phone,
        password=new_password,
        created_by_id=current_user.id,
        note="Пароль изменён пользователем"
    )
    
    db.commit()
    
    return {"message": "✅ Пароль успешно изменен"}


@router.get("/me/password")
async def get_my_password(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Any:
    """
    🔐 Получить свой пароль.
    
    Любой авторизованный пользователь может просмотреть свой пароль.
    Пароль хранится в зашифрованном виде и расшифровывается при запросе.
    """
    credential = db.query(UserCredential).filter(
        UserCredential.user_id == current_user.id
    ).first()
    
    if not credential:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Учетные данные не найдены"
        )
    
    return {
        "login": credential.login,
        "password": credential.password_plain
    }


# ФАЗА 7: Эндпоинт для смены языка
@router.put("/me/language")
async def change_language(
    lang_data: LanguageRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """
    Смена предпочитаемого языка пользователя.
    Поддерживаемые языки: 'ro' (română), 'ru' (русский)
    """
    language = lang_data.language
    
    if not language:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Language is required"
        )
    
    # Валидация языка
    from app.core.localization import SUPPORTED_LANGUAGES
    
    if language not in SUPPORTED_LANGUAGES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported language. Allowed: {', '.join(SUPPORTED_LANGUAGES.keys())}"
        )
    
    # Обновляем язык
    current_user.preferred_language = language
    db.commit()
    db.refresh(current_user)
    
    lang_name = SUPPORTED_LANGUAGES[language]['name']
    return {
        "message": f"Language changed to {lang_name}",
        "language": language,
        "language_name": lang_name
    }


@router.put("/me/fcm-token")
async def update_fcm_token(
    fcm_token: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Any:
    """
    Update FCM token for push notifications.
    Called by mobile app on login or token refresh.
    """
    if not fcm_token or len(fcm_token) < 10:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid FCM token"
        )
    
    current_user.fcm_token = fcm_token
    db.commit()
    
    return {"message": "FCM token updated successfully"}


@router.delete("/me/fcm-token")
async def remove_fcm_token(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Any:
    """
    Remove FCM token (e.g., on logout).
    """
    current_user.fcm_token = None
    db.commit()
    
    return {"message": "FCM token removed"}

@router.get("/users", response_model=UserPagination)
async def get_users(
    role: str = None,
    roles: List[str] = Query(None),  # Allow multiple roles filtering
    search: str = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Any:
    """
    Get all users with pagination (super admin and admin only).
    """
    user_role = current_user.role.lower() if current_user.role else ""
    # Allow staff to view users for assignment
    if user_role not in ["super_admin", "admin", "owner", "coach", "accountant"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough permissions"
        )
    
    query = db.query(User).filter(User.deleted_at.is_(None))
    
    # Filter by multiple roles
    if roles:
        query = query.filter(User.role.in_([r.lower() for r in roles]))
    elif role:
        query = query.filter(User.role == role.lower())
    
    if search:
        search_pattern = f"%{search}%"
        query = query.filter(
            (User.full_name.ilike(search_pattern)) |
            (User.phone.ilike(search_pattern))
        )
    
    total = query.count()
    users = query.offset(skip).limit(limit).all()
    
    return {
        "data": users,
        "total": total,
        "page": (skip // limit) + 1,
        "pages": (total + limit - 1) // limit
    }

@router.put("/users/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: int,
    user_in: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Any:
    """
    Update user.
    
    Иерархия:
    - 🏆 Руководитель (super_admin) может редактировать ВСЕХ
    - 🛡️ Администратор (admin) может редактировать coach и parent (НЕ может admin и super_admin)
    - 👨‍🏫 Тренер (coach) не может редактировать никого
    - 👨‍👩‍👧‍👦 Родитель (parent) не может редактировать никого
    """
    current_user_role = current_user.role.lower() if current_user.role else ""
    if current_user_role not in ["super_admin", "admin", "owner"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="❌ У вас нет прав на редактирование пользователей"
        )
    
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    target_user_role = user.role.lower() if user.role else ""
    
    # 🏆 ДИРЕКТОРА (Владелец и Спортивный директор) могут редактировать всех,
    # но НЕ могут редактировать профиль друг друга (оба основателя защищены симметрично)
    if current_user_role in ["super_admin", "owner"]:
        if current_user_role != target_user_role and target_user_role in ["super_admin", "owner"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="❌ Директор не может редактировать профиль другого Директора"
            )
        pass  # Продолжаем выполнение
    
    # 🛡️ АДМИНИСТРАТОР - ограничения
    elif current_user_role == "admin":
        # Администратор НЕ может редактировать руководителей
        if target_user_role in ["super_admin", "owner"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="❌ Администратор не может редактировать Директоров"
            )
        
        # Администратор НЕ может редактировать других администраторов
        if target_user_role == "admin":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="❌ Администратор не может редактировать других Администраторов. Обратитесь к Руководителю."
            )
    
    # Check phone uniqueness if changed
    if user_in.phone and user_in.phone != user.phone:
        existing_user = db.query(User).filter(User.phone == user_in.phone).first()
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Phone number already in use"
            )
        user.phone = user_in.phone
        
    if user_in.full_name is not None:
        user.full_name = user_in.full_name
        
    if user_in.phone_secondary is not None:
        user.phone_secondary = user_in.phone_secondary
    
    # Handle password update (admin resetting user password)
    if user_in.password:
        user.password_hash = get_password_hash(user_in.password)
        # Синхронизируем с таблицей credentials
        save_user_credential(
            db=db,
            user_id=user.id,
            login=user.phone,
            password=user_in.password,
            created_by_id=current_user.id,
            note=f"Пароль обновлён администратором ({current_user.full_name})"
        )
    
    # Handle can_view_history permission (only super_admin/owner can set, only for admins)
    if user_in.can_view_history is not None:
        if current_user_role not in ["super_admin", "owner"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="❌ Только Руководитель может выдавать разрешение на просмотр истории"
            )
        if target_user_role != "admin":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="❌ Разрешение на историю можно выдать только Администраторам"
            )
        user.can_view_history = user_in.can_view_history
        
    # Handle can_view_analytics permission (only super_admin/owner can set, only for admins)
    if user_in.can_view_analytics is not None:
        if current_user_role not in ["super_admin", "owner"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="❌ Только Руководитель может выдавать разрешение на просмотр аналитики"
            )
        if target_user_role != "admin":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="❌ Разрешение на аналитику можно выдать только Администраторам"
            )
        user.can_view_analytics = user_in.can_view_analytics

    # Handle can_view_crm permission (only super_admin/owner can set, only for admins)
    if user_in.can_view_crm is not None:
        if current_user_role not in ["super_admin", "owner"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="❌ Только Руководитель может выдавать разрешение на доступ к CRM"
            )
        if target_user_role != "admin":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="❌ Разрешение на CRM можно выдать только Администраторам"
            )
        user.can_view_crm = user_in.can_view_crm

    # Handle can_view_recruitment permission (only super_admin/owner can set, only for admins)
    if user_in.can_view_recruitment is not None:
        if current_user_role not in ["super_admin", "owner"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="❌ Только Руководитель может выдавать разрешение на доступ к Найму"
            )
        if target_user_role != "admin":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="❌ Разрешение на Найм можно выдать только Администраторам"
            )
        user.can_view_recruitment = user_in.can_view_recruitment

    # Handle can_view_marketing permission (only super_admin/owner can set, only for admins)
    if hasattr(user_in, "can_view_marketing") and user_in.can_view_marketing is not None:
        if current_user_role not in ["super_admin", "owner"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="❌ Только Руководитель может выдавать разрешение на доступ к Маркетингу"
            )
        if target_user_role != "admin":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="❌ Разрешение на Маркетинг можно выдать только Администраторам"
            )
        user.can_view_marketing = user_in.can_view_marketing
    
    db.commit()
    db.refresh(user)
    return user

@router.delete("/users/{user_id}")
async def delete_user(
    user_id: int,
    reason: str = Query(None, description="Причина удаления"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> dict:
    """
    🗑️ Мягкое удаление пользователя (архивирование).
    
    ❗ ВАЖНО для РОДИТЕЛЕЙ:
    Ученик и родитель - связка. Удаляются ВСЕГДА ВМЕСТЕ.
    При удалении родителя - все его дети также архивируются.
    
    Иерархия:
    - 🏆 Руководитель (super_admin) может удалять ВСЕХ (кроме себя)
    - 🛡️ Администратор (admin) может удалять только coach и parent
    """
    from ..models.group import Group
    from ..models.student_guardian import StudentGuardian
    from ..models.student import Student
    
    current_user_role = current_user.role.lower() if current_user.role else ""
    if current_user_role not in ["super_admin", "admin", "owner"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="❌ У вас нет прав на удаление пользователей"
        )
    
    # Cannot delete yourself
    if current_user.id == user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="❌ Нельзя удалить свой аккаунт"
        )
    
    user = db.query(User).filter(User.id == user_id, User.deleted_at.is_(None)).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found or already deleted"
        )
        
    target_user_role = user.role.lower() if user.role else ""
    user_name = user.full_name
    
    # 🏆 ДИРЕКТОРА (owner/super_admin) - полные права, но НЕ могут удалить друг друга
    if current_user_role in ["owner", "super_admin"]:
        if current_user_role != target_user_role and target_user_role in ["owner", "super_admin"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="❌ Нельзя удалить другого Директора"
            )
            
    # 🛡️ АДМИНИСТРАТОР - ограничения
    elif current_user_role == "admin":
        # Администратор может удалять ТОЛЬКО родителей, тренеров и бухгалтеров
        if target_user_role not in ["parent", "coach", "accountant"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="❌ Администратор может удалять только Родителей, Тренеров и Бухгалтеров"
            )
    
    deleted_info = {
        "user": user_name,
        "phone": user.phone,
        "role": target_user_role,
        "students_archived": [],
        "reason": reason or "Удален администратором"
    }
    
    try:
        now = now_naive()  # Moldova timezone
        
        # 1. Clear coach assignments from groups (SET NULL)
        if target_user_role == "coach":
            db.query(Group).filter(Group.coach_id == user_id).update({"coach_id": None})
        
        # 2. Для родителей - ОБЯЗАТЕЛЬНОЕ удаление связанных учеников (связка ученик+родитель)
        if target_user_role == "parent":
            # Получаем всех связанных учеников
            guardian_links = db.query(StudentGuardian).filter(
                StudentGuardian.user_id == user_id
            ).all()
            student_ids = [g.student_id for g in guardian_links]
            
            # ВСЕГДА удаляем учеников этого родителя (если они не привязаны к другим родителям)
            if student_ids:
                for student_id in student_ids:
                    student = db.query(Student).filter(
                        Student.id == student_id,
                        Student.deleted_at.is_(None)
                    ).first()
                    if student:
                        # Проверяем, есть ли у ученика другие родители
                        other_guardians = db.query(StudentGuardian).filter(
                            StudentGuardian.student_id == student_id,
                            StudentGuardian.user_id != user_id
                        ).count()
                        
                        # Если нет других родителей - архивируем ученика
                        if other_guardians == 0:
                            student_name = f"{student.first_name} {student.last_name}"
                            group_name = student.group.name if student.group else None
                            
                            # Сохраняем информацию перед удалением
                            student.last_parent_name = user_name
                            student.last_parent_phone = user.phone
                            student.last_group_name = group_name
                            student.deleted_at = now
                            student.deleted_by_id = current_user.id
                            student.deletion_reason = reason or f"Удален вместе с родителем {user_name}"
                            
                            # Удаляем из группы
                            student.group_id = None
                            student.status = "archived"
                            
                            deleted_info["students_archived"].append({
                                "name": student_name,
                                "group": group_name
                            })
            
            # Удаляем связи родитель-ученик
            db.query(StudentGuardian).filter(StudentGuardian.user_id == user_id).delete()
        
        # 3. Мягкое удаление пользователя (archived)
        user.deleted_at = now
        user.deleted_by_id = current_user.id
        user.deletion_reason = reason or "Удален администратором"
        user.is_active = False  # Деактивируем аккаунт
        
        db.commit()
        
        return {
            "message": f"✅ Пользователь {user_name} перемещён в архив",
            "deleted": deleted_info,
            "can_restore": True
        }
        
    except Exception as e:
        db.rollback()
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"❌ Ошибка при удалении пользователя: {str(e)}"
        )


# ==================== АРХИВ ПОЛЬЗОВАТЕЛЕЙ ====================

@router.get("/users/archived")
async def get_archived_users(
    role: str = None,
    search: str = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Any:
    """
    📦 Получить архивированных (удалённых) пользователей.
    """
    user_role = current_user.role.lower() if current_user.role else ""
    if user_role not in ["super_admin", "admin", "owner"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Недостаточно прав"
        )
    
    query = db.query(User).filter(User.deleted_at.isnot(None))  # Only archived
    
    if role:
        query = query.filter(User.role == role.lower())
    
    if search:
        search_pattern = f"%{search}%"
        query = query.filter(
            or_(
                User.full_name.ilike(search_pattern),
                User.phone.ilike(search_pattern)
            )
        )
    
    total = query.count()
    users = query.order_by(User.deleted_at.desc()).offset(skip).limit(limit).all()
    
    result = []
    for u in users:
        result.append({
            "id": u.id,
            "phone": u.phone,
            "full_name": u.full_name,
            "role": u.role,
            "deleted_at": u.deleted_at.isoformat() if u.deleted_at else None,
            "deletion_reason": u.deletion_reason,
            "deleted_by_id": u.deleted_by_id
        })
    
    return {
        "data": result,
        "total": total,
        "skip": skip,
        "limit": limit
    }


@router.post("/users/{user_id}/restore")
async def restore_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> dict:
    """
    ♻️ Восстановить пользователя из архива.
    """
    user_role = current_user.role.lower() if current_user.role else ""
    if user_role not in ["super_admin", "admin", "owner"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Недостаточно прав"
        )
    
    user = db.query(User).filter(User.id == user_id, User.deleted_at.isnot(None)).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Пользователь не найден в архиве"
        )
    
    # Восстановление
    user.deleted_at = None
    user.deletion_reason = None
    user.deleted_by_id = None
    user.is_active = True
    
    # Log restoration
    audit_service.log_restore(
        db, 
        "user", 
        user, 
        current_user, 
        reason="Восстановлен из архива"
    )
    
    db.commit()
    
    return {
        "message": f"✅ Пользователь {user.full_name} восстановлен",
        "user_id": user.id,
        "full_name": user.full_name,
        "role": user.role
    }

@router.put("/users/{user_id}/password")
@limiter.limit(get_rate_limit("password"))  # 3/minute - strict limit
async def admin_reset_password(
    request: Request,
    user_id: int,
    new_password: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Any:
    """
    🔐 Сброс пароля пользователя (управление по иерархии).
    
    Иерархия ролей:
    1. 🏆 super_admin (Руководитель) - может менять пароль ВСЕМ (admin, coach, parent)
    2. 🛡️ admin (Администратор) - может менять пароль coach и parent (НЕ может admin и super_admin)
    3. 👨‍🏫 coach (Тренер) - не может менять пароли
    4. 👨‍👩‍👧‍👦 parent (Родитель) - не может менять пароли
    """
    current_role = current_user.role.lower() if current_user.role else ""
    
    # Руководители (super_admin, owner) и администраторы могут менять пароли
    if current_role not in ["super_admin", "owner", "admin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="❌ У вас нет прав на изменение паролей. Доступно только для Руководителей и Администраторов."
        )
    
    # Нельзя менять свой собственный пароль через этот эндпоинт
    if current_user.id == user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="❌ Для изменения своего пароля используйте /auth/me/password"
        )
    
    # Проверка длины пароля
    if not new_password or len(new_password) < 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="❌ Пароль должен содержать минимум 6 символов"
        )
    
    # Находим целевого пользователя
    target_user = db.query(User).filter(User.id == user_id).first()
    if not target_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="❌ Пользователь не найден"
        )
    
    target_role = target_user.role.lower() if target_user.role else ""
    
    # 🏆 ОСНОВАТЕЛИ (super_admin, owner) - могут менять пароль ВСЕМ
    if current_role in ["super_admin", "owner"]:
        target_user.password_hash = get_password_hash(new_password)
        # 🔐 Сохраняем учетные данные
        save_user_credential(
            db=db,
            user_id=user_id,
            login=target_user.phone,
            password=new_password,
            created_by_id=current_user.id,
            note=f"Пароль изменен Руководителем: {current_user.full_name}"
        )
        db.commit()
        return {
            "message": f"✅ Пароль успешно изменен для {target_user.full_name} ({target_role})",
            "user_id": user_id,
            "role": target_role
        }
    
    # 🛡️ АДМИНИСТРАТОР (admin) - может менять пароль только тренерам и родителям
    elif current_role == "admin":
        # Администратор НЕ может менять пароль руководителям
        if target_role == "super_admin":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="❌ Администратор не может изменять пароль Руководителя"
            )
        
        # Администратор НЕ может менять пароль другим администраторам
        if target_role == "admin":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="❌ Администратор не может изменять пароль другим Администраторам. Обратитесь к Руководителю."
            )
        
        # Администратор МОЖЕТ менять пароль тренерам и родителям
        if target_role in ["coach", "parent"]:
            target_user.password_hash = get_password_hash(new_password)
            # 🔐 Сохраняем учетные данные
            save_user_credential(
                db=db,
                user_id=user_id,
                login=target_user.phone,
                password=new_password,
                created_by_id=current_user.id,
                note=f"Пароль изменен Администратором: {current_user.full_name}"
            )
            role_name = "Тренера" if target_role == "coach" else "Родителя"
            return {
                "message": f"✅ Пароль успешно изменен для {role_name} {target_user.full_name}",
                "user_id": user_id,
                "role": target_role
            }
    
    # Если дошли сюда - что-то пошло не так
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="❌ Недостаточно прав для изменения пароля этого пользователя"
    )


@router.post("/users", response_model=UserResponse)
async def create_user(
    db: Session = Depends(get_db),
    user_in: UserCreate = None,
    current_user: User = Depends(get_current_user)
) -> Any:
    """
    👤 Создание нового пользователя.
    
    Иерархия:
    - 🏆 Руководитель может создавать любые роли
    - 🛡️ Администратор может создавать только coach и parent
    
    Для родителей (parent):
    - child_full_name, child_birth_date, child_group_id - обязательны
    - Автоматически создаётся студент и связь с родителем
    
    Учетные данные автоматически сохраняются для просмотра администраторами.
    """
    from datetime import datetime
    from app.models.student import Student
    from app.models.student_guardian import StudentGuardian
    from app.models.group import Group
    
    user_role = current_user.role.lower() if current_user.role else ""
    if user_role not in ["super_admin", "admin", "owner"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="❌ У вас нет прав на создание пользователей"
        )
    
    # Admin can only create coach and parent
    if user_role == "admin" and user_in.role not in ["coach", "parent"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="❌ Администраторы могут создавать только Тренеров и Родителей"
        )
    
    # Check if creating a parent - require child data
    if user_in.role == "parent":
        if not user_in.child_full_name or not user_in.child_birth_date or not user_in.child_group_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="❌ Для создания родителя укажите: child_full_name, child_birth_date, child_group_id"
            )
        
        # Validate group exists
        group = db.query(Group).filter(Group.id == user_in.child_group_id).first()
        if not group:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="❌ Группа не найдена"
            )
    
    user = db.query(User).filter(User.phone == user_in.phone).first()
    if user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="❌ Пользователь с таким номером телефона уже существует."
        )
    
    # Создаем пользователя
    user = User(
        phone=user_in.phone,
        phone_secondary=user_in.phone_secondary,
        password_hash=get_password_hash(user_in.password),
        full_name=user_in.full_name,
        role=user_in.role,
        is_active=True,
        can_view_history=user_in.can_view_history if user_in.role == "admin" and user_role in ["super_admin", "owner"] else False,
        can_view_analytics=user_in.can_view_analytics if user_in.role == "admin" and user_role in ["super_admin", "owner"] else False,
        can_view_crm=user_in.can_view_crm if user_in.role == "admin" and user_role in ["super_admin", "owner"] else False,
        can_view_recruitment=user_in.can_view_recruitment if user_in.role == "admin" and user_role in ["super_admin", "owner"] else False,
        can_view_marketing=user_in.can_view_marketing if user_in.role == "admin" and user_role in ["super_admin", "owner"] else False,
    )
    db.add(user)
    db.flush()  # Get user.id without committing
    
    # Log creation
    audit_service.log_create(
        db, 
        "user", 
        user, 
        current_user, 
        reason="Создан администратором"
    )
    
    # 🔗 АВТОМАТИЧЕСКАЯ ПРИВЯЗКА ДЕТЕЙ ПО ТЕЛЕФОНУ
    # Если регистрируется родитель - ищем учеников с его номером телефона
    if user_in.role == "parent":
        # Helper to normalize phone for comparison
        def normalize_phone(p):
            if not p: return ""
            return p.replace(" ", "").replace("-", "").replace("(", "").replace(")", "").replace("+", "")[-8:]

        user_phone_clean = normalize_phone(user_in.phone)

        # 1. Находим всех учеников
        all_students = db.query(Student).filter(Student.deleted_at.is_(None)).all()
        
        # 2. Фильтруем на Python (надежнее для разных форматов)
        existing_students = [
            s for s in all_students 
            if s.parent_phone and normalize_phone(s.parent_phone) == user_phone_clean
        ]
        
        for student in existing_students:
            # Проверяем, нет ли уже связи
            exists = db.query(StudentGuardian).filter(
                StudentGuardian.student_id == student.id,
                StudentGuardian.user_id == user.id
            ).first()
            
            if not exists:
                guardian = StudentGuardian(
                    student_id=student.id,
                    user_id=user.id,
                    relationship_type="Parent"
                )
                db.add(guardian)
                print(f"🔗 Автоматически привязан ученик {student.first_name} к родителю {user.full_name}")

    # 👶 Если родитель явно указывает данные ребенка при создании
    if user_in.role == "parent" and user_in.child_full_name:
        # Parse child name (split into first/last)
        name_parts = user_in.child_full_name.strip().split()
        if len(name_parts) >= 2:
            first_name = name_parts[0]
            last_name = " ".join(name_parts[1:])
        else:
            first_name = user_in.child_full_name
            last_name = ""
        
        # Parse birth date
        dob = datetime.strptime(user_in.child_birth_date, "%Y-%m-%d").date()
        
        # Create student
        student = Student(
            first_name=first_name,
            last_name=last_name,
            dob=dob,
            parent_phone=user_in.phone,
            group_id=user_in.child_group_id,
            medical_info=user_in.child_medical_info, # NEW: Save diseases/allergies
            medical_notes=user_in.child_medical_notes,  # NEW: Save medical notes
            status="active"
        )
        db.add(student)
        db.flush()  # Get student.id
        
        # Link parent to student
        guardian = StudentGuardian(
            student_id=student.id,
            user_id=user.id,
            relationship_type="Parent"
        )
        db.add(guardian)
    
    db.commit()
    db.refresh(user)
    
    # 🔐 Сохраняем учетные данные для просмотра
    save_user_credential(
        db=db,
        user_id=user.id,
        login=user_in.phone,
        password=user_in.password,
        created_by_id=current_user.id,
        note=f"Создан {get_role_display_name(current_user.role)}: {current_user.full_name}"
    )
    
    return user


# ==================== УПРАВЛЕНИЕ УЧЕТНЫМИ ДАННЫМИ ====================

@router.get("/credentials")
@limiter.limit(get_rate_limit("credentials"))  # 10/minute - sensitive data
async def get_all_credentials(
    request: Request,
    role: Optional[str] = Query(None, description="Фильтр по роли: admin, coach, parent"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Any:
    """
    🔐 Получить список учетных данных пользователей.
    
    Доступ:
    - 🏆 Руководитель - видит ВСЕ учетные данные (admin, coach, parent)
    - 🛡️ Администратор - видит только coach и parent
    """
    current_role = current_user.role.lower() if current_user.role else ""
    
    # super_admin and owner have full access, admin has limited access
    if current_role not in ["super_admin", "admin", "owner"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="❌ У вас нет прав на просмотр учетных данных"
        )
    
    # Получаем все учетные данные с информацией о пользователях
    query = db.query(UserCredential).join(User, UserCredential.user_id == User.id)
    
    # Фильтр по роли
    if role:
        query = query.filter(User.role == role.lower())
    
    # Администратор видит только coach и parent
    if current_role == "admin":
        query = query.filter(User.role.in_(["coach", "parent"]))
    
    credentials = query.all()
    
    result = []
    for cred in credentials:
        user = cred.user
        result.append({
            "id": cred.id,
            "user_id": cred.user_id,
            "full_name": user.full_name if user else "Unknown",
            "role": user.role if user else "unknown",
            "role_display": get_role_display_name(user.role) if user else "Unknown",
            "login": cred.login,
            "password": cred.password_plain,
            "created_at": cred.created_at.isoformat() if cred.created_at else None,
            "updated_at": cred.updated_at.isoformat() if cred.updated_at else None,
            "note": cred.note
        })
    
    return {
        "total": len(result),
        "credentials": result
    }


@router.get("/credentials/{user_id}")
@limiter.limit(get_rate_limit("credentials"))  # 10/minute - sensitive data
async def get_user_credential(
    request: Request,
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Any:
    """
    Get credentials for a specific user.
    
    Access:
    - Super admin: can view ALL credentials
    - Admin: can view only coach and parent credentials
    
    NOTE: Each view is logged for audit purposes.
    """
    current_role = current_user.role.lower() if current_user.role else ""
    
    # super_admin and owner have full access, admin has limited access
    if current_role not in ["super_admin", "admin", "owner"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied"
        )
    
    # Get target user
    target_user = db.query(User).filter(User.id == user_id).first()
    if not target_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    target_role = target_user.role.lower() if target_user.role else ""
    
    # Check hierarchy
    if current_role == "admin":
        if target_role in ["super_admin", "admin"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Admin cannot view super_admin or admin credentials"
            )
    
    # Get credentials
    credential = db.query(UserCredential).filter(UserCredential.user_id == user_id).first()
    
    if not credential:
        return {
            "user_id": user_id,
            "full_name": target_user.full_name,
            "role": target_user.role,
            "role_display": get_role_display_name(target_user.role),
            "login": target_user.phone,
            "password": "Password not saved (legacy user)",
            "note": "Need to reset password to save it"
        }
    
    # Record this view for audit
    credential.record_view(current_user.id)
    db.commit()
    
    return {
        "id": credential.id,
        "user_id": credential.user_id,
        "full_name": target_user.full_name,
        "role": target_user.role,
        "role_display": get_role_display_name(target_user.role),
        "login": credential.login,
        "password": credential.password_plain,  # Auto-decrypted via property
        "created_at": credential.created_at.isoformat() if credential.created_at else None,
        "updated_at": credential.updated_at.isoformat() if credential.updated_at else None,
        "note": credential.note,
        # Audit info
        "view_count": credential.view_count or 0,
        "last_viewed_at": credential.last_viewed_at.isoformat() if credential.last_viewed_at else None
    }
