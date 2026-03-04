#!/usr/bin/env python3
"""
Debug script to check guardians in database
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

def check_all_guardians():
    """Check all guardians in database"""
    print("🔍 Checking all guardians in database...")
    
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
    
    print(f"📋 Found {len(students)} students:")
    for student in students:
        guardians = student.get('guardians', [])
        print(f"  {student['id']}. {student['first_name']} {student['last_name']} - {len(guardians)} guardians")
        for guardian in guardians:
            print(f"     - Guardian: {guardian}")
    
    # Find students with guardians
    students_with_guardians = [s for s in students if s.get('guardians', [])]
    print(f"\n✅ Students with guardians: {len(students_with_guardians)}")
    
    if students_with_guardians:
        student = students_with_guardians[0]
        print(f"   Example: {student['first_name']} {student['last_name']} (ID: {student['id']})")
        for guardian in student['guardians']:
            print(f"     - Guardian: {guardian}")
    
    return True

if __name__ == "__main__":
    check_all_guardians()