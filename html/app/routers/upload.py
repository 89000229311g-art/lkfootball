from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from sqlalchemy.orm import Session, joinedload
import shutil
import os
from pathlib import Path
from ..core.deps import get_db, get_current_user
from ..core.timezone import now as get_now  # Moldova timezone
from ..models.user import User
from ..models.student import Student
from ..models.student_guardian import StudentGuardian

router = APIRouter()

# Directory for storing avatars
AVATAR_DIR = Path("static/avatars")
AVATAR_DIR.mkdir(parents=True, exist_ok=True)

# Directory for general media (photos/videos)
MEDIA_DIR = Path("uploads/media")
MEDIA_DIR.mkdir(parents=True, exist_ok=True)

# Directory for medical documents
MEDICAL_DOCS_DIR = Path("uploads/medical_docs")
MEDICAL_DOCS_DIR.mkdir(parents=True, exist_ok=True)

# Allowed file extensions
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp"}
ALLOWED_MEDIA_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".mp4", ".mov", ".avi"}
ALLOWED_DOC_EXTENSIONS = {".jpg", ".jpeg", ".png", ".pdf", ".doc", ".docx"}
MAX_FILE_SIZE = 100 * 1024 * 1024  # 100MB for videos

def save_file(file: UploadFile, directory: Path, allowed_extensions: set, prefix: str = "file") -> str:
    """
    Save uploaded file and return the file path.
    """
    # Validate file extension
    file_ext = Path(file.filename).suffix.lower()
    if file_ext not in allowed_extensions:
        raise HTTPException(
            status_code=400,
            detail=f"File type not allowed. Allowed types: {', '.join(allowed_extensions)}"
        )
    
    # Generate unique filename
    timestamp = get_now().strftime("%Y%m%d_%H%M%S")  # Moldova timezone
    filename = f"{prefix}_{timestamp}{file_ext}"
    filepath = directory / filename
    
    # Save file
    try:
        with filepath.open("wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save file: {str(e)}")
    
    # Return relative path (for storing in database)
    # If directory starts with 'static', use /static/...
    # If directory starts with 'uploads', use /uploads/...
    path_str = str(filepath)
    if path_str.startswith("static/"):
        return f"/{path_str}"
    elif path_str.startswith("uploads/"):
        return f"/{path_str}"
    return f"/{path_str}"


def save_avatar(file: UploadFile, prefix: str = "user") -> str:
    return save_file(file, AVATAR_DIR, ALLOWED_EXTENSIONS, prefix)


