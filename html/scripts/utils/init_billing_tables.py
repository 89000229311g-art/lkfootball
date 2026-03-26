import sys
import os

# Add project root to path
sys.path.append(os.getcwd())

from app.core.database import engine
from app.models.base import Base
from app.models import invoice_item

def create_tables():
    print("Creating database tables if they don't exist...")
    try:
        Base.metadata.create_all(bind=engine)
        print("Tables created successfully.")
    except Exception as e:
        print(f"Error creating tables: {e}")

if __name__ == "__main__":
    create_tables()
