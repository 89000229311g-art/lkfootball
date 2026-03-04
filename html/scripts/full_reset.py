import logging
from sqlalchemy import text
from app.core.database import SessionLocal, engine
from app.core.security import get_password_hash
from app.models import User, UserRole

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def reset_database():
    db = SessionLocal()
    try:
        logger.info("🗑️  Starting full database reset (TRUNCATE CASCADE)...")
        
        # PostgreSQL specific: Truncate all tables in the public schema
        # This preserves the schema but removes all data
        # Explicitly use 'public' schema instead of 'current_schema'
        db.execute(text("DO $$ DECLARE r RECORD; BEGIN FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP EXECUTE 'TRUNCATE TABLE public.' || quote_ident(r.tablename) || ' CASCADE'; END LOOP; END $$;"))
        db.commit()
        logger.info("✅ All tables truncated successfully.")

        # Create Owner User
        logger.info("👤 Creating Owner account...")
        owner = User(
            phone="+79777086823",  # Руководитель Sunny
            password_hash=get_password_hash("79777086823"),
            full_name="Руководитель Sunny",
            role=UserRole.SUPER_ADMIN, # Using SUPER_ADMIN as Owner role equivalent based on previous analysis
            is_active=True,
            preferred_language="ru"
        )
        db.add(owner)
        db.commit()
        db.refresh(owner)
        
        logger.info("="*50)
        logger.info("✅ DATABASE RESET COMPLETE")
        logger.info("="*50)
        logger.info(f"👤 User: {owner.full_name}")
        logger.info(f"📱 Phone: {owner.phone}")
        logger.info(f"🔑 Password: 79777086823")
        logger.info(f"🎭 Role: {owner.role}")
        logger.info("="*50)
        
    except Exception as e:
        logger.error(f"❌ Error during reset: {e}")
        db.rollback()
        raise
    finally:
        db.close()

if __name__ == "__main__":
    reset_database()
