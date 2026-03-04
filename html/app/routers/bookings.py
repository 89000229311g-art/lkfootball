"""
Booking router for individual training sessions.

Provides CRUD operations for booking individual trainings.
"""
from typing import Any, List, Optional
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func

from app.core.deps import get_db, get_current_user
from app.core.timezone import now_naive
from app.models import User, Student, Booking, BookingStatus
from app.models.student_guardian import StudentGuardian
from app.schemas.booking import (
    BookingCreate,
    BookingUpdate,
    BookingAdminUpdate,
    BookingResponse,
    BookingListResponse,
    BookingStatusUpdate,
    BookingConfirm,
    BookingStatusEnum
)

router = APIRouter()


def get_user_students(db: Session, user: User) -> List[int]:
    """Get list of student IDs associated with a parent user."""
    guardians = db.query(StudentGuardian).filter(
        StudentGuardian.user_id == user.id
    ).all()
    return [g.student_id for g in guardians]


def check_student_access(db: Session, user: User, student_id: int) -> bool:
    """Check if user has access to the student (is guardian or admin)."""
    user_role = user.role.lower() if user.role else ""
    
    # Admins have access to all students
    if user_role in ["super_admin", "admin"]:
        return True
    
    # Check if user is guardian of this student
    guardian = db.query(StudentGuardian).filter(
        StudentGuardian.user_id == user.id,
        StudentGuardian.student_id == student_id
    ).first()
    
    return guardian is not None


# ==================== CRUD OPERATIONS ====================

@router.post("", response_model=BookingResponse, status_code=status.HTTP_201_CREATED)
async def create_booking(
    booking_in: BookingCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Any:
    """
    Create a new booking for individual training.
    
    Access:
    - Parents: can book for their own children
    - Admins: can book for any student
    """
    # Check student exists
    student = db.query(Student).filter(Student.id == booking_in.student_id).first()
    if not student:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Student not found"
        )
    
    # Check access
    if not check_student_access(db, current_user, booking_in.student_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have access to this student"
        )
    
    # Check coach exists if provided
    if booking_in.coach_id:
        coach = db.query(User).filter(
            User.id == booking_in.coach_id,
            User.role == "coach"
        ).first()
        if not coach:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Coach not found"
            )
    
    # Create booking
    booking = Booking(
        parent_user_id=current_user.id,
        student_id=booking_in.student_id,
        coach_id=booking_in.coach_id,
        booking_date=booking_in.booking_date,
        duration_minutes=booking_in.duration_minutes,
        location=booking_in.location,
        parent_notes=booking_in.parent_notes,
        status=BookingStatus.PENDING,
        created_at=datetime.now(timezone.utc)
    )
    
    db.add(booking)
    db.commit()
    db.refresh(booking)
    
    # Load relationships
    booking = db.query(Booking).options(
        joinedload(Booking.parent_user),
        joinedload(Booking.student),
        joinedload(Booking.coach)
    ).filter(Booking.id == booking.id).first()
    
    return booking


