# Python base image
FROM python:3.11-slim

# Set work directory
WORKDIR /app

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Expose port
EXPOSE 8000

# Create entrypoint script
RUN echo '#!/bin/bash\n\
set -e\n\
\n\
# Wait for PostgreSQL to be ready\n\
echo "Waiting for PostgreSQL..."\n\
while ! nc -z $POSTGRES_SERVER 5432; do\n\
  sleep 1\n\
done\n\
echo "PostgreSQL is ready!"\n\
\n\
# Run migrations\n\
alembic upgrade head\n\
\n\
# Create initial data\n\
python -m app.initial_data\n\
\n\
# Start server\n\
exec uvicorn app.main:app --host 0.0.0.0 --port 8000\n\
' > /entrypoint.sh && chmod +x /entrypoint.sh

# Install netcat for health check
RUN apt-get update && apt-get install -y netcat-openbsd && rm -rf /var/lib/apt/lists/*

# Run entrypoint
CMD ["/entrypoint.sh"]
