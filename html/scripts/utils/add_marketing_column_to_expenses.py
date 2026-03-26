from app.core.database import engine
from sqlalchemy import text

def add_column():
    with engine.connect() as conn:
        try:
            conn.execute(text("ALTER TABLE expenses ADD COLUMN marketing_campaign_id INTEGER REFERENCES marketing_campaigns(id) ON DELETE SET NULL"))
            conn.commit()
            print("Column added successfully")
        except Exception as e:
            print(f"Error (column might already exist): {e}")

if __name__ == "__main__":
    add_column()