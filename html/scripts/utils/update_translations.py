from app.core.database import SessionLocal
from app.models.physical_test import PhysicalTest

def update_translations():
    db = SessionLocal()
    try:
        # Map English names to Russian names
        translations = {
            "30m Sprint": "Бег 30м с места",
            "10m Sprint": "Бег 10м (стартовая скорость)",
            "5-10-5 Agility": "Челночный бег 5-10-5",
            "Illinois Agility": "Тест Иллинойс",
            "Vertical Jump": "Прыжок в высоту с места",
            "Broad Jump": "Прыжок в длину с места",
            "Yo-Yo Test": "Йо-Йо тест",
            "Cooper Test": "Тест Купера (12 мин)",
            "Push-ups (1 min)": "Отжимания за 1 мин",
            "Plank": "Планка (секунды)",
            "Juggling": "Жонглирование мячом"
        }

        count = 0
        for eng_name, rus_name in translations.items():
            test = db.query(PhysicalTest).filter(PhysicalTest.name == eng_name).first()
            if test:
                print(f"Updating '{eng_name}' to '{rus_name}'...")
                test.name = rus_name
                test.description = rus_name  # Update description too if it matches
                count += 1
            else:
                print(f"Test '{eng_name}' not found.")
        
        db.commit()
        print(f"Updated {count} tests.")
    except Exception as e:
        print(f"Error: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    update_translations()
