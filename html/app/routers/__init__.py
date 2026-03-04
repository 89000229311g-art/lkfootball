from .auth import router as auth_router
from .students import router as student_router
from .groups import router as group_router
from .events import router as event_router
from .attendance import router as attendance_router
from .payments import router as payment_router
from .messages import router as message_router
from .coach import router as coach_router
from .training import router as training_router
from .analytics import router as analytics_router
from .skills import router as skills_router
from .schedule_templates import router as schedule_router
from .push import router as push_router
from .birthdays import router as birthday_router

__all__ = [
    "auth_router",
    "student_router",
    "group_router",
    "event_router",
    "attendance_router",
    "payment_router",
    "message_router",
    "coach_router",
    "training_router",
    "analytics_router",
    "skills_router",
    "schedule_router",
    "push_router",
    "birthday_router"
]