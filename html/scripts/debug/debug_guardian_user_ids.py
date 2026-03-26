#!/usr/bin/env python3
"""
Debug script to check guardian user IDs
"""

import requests

# API Configuration
API_BASE = "http://localhost:8000/api/v1"
ADMIN_LOGIN_URL = f"{API_BASE}/auth/login"

# Test credentials
ADMIN_CREDENTIALS = {
    "username": "admin",
    "password": "123"
}

def check_guardian_user_ids():
    """Check guardian user IDs"""
    print("🔍 Checking guardian user IDs...")
    
    # Login as admin
    login_response = requests.post(ADMIN_LOGIN_URL, data=ADMIN_CREDENTIALS)
    if login_response.status_code != 200:
        print(f"❌ Admin login failed: {login_response.status_code}")
        return False
    
    admin_token = login_response.json().get("access_token")
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    
    # Get all students
    students_response = requests.get(f"{API_BASE}/students?limit=100", headers=admin_headers)
    if students_response.status_code != 200:
        print(f"❌ Failed to get students: {students_response.status_code}")
        return False
    
    students_data = students_response.json()
    students = students_data.get('data', [])
    
    print(f"📋 Checking guardian user IDs for students:")
    for student in students:
        guardians = student.get('guardians', [])
        print(f"\n  {student['id']}. {student['first_name']} {student['last_name']} - {len(guardians)} guardians")
        for guardian in guardians:
            print(f"     - Guardian ID: {guardian['id']}, Phone: {guardian['phone']}, Name: {guardian['full_name']}")
            # Try to find user by phone
            user_response = requests.get(f"{API_BASE}/auth/users?search={guardian['phone']}", headers=admin_headers)
            if user_response.status_code == 200:
                users_data = user_response.json()
                users = users_data.get('data', [])
                if users:
                    user = users[0]
                    print(f"       -> User ID: {user['id']}, Username: {user['username']}, Role: {user['role']}")
                else:
                    print(f"       -> No user found for phone {guardian['phone']}")
            else:
                print(f"       -> Failed to search user: {user_response.status_code}")
    
    return True

if __name__ == "__main__":
    check_guardian_user_ids()