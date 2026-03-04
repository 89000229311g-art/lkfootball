"""
Sunny Football Academy - Main Application
With security features: Rate Limiting, CORS, Logging
"""
from fastapi import FastAPI, Request, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware
from slowapi.errors import RateLimitExceeded
from slowapi import _rate_limit_exceeded_handler
import os
import time
import logging

from app.core.config import settings
from app.core.logging_config import setup_logging, action_logger
from app.core.rate_limiter import limiter
from app.core.cache import cache_manager

from app.routers import (
    auth_router, student_router, group_router, event_router, 
    attendance_router, payment_router, message_router, coach_router, 
    training_router, analytics_router, skills_router, physical_tests,
    push_router, polls, ai, billing as billing_router, leads as leads_router,
    birthday_router,
)
from app.routers import funnel as funnel_router
from app.routers import hr_funnel as hr_funnel_router
from app.routers import hr_candidates as hr_candidates_router
from app.routers import marketing as marketing_router
from app.routers import tasks as tasks_router
from app.routers import upload
from app.routers import posts as posts_router
from app.routers import admin_improvements, parent_improvements
from app.routers import schedule_templates as schedule_router
from app.routers import bookings as bookings_router
from app.routers import salaries as salaries_router
from app.routers import expenses as expenses_router
from app.routers import history as history_router
from app.routers import settings as settings_router
from app.routers import stats as stats_router
from app.routers import logs as logs_router
from app.core.cleanup import cleanup_old_data
from app.core.database import SessionLocal
from contextlib import asynccontextmanager
import asyncio

# Setup logging
setup_logging(log_level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger(__name__)
frontend_logger = logging.getLogger("frontend_errors")
log_dir = os.path.join(os.getcwd(), "logs")
os.makedirs(log_dir, exist_ok=True)
frontend_log_path = os.path.join(log_dir, "frontend_errors.log")
if not any(
    isinstance(handler, logging.FileHandler)
    and getattr(handler, "baseFilename", None) == frontend_log_path
    for handler in frontend_logger.handlers
):
    file_handler = logging.FileHandler(frontend_log_path)
    file_handler.setLevel(logging.INFO)
    file_handler.setFormatter(
        logging.Formatter(
            "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        )
    )
    frontend_logger.addHandler(file_handler)

# Background Cleanup Task
async def run_periodic_cleanup():
    """Run cleanup every 24 hours"""
    while True:
        try:
            logger.info("⏳ Running scheduled maintenance...")
            db = SessionLocal()
            try:
                cleanup_old_data(db)
            finally:
                db.close()
        except Exception as e:
            logger.error(f"Maintenance task failed: {e}")
        
        # Sleep for 24 hours
        await asyncio.sleep(24 * 3600)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("🚀 Starting Sunny Football Academy API...")
    
    # Run cleanup immediately on startup
    try:
        db = SessionLocal()
        cleanup_old_data(db)
        db.close()
    except Exception as e:
        logger.error(f"Startup cleanup failed: {e}")
    
    # Start periodic task
    asyncio.create_task(run_periodic_cleanup())
    
    yield
    
    # Shutdown
    logger.info("🛑 Shutting down...")

# Create FastAPI app
app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan
)

# Add rate limiter to app state
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


# ==================== MIDDLEWARE ====================

# Request timing middleware
class RequestTimingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        start_time = time.time()
        response = await call_next(request)
        duration = (time.time() - start_time) * 1000  # milliseconds
        response.headers["X-Response-Time"] = f"{duration:.2f}ms"
        
        # Log request (skip health checks and static files)
        if not request.url.path.startswith(("/health", "/static", "/uploads")):
            logger.info(
                f"{request.method} {request.url.path} - {response.status_code} ({duration:.2f}ms)"
            )
        
        return response

app.add_middleware(RequestTimingMiddleware)

# CORS Configuration
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "*").split(",")

if os.getenv("ENVIRONMENT") == "production":
    # Production: restrict CORS to specific domains
    cors_origins = [
        "https://your-domain.com",
        "https://app.your-domain.com",
        "https://admin.your-domain.com",
    ]
    # Override with env variable if set
    if ALLOWED_ORIGINS != ["*"]:
        cors_origins = ALLOWED_ORIGINS
