"""
Structured Logging Configuration
Logs user actions, API requests, and system events
"""
import logging
import sys
import json
from typing import Any, Dict, Optional
from functools import wraps
import os

# Use Moldova timezone for timestamps
from app.core.timezone import now

# Try to use structlog if available
try:
    import structlog
    USE_STRUCTLOG = True
except ImportError:
    USE_STRUCTLOG = False
    print("⚠️ structlog not installed, using basic logging")


class JSONFormatter(logging.Formatter):
    """Custom JSON formatter for structured logging"""
    
    def format(self, record):
        log_data = {
            "timestamp": now().isoformat(),  # Moldova timezone
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        
        # Add extra fields
        if hasattr(record, "user_id"):
            log_data["user_id"] = record.user_id
        if hasattr(record, "action"):
            log_data["action"] = record.action
        if hasattr(record, "ip_address"):
            log_data["ip_address"] = record.ip_address
        if hasattr(record, "endpoint"):
            log_data["endpoint"] = record.endpoint
        if hasattr(record, "method"):
            log_data["method"] = record.method
        if hasattr(record, "status_code"):
            log_data["status_code"] = record.status_code
        if hasattr(record, "duration_ms"):
            log_data["duration_ms"] = record.duration_ms
        if hasattr(record, "extra_data"):
            log_data["data"] = record.extra_data
            
        if record.exc_info:
            log_data["exception"] = self.formatException(record.exc_info)
            
        return json.dumps(log_data)


def setup_logging(log_level: str = "INFO", json_format: bool = True):
    """Setup logging configuration"""
    
    level = getattr(logging, log_level.upper(), logging.INFO)
    
    # Root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(level)
    
    # Remove existing handlers
    for handler in root_logger.handlers[:]:
        root_logger.removeHandler(handler)
    
    # Console handler
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(level)
    
    if json_format and os.getenv("LOG_FORMAT") == "json":
        console_handler.setFormatter(JSONFormatter())
    else:
        console_handler.setFormatter(
            logging.Formatter(
                "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
                datefmt="%Y-%m-%d %H:%M:%S"
            )
        )
    
    root_logger.addHandler(console_handler)
    
    # Reduce noise from third-party libraries
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)
    
    return root_logger


# Action Logger for user actions
class ActionLogger:
    """Logger for tracking user actions in the system"""
    
    def __init__(self):
        self.logger = logging.getLogger("user_actions")
    
    def log_action(
        self,
        user_id: int,
        action: str,
        resource_type: str,
        resource_id: Optional[int] = None,
        details: Optional[Dict[str, Any]] = None,
        ip_address: Optional[str] = None
    ):
        """Log a user action"""
        extra = {
            "user_id": user_id,
            "action": action,
            "extra_data": {
                "resource_type": resource_type,
                "resource_id": resource_id,
                **(details or {})
            }
        }
        if ip_address:
            extra["ip_address"] = ip_address
            
        self.logger.info(
            f"User {user_id} performed {action} on {resource_type}",
            extra=extra
        )
    
    def log_login(self, user_id: int, ip_address: str, success: bool = True):
        """Log login attempt"""
        action = "login_success" if success else "login_failed"
        self.log_action(
            user_id=user_id,
            action=action,
            resource_type="auth",
            ip_address=ip_address
        )
    
    def log_payment(self, user_id: int, student_id: int, amount: float, ip_address: str):
        """Log payment action"""
        self.log_action(
            user_id=user_id,
            action="payment_recorded",
            resource_type="payment",
            resource_id=student_id,
            details={"amount": amount},
            ip_address=ip_address
        )
    
    def log_student_change(self, user_id: int, student_id: int, change_type: str, details: dict):
        """Log student data change"""
        self.log_action(
            user_id=user_id,
            action=f"student_{change_type}",
            resource_type="student",
            resource_id=student_id,
            details=details
        )
    
    def log_export(self, user_id: int, export_type: str, ip_address: str):
        """Log data export"""
        self.log_action(
            user_id=user_id,
            action="data_export",
            resource_type=export_type,
            ip_address=ip_address
        )


# Global action logger instance
action_logger = ActionLogger()


# Request logging middleware helper
async def log_request(request, response, duration_ms: float):
    """Log API request details"""
    logger = logging.getLogger("api_requests")
    
    user_id = getattr(request.state, "user_id", None)
    
    logger.info(
        f"{request.method} {request.url.path} - {response.status_code}",
        extra={
            "user_id": user_id,
            "method": request.method,
            "endpoint": request.url.path,
            "status_code": response.status_code,
            "duration_ms": round(duration_ms, 2),
            "ip_address": request.client.host if request.client else None
        }
    )