@router.post("/media")
async def upload_media(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Upload generic media (photo/video).
    Returns the URL of the uploaded file.
    """
    # Check if user is authorized (Coach or Admin)
    role = current_user.role.lower() if current_user.role else ""
    if role not in ["super_admin", "admin", "coach"]:
        raise HTTPException(status_code=403, detail="Not authorized to upload media")

    media_url = save_file(file, MEDIA_DIR, ALLOWED_MEDIA_EXTENSIONS, prefix=f"media_{current_user.id}")
    
    return {
        "message": "Media uploaded successfully",
        "url": media_url,
        "type": "image" if media_url.endswith(tuple(ALLOWED_EXTENSIONS)) else "video"
    }


@router.post("/medical-docs")
async def upload_medical_doc(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Upload medical document (certificate).
    Allowed for: Super Admin, Admin, Coach, Parent.
    """
    # Check if user is authorized
    role = current_user.role.lower() if current_user.role else ""
    if role not in ["super_admin", "admin", "coach", "parent"]:
        raise HTTPException(status_code=403, detail="Not authorized to upload medical documents")

    doc_url = save_file(file, MEDICAL_DOCS_DIR, ALLOWED_DOC_EXTENSIONS, prefix=f"med_{current_user.id}")
    
    return {
        "message": "Document uploaded successfully",
        "url": doc_url,
        "filename": file.filename
    }


@router.post("/users/avatar")
async def upload_user_avatar(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Upload avatar for the current user.
    """
    # Save file
    avatar_url = save_avatar(file, prefix=f"user_{current_user.id}")
    
    # Update user's avatar_url
    current_user.avatar_url = avatar_url
    db.commit()
    db.refresh(current_user)
    
    return {
        "message": "Avatar uploaded successfully",
        "avatar_url": avatar_url
    }


@router.post("/users/{user_id}/avatar")
async def upload_target_user_avatar(
    user_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Upload avatar for a specific user (Admin only).
    """
    # Check permissions
    role = current_user.role.lower() if current_user.role else ""
    if role not in ["super_admin", "admin"]:
        raise HTTPException(status_code=403, detail="Not authorized to upload avatar for other users")

    # Get user
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Save file
    avatar_url = save_avatar(file, prefix=f"user_{user_id}")
    
    # Update user's avatar_url
    user.avatar_url = avatar_url
    db.commit()
    db.refresh(user)
    
    return {
        "message": "User avatar uploaded successfully",
        "avatar_url": avatar_url
    }





@router.delete("/users/avatar")
async def delete_user_avatar(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Delete current user's avatar.
    """
    if not current_user.avatar_url:
        raise HTTPException(status_code=404, detail="No avatar to delete")
    
    # Delete file from filesystem
    try:
        filepath = Path(f".{current_user.avatar_url}")
        if filepath.exists():
            filepath.unlink()
    except Exception:
        pass  # Continue even if file deletion fails
    
    # Remove avatar_url from database
    current_user.avatar_url = None
    db.commit()
    
    return {"message": "Avatar deleted successfully"}


@router.delete("/users/{user_id}/avatar")
async def delete_target_user_avatar(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Delete avatar for a specific user (Admin only).
    """
    # Check permissions
    role = current_user.role.lower() if current_user.role else ""
    if role not in ["super_admin", "admin"]:
        raise HTTPException(status_code=403, detail="Not authorized to delete avatar for other users")

    # Get user
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if not user.avatar_url:
        raise HTTPException(status_code=404, detail="No avatar to delete")
    
    # Delete file from filesystem
    try:
        filepath = Path(f".{user.avatar_url}")
        if filepath.exists():
            filepath.unlink()
    except Exception:
        pass  # Continue even if file deletion fails
    
    # Remove avatar_url from database
    user.avatar_url = None
    db.commit()
    
    return {"message": "User avatar deleted successfully"}


@router.post("/students/{student_id}/avatar")
async def upload_student_avatar(
    student_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Upload avatar for a specific student.
    Allowed for: Admin, Coach, or the student's Guardian.
    """
    # Get student with guardians loaded
    student = db.query(Student).options(
        joinedload(Student.guardians)
    ).filter(Student.id == student_id).first()
    
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    # Check permissions
    role = current_user.role.lower() if current_user.role else ""
    is_authorized = role in ["super_admin", "admin", "coach"]
    
    if not is_authorized and role == "parent":
        # Check if guardian
        if any(g.user_id == current_user.id for g in student.guardians):
            is_authorized = True
            
    if not is_authorized:
        raise HTTPException(status_code=403, detail="Not authorized to upload avatar for this student")

    # Save file
    avatar_url = save_avatar(file, prefix=f"student_{student_id}")
    
    # Update student's avatar_url
    student.avatar_url = avatar_url
    db.commit()
    db.refresh(student)
    
    return {
        "message": "Student avatar uploaded successfully",
        "avatar_url": avatar_url
    }


@router.delete("/students/{student_id}/avatar")
async def delete_student_avatar(
    student_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Delete student's avatar.
    Admin, coach, or the student's guardian can delete student avatars.
    """
    # Get student
    student = db.query(Student).options(
        joinedload(Student.guardians)
    ).filter(Student.id == student_id).first()
    
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    # Check permissions
    role = current_user.role_normalized
    is_authorized = role in ["super_admin", "admin", "coach"]
    
    # If parent, check if they are the guardian of this specific student
    if not is_authorized and role == "parent":
        if any(g.user_id == current_user.id for g in student.guardians):
            is_authorized = True
            
    if not is_authorized:
        raise HTTPException(status_code=403, detail="Not authorized to delete avatar for this student")
    
    if not student.avatar_url:
        raise HTTPException(status_code=404, detail="No avatar to delete")
    
    # Delete file from filesystem
    try:
        filepath = Path(f".{student.avatar_url}")
        if filepath.exists():
            filepath.unlink()
    except Exception:
        pass  # Continue even if file deletion fails
    
    # Remove avatar_url from database
    student.avatar_url = None
    db.commit()
    
    return {"message": "Student avatar deleted successfully"}
