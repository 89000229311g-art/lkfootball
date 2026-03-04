from .auth import Token, TokenData, UserLogin, UserCreate, UserResponse
from .student import (
    StudentCreate,
    StudentUpdate,
    StudentResponse,
    StudentWithGuardians,
    UserBasicInfo
)
from .group import (
    GroupCreate,
    GroupUpdate,
    GroupResponse,
    GroupWithDetails
)
from .event import (
    EventCreate,
    EventUpdate,
    EventResponse,
    EventWithDetails
)
from .attendance import (
    AttendanceCreate,
    AttendanceUpdate,
    AttendanceResponse,
    BulkAttendanceCreate,
    AttendanceStats
)
from .payment import (
    PaymentCreate,
    PaymentUpdate,
    PaymentResponse,
    StudentBalance,
    PaymentSummary
)
from .skills import (
    SkillRatingCreate,
    SkillRatingUpdate,
    SkillRatingResponse,
    SkillsHistory,
    StudentCardResponse,
    GroupOption
)

__all__ = [
    # Auth schemas
    "Token",
    "TokenData",
    "UserLogin",
    "UserCreate",
    "UserResponse",
    
    # Student schemas
    "StudentCreate",
    "StudentUpdate",
    "StudentResponse",
    "StudentWithGuardians",
    "UserBasicInfo",
    
    # Group schemas
    "GroupCreate",
    "GroupUpdate",
    "GroupResponse",
    "GroupWithDetails",
    
    # Event schemas
    "EventCreate",
    "EventUpdate",
    "EventResponse",
    "EventWithDetails",
    
    # Attendance schemas
    "AttendanceCreate",
    "AttendanceUpdate",
    "AttendanceResponse",
    "BulkAttendanceCreate",
    "AttendanceStats",
    
    # Payment schemas
    "PaymentCreate",
    "PaymentUpdate",
    "PaymentResponse",
    "StudentBalance",
    "PaymentSummary",
    
    # Skills schemas
    "SkillRatingCreate",
    "SkillRatingUpdate",
    "SkillRatingResponse",
    "SkillsHistory",
    "StudentCardResponse",
    "GroupOption"
]