else:
    # Development: allow all origins
    cors_origins = ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Response-Time", "X-RateLimit-Limit", "X-RateLimit-Remaining"],
)

# ==================== STATIC FILES ====================

# Custom StaticFiles to add Cache-Control headers
class CachedStaticFiles(StaticFiles):
    def is_not_modified(self, response_headers, request_headers) -> bool:
        return super().is_not_modified(response_headers, request_headers)

    async def get_response(self, path: str, scope):
        response = await super().get_response(path, scope)
        # Add Cache-Control for 7 days (604800 seconds)
        response.headers["Cache-Control"] = "public, max-age=604800"
        return response

# Create uploads directory and mount static files
uploads_dir = "uploads"
os.makedirs(uploads_dir, exist_ok=True)
os.makedirs(os.path.join(uploads_dir, "avatars"), exist_ok=True)
os.makedirs(os.path.join(uploads_dir, "events"), exist_ok=True)
os.makedirs(os.path.join(uploads_dir, "freeze_documents"), exist_ok=True)
os.makedirs(os.path.join(uploads_dir, "achievements"), exist_ok=True)
os.makedirs(os.path.join(uploads_dir, "student_photos"), exist_ok=True)
os.makedirs(os.path.join(uploads_dir, "medical_docs"), exist_ok=True)
app.mount("/uploads", CachedStaticFiles(directory=uploads_dir), name="uploads")

# Static directory for avatars
static_dir = "static"
os.makedirs(static_dir, exist_ok=True)
os.makedirs(os.path.join(static_dir, "avatars"), exist_ok=True)
app.mount("/static", CachedStaticFiles(directory=static_dir), name="static")


# ==================== ROUTERS ====================

# Core routers
app.include_router(auth_router, prefix=f"{settings.API_V1_STR}/auth", tags=["auth"])
app.include_router(student_router, prefix=f"{settings.API_V1_STR}/students", tags=["students"])
app.include_router(billing_router.router, prefix=f"{settings.API_V1_STR}", tags=["billing"])
app.include_router(leads_router.router, prefix=f"{settings.API_V1_STR}/leads", tags=["CRM"])
app.include_router(funnel_router.router, prefix=f"{settings.API_V1_STR}", tags=["CRM Settings"])
app.include_router(group_router, prefix=f"{settings.API_V1_STR}/groups", tags=["groups"])
app.include_router(event_router, prefix=f"{settings.API_V1_STR}/events", tags=["events"])
app.include_router(attendance_router, prefix=f"{settings.API_V1_STR}/attendance", tags=["attendance"])
app.include_router(payment_router, prefix=f"{settings.API_V1_STR}/payments", tags=["payments"])
app.include_router(message_router, prefix=f"{settings.API_V1_STR}/messages", tags=["messages"])
app.include_router(coach_router, prefix=f"{settings.API_V1_STR}/coach", tags=["coach"])
app.include_router(training_router, prefix=f"{settings.API_V1_STR}/training", tags=["training"])
app.include_router(analytics_router, prefix=f"{settings.API_V1_STR}/analytics", tags=["analytics"])
app.include_router(skills_router, prefix=f"{settings.API_V1_STR}", tags=["skills"])
app.include_router(physical_tests.router, prefix=f"{settings.API_V1_STR}/physical-tests", tags=["physical-tests"])
app.include_router(upload.router, prefix=f"{settings.API_V1_STR}", tags=["upload"])
app.include_router(posts_router.router, prefix=f"{settings.API_V1_STR}", tags=["posts"])
app.include_router(polls.router, prefix=f"{settings.API_V1_STR}/polls", tags=["polls"])
app.include_router(ai.router, prefix=f"{settings.API_V1_STR}/ai", tags=["ai"])
app.include_router(push_router, prefix=f"{settings.API_V1_STR}", tags=["push"])
app.include_router(birthday_router, prefix=f"{settings.API_V1_STR}/birthdays", tags=["birthdays"])

# Improvement routers
app.include_router(admin_improvements.router, prefix=f"{settings.API_V1_STR}/admin", tags=["admin-improvements"])
app.include_router(parent_improvements.router, prefix=f"{settings.API_V1_STR}/parent", tags=["parent-improvements"])

