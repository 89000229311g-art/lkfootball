#!/usr/bin/env python3
"""
Debug script to check guardian relationship
"""

import requests

# API Configuration
API_BASE = "http://localhost:8000/api/v1"
ADMIN_LOGIN_URL = f"{API_BASE}/auth/login"
STUDENTS_URL = f"{API_BASE}/students"

# Test credentials
ADMIN_CREDENTIALS = {
    "username": "admin",
    "password": "123"
}

def check_guardian_relationship():
    """Check guardian relationship"""
    print("🔍 Checking guardian relationship...")
    
    # Login as admin
    login_response = requests.post(ADMIN_LOGIN_URL, data=ADMIN_CREDENTIALS)
    if login_response.status_code != 200:
        print(f"❌ Admin login failed: {login_response.status_code}")
        return False
    
    admin_token = login_response.json().get("access_token")
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    
    # Get student details
    student_response = requests.get(f"{STUDENTS_URL}/104", headers=admin_headers)
    if student_response.status_code != 200:
        print(f"❌ Failed to get student: {student_response.status_code}")
        return False
    
    student_info = student_response.json()
    print(f"✅ Student info:")
    print(f"   ID: {student_info.get('id')}")
    print(f"   Name: {student_info.get('first_name')} {student_info.get('last_name')}")
    
    # Get student with guardians
    students_response = requests.get(f"{STUDENTS_URL}?search=Миша", headers=admin_headers)
    if students_response.status_code != 200:
        print(f"❌ Failed to get students: {students_response.status_code}")
        return False
    
    students_data = students_response.json()
    students = students_data.get('data', [])
    misha = None
    for student in students:
        if student['id'] == 104:
            misha = student
            break
    
    if not misha:
        print("❌ Student 104 not found in list")
        return False
    
    print(f"\n📋 Student with guardians:")
    print(f"   ID: {misha.get('id')}")
    print(f"   Name: {misha.get('first_name')} {misha.get('last_name')}")
    
    parents = misha.get('parents', [])
    print(f"   Parents: {len(parents)}")
    for i, parent in enumerate(parents):
        print(f"     {i+1}. ID: {parent.get('id')}, Name: {parent.get('first_name')} {parent.get('last_name')}, User ID: {parent.get('user_id')}")
    
    return True

if __name__ == "__main__":
    check_guardian_relationship()