@router.get("", response_model=BookingListResponse)
async def get_bookings(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    status: Optional[str] = Query(None, description="Filter by status"),
    student_id: Optional[int] = Query(None, description="Filter by student"),
    coach_id: Optional[int] = Query(None, description="Filter by coach"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Any:
    """
    Get list of bookings.
    
    Access:
    - Parents: see only their own bookings
    - Coaches: see bookings assigned to them
    - Admins: see all bookings
    """
    user_role = current_user.role.lower() if current_user.role else ""
    
    query = db.query(Booking).options(
        joinedload(Booking.parent_user),
        joinedload(Booking.student),
        joinedload(Booking.coach)
    )
    
    # Filter by role
    if user_role == "parent":
        query = query.filter(Booking.parent_user_id == current_user.id)
    elif user_role == "coach":
        query = query.filter(Booking.coach_id == current_user.id)
    # Admins see all
    
    # Apply filters
    if status:
        query = query.filter(Booking.status == status)
    if student_id:
        query = query.filter(Booking.student_id == student_id)
    if coach_id:
        query = query.filter(Booking.coach_id == coach_id)
    
    # Count total
    total = query.count()
    
    # Paginate
    bookings = query.order_by(Booking.booking_date.desc()).offset(skip).limit(limit).all()
    
    pages = (total + limit - 1) // limit if limit > 0 else 0
    
    return {
        "data": bookings,
        "total": total,
        "skip": skip,
        "limit": limit,
        "pages": pages
    }


@router.get("/my", response_model=List[BookingResponse])
async def get_my_bookings(
    status: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Any:
    """
    Get current user's bookings.
    
    - Parents: bookings they created
    - Coaches: bookings assigned to them
    """
    user_role = current_user.role.lower() if current_user.role else ""
    
    query = db.query(Booking).options(
        joinedload(Booking.parent_user),
        joinedload(Booking.student),
        joinedload(Booking.coach)
    )
    
    if user_role == "coach":
        query = query.filter(Booking.coach_id == current_user.id)
    else:
        query = query.filter(Booking.parent_user_id == current_user.id)
    
    if status:
        query = query.filter(Booking.status == status)
    
    return query.order_by(Booking.booking_date.desc()).all()


@router.get("/{booking_id}", response_model=BookingResponse)
async def get_booking(
    booking_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Any:
    """Get booking details."""
    booking = db.query(Booking).options(
        joinedload(Booking.parent_user),
        joinedload(Booking.student),
        joinedload(Booking.coach)
    ).filter(Booking.id == booking_id).first()
    
    if not booking:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Booking not found"
        )
    
    # Check access
    user_role = current_user.role.lower() if current_user.role else ""
    if user_role not in ["super_admin", "admin"]:
        if booking.parent_user_id != current_user.id and booking.coach_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied"
            )
    
    return booking


@router.put("/{booking_id}", response_model=BookingResponse)
async def update_booking(
    booking_id: int,
    booking_in: BookingUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Any:
    """
    Update booking.
    
    - Parents: can update their pending bookings
    - Admins: can update any booking
    """
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    
    if not booking:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Booking not found"
        )
    
    user_role = current_user.role.lower() if current_user.role else ""
    
    # Check access
    if user_role not in ["super_admin", "admin"]:
        if booking.parent_user_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only update your own bookings"
            )
        # Parents can only update pending bookings
        if booking.status != BookingStatus.PENDING:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Can only update pending bookings"
            )
    
    # Apply updates
    update_data = booking_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        if field == "is_paid" and value is not None:
            setattr(booking, field, 1 if value else 0)
        elif field == "status" and value is not None:
            setattr(booking, field, BookingStatus(value))
        else:
            setattr(booking, field, value)
    
    booking.updated_at = now_naive()
    db.commit()
    
    # Reload with relationships
    booking = db.query(Booking).options(
        joinedload(Booking.parent_user),
        joinedload(Booking.student),
        joinedload(Booking.coach)
    ).filter(Booking.id == booking_id).first()
    
    return booking


@router.put("/{booking_id}/confirm", response_model=BookingResponse)
async def confirm_booking(
    booking_id: int,
    confirm_data: BookingConfirm,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Any:
    """
    Confirm a pending booking (admin only).
    
    Assigns coach, sets price, and changes status to confirmed.
    """
    user_role = current_user.role.lower() if current_user.role else ""
    if user_role not in ["super_admin", "admin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins can confirm bookings"
        )
    
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    
    if not booking:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Booking not found"
        )
    
    if booking.status != BookingStatus.PENDING:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Can only confirm pending bookings"
        )
    
    # Verify coach
    coach = db.query(User).filter(
        User.id == confirm_data.coach_id,
        User.role == "coach"
    ).first()
    if not coach:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Coach not found"
        )
    
    # Update booking
    booking.coach_id = confirm_data.coach_id
    booking.price = confirm_data.price
    booking.status = BookingStatus.CONFIRMED
    if confirm_data.location:
        booking.location = confirm_data.location
    if confirm_data.admin_notes:
        booking.admin_notes = confirm_data.admin_notes
    booking.updated_at = datetime.now(timezone.utc)
    
    db.commit()
    
    # Reload
    booking = db.query(Booking).options(
        joinedload(Booking.parent_user),
        joinedload(Booking.student),
        joinedload(Booking.coach)
    ).filter(Booking.id == booking_id).first()
    
    return booking