# Schedule templates router
app.include_router(schedule_router.router, prefix=f"{settings.API_V1_STR}/schedule", tags=["schedule-templates"])

# Bookings router (individual trainings)
app.include_router(bookings_router.router, prefix=f"{settings.API_V1_STR}/bookings", tags=["bookings"])

# Salaries router (employee payments)
app.include_router(salaries_router.router, prefix=f"{settings.API_V1_STR}/salaries", tags=["salaries"])

# Expenses router
app.include_router(expenses_router.router, prefix=f"{settings.API_V1_STR}/expenses", tags=["expenses"])

# History and Trash router (undo system)
app.include_router(history_router.router, prefix=f"{settings.API_V1_STR}", tags=["history"])
app.include_router(history_router.trash_router, prefix=f"{settings.API_V1_STR}", tags=["trash"])
app.include_router(settings_router.router, prefix=f"{settings.API_V1_STR}/settings", tags=["settings"])
app.include_router(stats_router.router, prefix=f"{settings.API_V1_STR}/stats", tags=["stats"])
app.include_router(logs_router.router, prefix=f"{settings.API_V1_STR}/logs", tags=["logs"])
app.include_router(hr_funnel_router.router, prefix=f"{settings.API_V1_STR}", tags=["hr-funnel"])
app.include_router(hr_candidates_router.router, prefix=f"{settings.API_V1_STR}", tags=["hr-candidates"])
app.include_router(marketing_router.router, prefix=f"{settings.API_V1_STR}", tags=["marketing"])
app.include_router(tasks_router.router, prefix=f"{settings.API_V1_STR}/tasks", tags=["tasks"])


# ==================== HEALTH & STATUS ENDPOINTS ====================

@app.get("/")
async def root():
    return {
        "message": "Welcome to Sunny Football Academy",
        "docs_url": "/docs",
        "version": settings.VERSION
    }


@app.get("/health")
@app.get("/api/v1/health")
async def health_check():
    """
    Health check endpoint for load balancers and monitoring.
    Checks database and cache connectivity.
    """
    from app.core.database import SessionLocal
    
    health_status = {
        "status": "healthy",
        "version": settings.VERSION,
        "checks": {}
    }
    
    # Check database
    try:
        db = SessionLocal()
        from sqlalchemy import text
        db.execute(text("SELECT 1"))
        db.close()
        health_status["checks"]["database"] = "ok"
    except Exception as e:
        health_status["checks"]["database"] = f"error: {str(e)}"
        health_status["status"] = "unhealthy"
    
    # Check cache (Redis)
    try:
        if cache_manager.enabled:
            cache_manager.redis.ping()
            health_status["checks"]["cache"] = "ok"
        else:
            health_status["checks"]["cache"] = "disabled"
    except Exception as e:
        health_status["checks"]["cache"] = f"error: {str(e)}"
    
    return health_status


@app.get("/health/ready")
async def readiness_check():
    """Readiness check - returns 200 only if app is ready to serve traffic"""
    from app.core.database import SessionLocal
    
    try:
        db = SessionLocal()
        from sqlalchemy import text
        db.execute(text("SELECT 1"))
        db.close()
        return {"status": "ready"}
    except Exception:
        from fastapi import HTTPException
        raise HTTPException(status_code=503, detail="Database not ready")


@app.get("/health/live")
async def liveness_check():
    """Liveness check - returns 200 if app is running"""
    return {"status": "alive"}


@app.post(f"{settings.API_V1_STR}/logs/frontend")
async def log_frontend_error(payload: dict = Body(...), request: Request = None):
    message = payload.get("message") or "Frontend error"
    context = payload.get("context")
    details = payload.get("details")
    parts = [str(message)]
    if context:
        parts.append(f"[{context}]")
    extra = {
        "ip_address": request.client.host if request and request.client else None,
        "user_agent": request.headers.get("user-agent") if request else None,
        "extra_data": details,
    }
    frontend_logger.error(" ".join(parts), extra=extra)
    return {"status": "ok"}


# ==================== STARTUP & SHUTDOWN ====================

# NOTE: startup/shutdown logic is handled by the lifespan context manager above.
