"""
Rate Limiting Module using slowapi
Protects API endpoints from abuse
"""
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from fastapi import Request
from functools import lru_cache
import os

# Try to use Redis if available, fallback to in-memory
def get_redis_url():
    return os.getenv("REDIS_URL", "redis://localhost:6379")

def create_limiter():
    """Create limiter with Redis backend if available, else memory"""
    try:
        import redis
        r = redis.from_url(get_redis_url())
        r.ping()
        print("✅ Rate limiter using Redis backend")
        return Limiter(
            key_func=get_remote_address,
            storage_uri=get_redis_url()
        )
    except Exception as e:
        print(f"⚠️ Redis not available, using memory backend: {e}")
        return Limiter(key_func=get_remote_address)

limiter = create_limiter()

# Rate limit configurations
RATE_LIMITS = {
    "default": "1000/minute",     # Увеличено для стресс-теста
    "auth": "1000/minute",        # Login attempts (было 10)
    "login": "1000/minute",       # Login (было 5)
    "credentials": "100/minute",  # Password viewing
    "password": "10/minute",      # Password operations
    "create": "100/minute",       # Create operations
    "export": "20/minute",        # Export operations
    "upload": "50/minute",        # File uploads
    "search": "200/minute",       # Search operations
    "sensitive": "20/minute",     # Sensitive data
}

def get_rate_limit(endpoint_type: str = "default") -> str:
    """Get rate limit string for endpoint type"""
    return RATE_LIMITS.get(endpoint_type, RATE_LIMITS["default"])


# Custom key functions for more granular control
def get_user_identifier(request: Request) -> str:
    """Get user identifier from JWT token or IP"""
    # Try to get user ID from request state (set by auth middleware)
    if hasattr(request.state, "user_id"):
        return f"user:{request.state.user_id}"
    
    # Fallback to IP address
    return get_remote_address(request)


def get_api_key(request: Request) -> str:
    """Get API key for external API calls"""
    api_key = request.headers.get("X-API-Key", "")
    if api_key:
        return f"api:{api_key}"
    return get_remote_address(request)
