import sqlite3

db_path = "/Users/macbook/Desktop/football-academy-system 2/football_academy.db"

try:
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # Check if column exists
    cursor.execute("PRAGMA table_info(groups)")
    columns = [info[1] for info in cursor.fetchall()]
    
    if "age_group" not in columns:
        print("Adding age_group column to groups table...")
        cursor.execute("ALTER TABLE groups ADD COLUMN age_group VARCHAR")
        conn.commit()
        print("Column added successfully.")
    else:
        print("Column age_group already exists.")
        
    conn.close()
except Exception as e:
    print(f"Error: {e}")