@router.put("/{booking_id}/cancel", response_model=BookingResponse)
async def cancel_booking(
    booking_id: int,
    reason: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Any:
    """
    Cancel a booking.
    
    - Parents: can cancel their own pending/confirmed bookings
    - Admins: can cancel any booking
    """
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    
    if not booking:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Booking not found"
        )
    
    user_role = current_user.role.lower() if current_user.role else ""
    
    # Check access
    if user_role not in ["super_admin", "admin"]:
        if booking.parent_user_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only cancel your own bookings"
            )
    
    # Can't cancel completed bookings
    if booking.status == BookingStatus.COMPLETED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot cancel completed bookings"
        )
    
    booking.status = BookingStatus.CANCELLED
    if reason:
        booking.admin_notes = f"Cancelled: {reason}"
    booking.updated_at = datetime.now(timezone.utc)
    
    db.commit()
    
    # Reload
    booking = db.query(Booking).options(
        joinedload(Booking.parent_user),
        joinedload(Booking.student),
        joinedload(Booking.coach)
    ).filter(Booking.id == booking_id).first()
    
    return booking


@router.put("/{booking_id}/complete", response_model=BookingResponse)
async def complete_booking(
    booking_id: int,
    notes: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Any:
    """
    Mark booking as completed (admin/coach only).
    """
    user_role = current_user.role.lower() if current_user.role else ""
    
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    
    if not booking:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Booking not found"
        )
    
    # Check access - admin or assigned coach
    if user_role not in ["super_admin", "admin"]:
        if user_role == "coach" and booking.coach_id == current_user.id:
            pass  # Coach can complete their own bookings
        else:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only admins or assigned coach can complete bookings"
            )
    
    if booking.status != BookingStatus.CONFIRMED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Can only complete confirmed bookings"
        )
    
    booking.status = BookingStatus.COMPLETED
    if notes:
        booking.notes = notes
    booking.updated_at = datetime.now(timezone.utc)
    
    db.commit()
    
    # Reload
    booking = db.query(Booking).options(
        joinedload(Booking.parent_user),
        joinedload(Booking.student),
        joinedload(Booking.coach)
    ).filter(Booking.id == booking_id).first()
    
    return booking


@router.delete("/{booking_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_booking(
    booking_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> None:
    """
    Delete a booking (admin only, or parent if pending).
    """
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    
    if not booking:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Booking not found"
        )
    
    user_role = current_user.role.lower() if current_user.role else ""
    
    # Check access
    if user_role not in ["super_admin", "admin"]:
        if booking.parent_user_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied"
            )
        if booking.status != BookingStatus.PENDING:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Can only delete pending bookings"
            )
    
    db.delete(booking)
    db.commit()


# ==================== COACH SCHEDULE ====================

@router.get("/coach/{coach_id}/schedule", response_model=List[BookingResponse])
async def get_coach_schedule(
    coach_id: int,
    from_date: Optional[datetime] = None,
    to_date: Optional[datetime] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Any:
    """
    Get coach's booking schedule.
    
    Access: Admin or the coach themselves.
    """
    user_role = current_user.role.lower() if current_user.role else ""
    
    # Check access
    if user_role not in ["super_admin", "admin"]:
        if current_user.id != coach_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only view your own schedule"
            )
    
    query = db.query(Booking).options(
        joinedload(Booking.parent_user),
        joinedload(Booking.student),
        joinedload(Booking.coach)
    ).filter(
        Booking.coach_id == coach_id,
        Booking.status.in_([BookingStatus.CONFIRMED, BookingStatus.COMPLETED])
    )
    
    if from_date:
        query = query.filter(Booking.booking_date >= from_date)
    if to_date:
        query = query.filter(Booking.booking_date <= to_date)
    
    return query.order_by(Booking.booking_date).all()
