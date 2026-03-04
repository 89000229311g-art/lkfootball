from fastapi import APIRouter, Request, HTTPException, Body
from pydantic import BaseModel
from typing import Optional, Any, Dict
import logging
import json

router = APIRouter()

# Get the logger configured in main.py (or configure it if missing)
logger = logging.getLogger("frontend_errors")

class FrontendErrorLog(BaseModel):
    message: str
    context: Optional[str] = None
    details: Optional[Any] = None
    url: Optional[str] = None
    user_agent: Optional[str] = None
    timestamp: Optional[str] = None

@router.post("/frontend")
async def log_frontend_error(
    error: FrontendErrorLog, 
    request: Request
):
    """
    Log frontend errors to a dedicated log file.
    This endpoint is called by the frontend when an error occurs or a diagnostic issue is detected.
    """
    try:
        # Enrich log with request info
        client_host = request.client.host if request.client else "unknown"
        user_agent = request.headers.get("user-agent", "unknown")
        
        # Construct log message
        log_entry = {
            "source": "frontend",
            "ip": client_host,
            "message": error.message,
            "context": error.context,
            "details": error.details,
            "url": error.url,
            "user_agent": error.user_agent or user_agent,
            "timestamp": error.timestamp
        }
        
        # Log as error
        logger.error(json.dumps(log_entry, ensure_ascii=False))
        
        return {"status": "logged", "message": "Error logged successfully"}
    except Exception as e:
        # Fallback logging
        print(f"Failed to log frontend error: {e}")
        return {"status": "error", "detail": str(e)}
