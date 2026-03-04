#!/usr/bin/env python3
"""
Debug script to test student guardian loading in payment context
"""

import requests
import json
from datetime import date

# API Configuration
API_BASE = "http://localhost:8000/api/v1"
ADMIN_LOGIN_URL = f"{API_BASE}/auth/login"
STUDENTS_URL = f"{API_BASE}/students"

# Test credentials
ADMIN_CREDENTIALS = {
    "username": "admin",
    "password": "123"
}

def debug_student_guardians_in_payment():
    """Test student guardian loading"""
    print("🔍 Debugging student guardian loading...")
    
    # Login as admin
    login_response = requests.post(ADMIN_LOGIN_URL, data=ADMIN_CREDENTIALS)
    if login_response.status_code != 200:
        print(f"❌ Admin login failed: {login_response.status_code}")
        return False
    
    admin_token = login_response.json().get("access_token")
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    
    # Get student details
    student_id = 104
    student_response = requests.get(f"{STUDENTS_URL}/{student_id}", headers=admin_headers)
    if student_response.status_code != 200:
        print(f"❌ Failed to get student: {student_response.status_code}")
        return False
    
    student_data = student_response.json()
    print(f"🔍 Student: {student_data['first_name']} {student_data['last_name']}")
    print(f"🔍 Guardian IDs: {student_data.get('guardian_ids', [])}")
    
    # Check if we can get guardian details using a different approach
    # Let's try to get the student with guardians from the list endpoint
    students_response = requests.get(STUDENTS_URL, headers=admin_headers)
    if students_response.status_code != 200:
        print(f"❌ Failed to get students: {students_response.status_code}")
        return False
    
    students_data = students_response.json()
    students = students_data.get('data', [])
    
    # Find Misha Mishin
    misha = None
    for student in students:
        if student.get('first_name') == 'Миша' and student.get('last_name') == 'Мишин':
            misha = student
            break
    
    if misha:
        print(f"🔍 From list: {misha['first_name']} {misha['last_name']}")
        print(f"🔍 From list - Guardians: {misha.get('guardians', [])}")
    
    return True

if __name__ == "__main__":
    debug_student_guardians_in_payment()