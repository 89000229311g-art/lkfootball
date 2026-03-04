#!/bin/bash
# Production launch script with optimizations
# 
# Usage: ./run_production.sh [workers]
# Default: 4 workers

WORKERS=${1:-4}
HOST="0.0.0.0"
PORT=8000

echo "=============================================="
echo "🚀 Football Academy - Production Mode"
echo "=============================================="
echo ""
echo "📊 Configuration:"
echo "   • Workers: $WORKERS"
echo "   • Host: $HOST:$PORT"
echo "   • Redis: ${REDIS_URL:-redis://localhost:6379}"
echo ""

# Check Redis
echo "🔍 Checking Redis..."
if command -v redis-cli &> /dev/null; then
    if redis-cli ping &> /dev/null; then
        echo "   ✅ Redis is running"
    else
        echo "   ⚠️  Redis not running. Starting..."
        redis-server --daemonize yes 2>/dev/null || echo "   ⚠️  Could not start Redis (install: brew install redis)"
    fi
else
    echo "   ⚠️  Redis CLI not found. Install: brew install redis"
fi

echo ""
echo "🚀 Starting uvicorn with $WORKERS workers..."
echo ""

# Run with multiple workers using gunicorn (production)
if command -v gunicorn &> /dev/null; then
    echo "Using gunicorn + uvicorn workers"
    gunicorn app.main:app \
        --workers $WORKERS \
        --worker-class uvicorn.workers.UvicornWorker \
        --bind $HOST:$PORT \
        --access-logfile - \
        --error-logfile - \
        --timeout 120 \
        --keep-alive 5
else
    # Fallback to uvicorn (development)
    echo "Using uvicorn (install gunicorn for production: pip install gunicorn)"
    uvicorn app.main:app \
        --host $HOST \
        --port $PORT \
        --workers $WORKERS \
        --loop uvloop \
        --http httptools
fi
