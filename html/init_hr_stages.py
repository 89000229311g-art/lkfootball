from app.core.database import SessionLocal, engine
from app.models.hr_funnel import HRFunnelStage
from app.models.hr_candidate import HRCandidate
from app.models.marketing import MarketingCampaign
from app.models.base import Base

def init_hr_stages():
    # Create tables if they don't exist
    Base.metadata.create_all(bind=engine)
    
    db = SessionLocal()
    try:
        if db.query(HRFunnelStage).count() > 0:
            print("HR stages already initialized.")
            return

        defaults = [
            {
                "key": "new",
                "title": "Отклик / Новое резюме",
                "color": "bg-blue-500",
                "order": 0,
                "is_system": True,
            },
            {
                "key": "screening",
                "title": "Первичное интервью",
                "color": "bg-yellow-500",
                "order": 1,
                "is_system": True,
            },
            {
                "key": "trial",
                "title": "Тестовое задание / Пробная тренировка",
                "color": "bg-purple-500",
                "order": 2,
                "is_system": True,
            },
            {
                "key": "offer",
                "title": "Оффер",
                "color": "bg-indigo-500",
                "order": 3,
                "is_system": True,
            },
            {
                "key": "onboarding",
                "title": "Онбординг",
                "color": "bg-green-500",
                "order": 4,
                "is_system": True,
            },
            {
                "key": "reserve",
                "title": "Отказ / Резерв",
                "color": "bg-red-500",
                "order": 5,
                "is_system": True,
            },
        ]

        for data in defaults:
            stage = HRFunnelStage(**data)
            db.add(stage)
        
        db.commit()
        print("HR default stages initialized successfully.")
    except Exception as e:
        print(f"Error initializing HR stages: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    init_hr_stages()
