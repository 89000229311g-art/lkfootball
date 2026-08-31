from typing import Any, List

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, get_db
from app.core.security import get_password_hash
from app.core.tenant import is_platform_owner
from app.models import Academy, User, UserCredential
from app.schemas.academy import (
    AcademyAdminCreate,
    AcademyAdminResponse,
    AcademyCreate,
    AcademyResponse,
    AcademyUpdate,
    PublicAcademyResponse,
)

router = APIRouter()


def get_academy_by_slug_or_404(db: Session, slug: str) -> Academy:
    academy = db.query(Academy).filter(Academy.slug == slug).first()
    if not academy:
        raise HTTPException(status_code=404, detail="Academy not found")
    return academy


def build_academy_urls(request: Request, academy: Academy) -> tuple[str, str]:
    base_url = str(request.base_url).rstrip("/")
    cabinet_url = f"{base_url}/{academy.slug}"
    login_url = f"{cabinet_url}/login"
    return cabinet_url, login_url


def save_platform_created_credential(
    db: Session,
    user: User,
    password: str,
    current_user: User,
    note: str,
) -> None:
    credential = db.query(UserCredential).filter(UserCredential.user_id == user.id).first()
    if credential:
        credential.login = user.phone
        credential.password_plain = password
        credential.updated_by_id = current_user.id
        credential.note = note
    else:
        credential = UserCredential(
            user_id=user.id,
            login=user.phone,
            created_by_id=current_user.id,
            note=note,
        )
        credential.password_plain = password
        db.add(credential)


@router.get("/public/{slug}", response_model=PublicAcademyResponse)
async def get_public_academy(slug: str, db: Session = Depends(get_db)) -> Academy:
    return get_academy_by_slug_or_404(db, slug)


@router.get("/me", response_model=PublicAcademyResponse)
async def get_my_academy(current_user: User = Depends(get_current_user)) -> Academy:
    if not current_user.academy:
        raise HTTPException(status_code=404, detail="Academy not linked")
    return current_user.academy


@router.get("/", response_model=List[AcademyResponse])
async def list_academies(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    if not is_platform_owner(current_user):
        raise HTTPException(status_code=403, detail="Platform owner access required")
    return db.query(Academy).order_by(Academy.created_at.desc()).all()


@router.post("/", response_model=AcademyResponse)
async def create_academy(
    academy_in: AcademyCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    if not is_platform_owner(current_user):
        raise HTTPException(status_code=403, detail="Platform owner access required")
    if db.query(Academy).filter(Academy.slug == academy_in.slug).first():
        raise HTTPException(status_code=400, detail="Academy slug already exists")

    academy = Academy(**academy_in.model_dump())
    db.add(academy)
    db.commit()
    db.refresh(academy)
    return academy


@router.post("/{academy_id}/admin", response_model=AcademyAdminResponse)
async def create_or_update_academy_admin(
    academy_id: int,
    admin_in: AcademyAdminCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    if not is_platform_owner(current_user):
        raise HTTPException(status_code=403, detail="Platform owner access required")

    academy = db.query(Academy).filter(Academy.id == academy_id).first()
    if not academy:
        raise HTTPException(status_code=404, detail="Academy not found")

    phone = admin_in.phone
    existing_user = (
        db.query(User)
        .filter(
            User.phone == phone,
            User.academy_id == academy.id,
            User.deleted_at.is_(None),
        )
        .first()
    )
    existing_other_academy = (
        db.query(User)
        .filter(
            User.phone == phone,
            User.academy_id != academy.id,
            User.deleted_at.is_(None),
            User.role != "platform_owner",
        )
        .first()
    )
    if existing_other_academy:
        raise HTTPException(
            status_code=400,
            detail="Этот телефон уже используется в другой академии",
        )

    if existing_user:
        user = existing_user
        user.full_name = admin_in.full_name
        user.role = admin_in.role
        user.password_hash = get_password_hash(admin_in.password)
        user.is_active = True
    else:
        user = User(
            academy_id=academy.id,
            phone=phone,
            password_hash=get_password_hash(admin_in.password),
            full_name=admin_in.full_name,
            role=admin_in.role,
            preferred_language=academy.default_language,
            is_active=True,
            can_view_history=True,
            can_view_analytics=True,
            can_view_crm=True,
            can_view_recruitment=True,
            can_view_marketing=True,
        )
        db.add(user)
        db.flush()

    save_platform_created_credential(
        db,
        user,
        admin_in.password,
        current_user,
        f"Создан через Football CRM для академии {academy.name}",
    )
    db.commit()
    db.refresh(user)

    cabinet_url, login_url = build_academy_urls(request, academy)
    return {
        "id": user.id,
        "academy_id": academy.id,
        "full_name": user.full_name,
        "phone": user.phone,
        "role": user.role,
        "login_url": login_url,
        "cabinet_url": cabinet_url,
    }


@router.put("/{academy_id}", response_model=AcademyResponse)
async def update_academy(
    academy_id: int,
    academy_in: AcademyUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    if not is_platform_owner(current_user):
        raise HTTPException(status_code=403, detail="Platform owner access required")

    academy = db.query(Academy).filter(Academy.id == academy_id).first()
    if not academy:
        raise HTTPException(status_code=404, detail="Academy not found")

    update_data = academy_in.model_dump(exclude_unset=True)
    previous_language = academy.default_language
    for key, value in update_data.items():
        setattr(academy, key, value)

    # If academy language changed, keep staff in sync with academy defaults.
    # For single-language countries this removes extra language confusion after login.
    if "default_language" in update_data and update_data["default_language"]:
        db.query(User).filter(
            User.academy_id == academy.id,
            User.deleted_at.is_(None),
            User.role != "platform_owner",
        ).update({User.preferred_language: academy.default_language}, synchronize_session=False)

    db.commit()
    db.refresh(academy)
    return academy


@router.get("/{slug}/manifest.json")
async def academy_manifest(slug: str, request: Request, db: Session = Depends(get_db)):
    academy = get_academy_by_slug_or_404(db, slug)
    if not academy.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Academy is inactive")

    base_url = str(request.base_url).rstrip("/")
    logo = academy.logo_url or "/icons/icon-512.png"
    icon_src = logo if logo.startswith("http") else f"{base_url}{logo}"
    name = academy.name
    short_name = academy.short_name or academy.name[:12]

    return JSONResponse(
        {
            "name": name,
            "short_name": short_name,
            "description": f"{name} - личный кабинет футбольной академии",
            "start_url": f"/{academy.slug}",
            "scope": "/",
            "display": "standalone",
            "background_color": "#ffffff",
            "theme_color": academy.primary_color,
            "orientation": "portrait-primary",
            "icons": [
                {"src": icon_src, "sizes": "192x192", "type": "image/png", "purpose": "any maskable"},
                {"src": icon_src, "sizes": "512x512", "type": "image/png", "purpose": "any maskable"},
            ],
            "categories": ["education", "sports", "business"],
            "lang": "ru",
            "prefer_related_applications": False,
        }
    )
