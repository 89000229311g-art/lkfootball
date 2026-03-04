#!/usr/bin/env python3
"""
Debug script to check student guardian structure
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

def debug_guardian_structure():
    """Check student guardian structure"""
    print("🔍 Debugging guardian structure...")
    
    # Login as admin
    login_response = requests.post(ADMIN_LOGIN_URL, data=ADMIN_CREDENTIALS)
    if login_response.status_code != 200:
        print(f"❌ Admin login failed: {login_response.status_code}")
        return False
    
    admin_token = login_response.json().get("access_token")
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    
    # Get student details
    student_id = 104  # Misha Mishin
    student_detail_response = requests.get(f"{STUDENTS_URL}/{student_id}", headers=admin_headers)
    if student_detail_response.status_code != 200:
        print(f"❌ Failed to get student details: {student_detail_response.status_code}")
        return False
    
    student_detail = student_detail_response.json()
    print(f"🔍 Student: {student_detail['first_name']} {student_detail['last_name']}")
    
    # Check guardians
    guardians = student_detail.get('guardians', [])
    print(f"📋 Found {len(guardians)} guardians:")
    
    for i, guardian in enumerate(guardians):
        print(f"  Guardian {i+1}:")
        print(f"    - ID: {guardian.get('id')}")
        print(f"    - Full name: {guardian.get('full_name')}")
        print(f"    - Phone: {guardian.get('phone')}")
        print(f"    - Relationship: {guardian.get('relationship_type')}")
        print(f"    - Keys: {list(guardian.keys())}")
    
    return True

if __name__ == "__main__":
    debug_guardian_structure()