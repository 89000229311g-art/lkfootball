"""
Redis Caching Module
Provides caching functionality for API responses and frequently accessed data
"""
import json
import os
from typing import Any, Optional, Callable
from functools import wraps
import hashlib
import logging

logger = logging.getLogger(__name__)

# Redis connection
_redis_client = None

def get_redis_client():
    """Get or create Redis client"""
    global _redis_client
    
    if _redis_client is not None:
        return _redis_client
    
    try:
        import redis
        redis_url = os.getenv("REDIS_URL", "redis://localhost:6379")
        _redis_client = redis.from_url(redis_url, decode_responses=True)
        _redis_client.ping()
        logger.info("✅ Redis cache connected")
        return _redis_client
    except Exception as e:
        logger.warning(f"⚠️ Redis not available: {e}. Caching disabled.")
        return None


class CacheManager:
    """Manager for caching operations"""
    
    # Cache TTL settings (in seconds)
    TTL = {
        "short": 60,          # 1 minute
        "medium": 300,        # 5 minutes
        "long": 3600,         # 1 hour
        "day": 86400,         # 24 hours
        "analytics": 600,     # 10 minutes for analytics
        "groups": 1800,       # 30 minutes for group data
        "students": 300,      # 5 minutes for student lists
    }
    
    # Global prefix to avoid collisions in shared Redis
    PREFIX = "academy:"

    def __init__(self):
        self.redis = get_redis_client()
        self.enabled = self.redis is not None
    
    def _make_key(self, prefix: str, *args) -> str:
        """Create a cache key from prefix and arguments"""
        # Ensure the global prefix is applied
        if not prefix.startswith(self.PREFIX):
            prefix = f"{self.PREFIX}{prefix}"
            
        key_parts = [prefix] + [str(arg) for arg in args]
        return ":".join(key_parts)
    
    def get(self, key: str) -> Optional[Any]:
        """Get value from cache"""
        if not self.enabled:
            return None
        
        try:
            # Check if key already has prefix (e.g. manually constructed)
            # But get() is usually called with a full key.
            # If get() is called with a raw key "dashboard:stats", we need to ensure it has prefix.
            # However, _make_key is a helper. 
            # Ideally get/set should take "raw" keys and apply prefix internally.
            # BUT current implementation seems to expect 'key' to be the full key.
            # Let's check usages. 
            # get_dashboard_stats calls get("dashboard:stats").
            # So we should apply prefix in get/set/delete.
            
            real_key = key if key.startswith(self.PREFIX) else f"{self.PREFIX}{key}"
            
            value = self.redis.get(real_key)
            if value:
                return json.loads(value)
            return None
        except Exception as e:
            logger.error(f"Cache get error: {e}")
            return None
    
    def set(self, key: str, value: Any, ttl: int = 300) -> bool:
        """Set value in cache with TTL"""
        if not self.enabled:
            return False
        
        try:
            real_key = key if key.startswith(self.PREFIX) else f"{self.PREFIX}{key}"
            self.redis.setex(real_key, ttl, json.dumps(value, default=str))
            return True
        except Exception as e:
            logger.error(f"Cache set error: {e}")
            return False
    
    def delete(self, key: str) -> bool:
        """Delete key from cache"""
        if not self.enabled:
            return False
        
        try:
            real_key = key if key.startswith(self.PREFIX) else f"{self.PREFIX}{key}"
            self.redis.delete(real_key)
            return True
        except Exception as e:
            logger.error(f"Cache delete error: {e}")
            return False
    
    def delete_pattern(self, pattern: str) -> int:
        """Delete all keys matching pattern"""
        if not self.enabled:
            return 0
        
        try:
            real_pattern = pattern if pattern.startswith(self.PREFIX) else f"{self.PREFIX}{pattern}"
            keys = self.redis.keys(real_pattern)
            if keys:
                return self.redis.delete(*keys)
            return 0
        except Exception as e:
            logger.error(f"Cache delete pattern error: {e}")
            return 0
            
    def clear_all(self) -> int:
        """Clear ONLY application cache (keys starting with prefix)"""
        if not self.enabled:
            return 0
        logger.info(f"🧹 Clearing application cache (prefix: {self.PREFIX}*)")
        return self.delete_pattern("*")
    
    def invalidate_student(self, student_id: int):
        """Invalidate all cache related to a student"""
        self.delete_pattern(f"student:{student_id}:*")
        self.delete_pattern("students:*")  # Student lists
    
    def invalidate_group(self, group_id: int):
        """Invalidate all cache related to a group"""
        self.delete_pattern(f"group:{group_id}:*")
        self.delete_pattern("groups:*")
    
    def invalidate_analytics(self):
        """Invalidate analytics cache"""
        self.delete_pattern("analytics:*")
    
    # Specific cache methods
    def get_dashboard_stats(self) -> Optional[dict]:
        """Get cached dashboard stats"""
        return self.get("dashboard:stats")
    
    def set_dashboard_stats(self, stats: dict):
        """Cache dashboard stats"""
        self.set("dashboard:stats", stats, self.TTL["analytics"])
    
    def get_group_list(self) -> Optional[list]:
        """Get cached group list"""
        return self.get("groups:list")
    
    def set_group_list(self, groups: list):
        """Cache group list"""
        self.set("groups:list", groups, self.TTL["groups"])


# Global cache manager
cache_manager = CacheManager()


# Decorator for caching function results
def cached(key_prefix: str, ttl: int = 300):
    """Decorator to cache function results"""
    def decorator(func: Callable):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            if not cache_manager.enabled:
                return await func(*args, **kwargs)
            
            # Create cache key from function name and arguments
            key_parts = [key_prefix, func.__name__]
            key_parts.extend(str(arg) for arg in args)
            key_parts.extend(f"{k}={v}" for k, v in sorted(kwargs.items()))
            cache_key = ":".join(key_parts)
            
            # Try to get from cache
            cached_value = cache_manager.get(cache_key)
            if cached_value is not None:
                logger.debug(f"Cache hit: {cache_key}")
                return cached_value
            
            # Execute function and cache result
            result = await func(*args, **kwargs)
            cache_manager.set(cache_key, result, ttl)
            logger.debug(f"Cache set: {cache_key}")
            return result
        
        return wrapper
    return decorator


# Sync version of cached decorator
def cached_sync(key_prefix: str, ttl: int = 300):
    """Decorator to cache sync function results"""
    def decorator(func: Callable):
        @wraps(func)
        def wrapper(*args, **kwargs):
            if not cache_manager.enabled:
                return func(*args, **kwargs)
            
            key_parts = [key_prefix, func.__name__]
            key_parts.extend(str(arg) for arg in args)
            key_parts.extend(f"{k}={v}" for k, v in sorted(kwargs.items()))
            cache_key = ":".join(key_parts)
            
            cached_value = cache_manager.get(cache_key)
            if cached_value is not None:
                return cached_value
            
            result = func(*args, **kwargs)
            cache_manager.set(cache_key, result, ttl)
            return result
        
        return wrapper
    return decorator
