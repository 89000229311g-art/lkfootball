#!/usr/bin/env python3
"""
Debug script to check student guardian relationship
"""

import requests
import json

# API Configuration
API_BASE = "http://localhost:8000/api/v1"
ADMIN_LOGIN_URL = f"{API_BASE}/auth/login"
STUDENTS_URL = f"{API_BASE}/students"

# Test credentials
ADMIN_CREDENTIALS = {
    "username": "admin",
    "password": "123"
}

def debug_student_guardians():
    """Check student guardian relationship"""
    print("🔍 Debugging student guardian relationship...")
    
    # Login as admin
    login_response = requests.post(ADMIN_LOGIN_URL, data=ADMIN_CREDENTIALS)
    if login_response.status_code != 200:
        print(f"❌ Admin login failed: {login_response.status_code}")
        return False
    
    admin_token = login_response.json().get("access_token")
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    
    # Get students
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
    
    if not misha:
        print("❌ Misha Mishin not found")
        print(f"Available students: {[s.get('first_name') + ' ' + s.get('last_name') for s in students[:5]]}")
        return False
    
    print(f"📋 Found student: {misha['first_name']} {misha['last_name']} (ID: {misha['id']})")
    print(f"📋 Guardians: {misha.get('guardians', [])}")
    
    # Get detailed student info
    student_detail_response = requests.get(f"{STUDENTS_URL}/{misha['id']}", headers=admin_headers)
    if student_detail_response.status_code != 200:
        print(f"❌ Failed to get student details: {student_detail_response.status_code}")
        return False
    
    student_detail = student_detail_response.json()
    print(f"🔍 Student details:")
    print(f"   - ID: {student_detail['id']}")
    print(f"   - Parent phone: {student_detail.get('parent_phone', 'Not set')}")
    print(f"   - Guardians: {len(student_detail.get('guardians', []))}")
    
    for i, guardian in enumerate(student_detail.get('guardians', [])):
        print(f"   - Guardian {i+1}:")
        print(f"     - ID: {guardian.get('id', 'Not set')}")
        print(f"     - Full name: {guardian.get('full_name', 'Not set')}")
        print(f"     - Phone: {guardian.get('phone', 'Not set')}")
        print(f"     - Relationship: {guardian.get('relationship_type', 'Not set')}")
    
    return True

if __name__ == "__main__":
    debug_student_guardians()