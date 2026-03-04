#!/usr/bin/env python3
"""
Check user credentials in the database
"""

import sqlite3
import os

# Find the database file
db_path = "./football_academy.db"

print(f"📁 Using database: {db_path}")

try:
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # Check users table structure
    cursor.execute("PRAGMA table_info(users)")
    columns = cursor.fetchall()
    print(f"\n📋 Users table columns:")
    for col in columns:
        print(f"  {col[1]} ({col[2]})")
    
    # Check if there's a password_hash column
    password_col = next((col for col in columns if 'password' in col[1].lower()), None)
    
    if password_col:
        print(f"\n🔑 Found password column: {password_col[1]}")
        
        # Get first few users with passwords
        cursor.execute(f"SELECT id, phone, full_name, role, {password_col[1]} FROM users LIMIT 3")
        users = cursor.fetchall()
        
        print(f"\n👥 Sample users:")
        for user in users:
            print(f"  ID: {user[0]}, Phone: {user[1]}, Name: {user[2]}, Role: {user[3]}")
            if user[4]:
                print(f"    Password hash: {user[4][:50]}...")
            else:
                print(f"    No password hash found")
    else:
        print("\n❌ No password column found in users table")
        
    # Check if there's a user_credentials table
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%credential%'")
    cred_tables = cursor.fetchall()
    
    if cred_tables:
        print(f"\n🔐 Found credential tables:")
        for table in cred_tables:
            print(f"  {table[0]}")
            
            # Check table structure
            cursor.execute(f"PRAGMA table_info({table[0]})")
            cols = cursor.fetchall()
            print(f"    Columns: {[col[1] for col in cols]}")
            
            # Get sample data
            cursor.execute(f"SELECT * FROM {table[0]} LIMIT 2")
            data = cursor.fetchall()
            if data:
                print(f"    Sample data: {data}")
    
except Exception as e:
    print(f"❌ Error accessing database: {e}")
finally:
    if 'conn' in locals():
        conn.close()