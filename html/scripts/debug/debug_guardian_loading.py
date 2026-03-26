#!/usr/bin/env python3
"""
Debug script to test student guardian loading
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

def debug_student_guardian_loading():
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
    student_id = 104  # Misha Mishin
    student_detail_response = requests.get(f"{STUDENTS_URL}/{student_id}", headers=admin_headers)
    if student_detail_response.status_code != 200:
        print(f"❌ Failed to get student details: {student_detail_response.status_code}")
        return False
    
    student_detail = student_detail_response.json()
    print(f"🔍 Student: {student_detail['first_name']} {student_detail['last_name']}")
    print(f"🔍 Guardian IDs: {student_detail.get('guardian_ids', [])}")
    
    # Check if we can get guardian details
    if student_detail.get('guardian_ids'):
        print(f"🔍 First guardian ID: {student_detail['guardian_ids'][0]}")
        
        # Try to get user details for the first guardian
        user_response = requests.get(f"{API_BASE}/users/{student_detail['guardian_ids'][0]}", headers=admin_headers)
        if user_response.status_code == 200:
            user_data = user_response.json()
            print(f"🔍 Guardian user details:")
            print(f"   - Username: {user_data.get('username')}")
            print(f"   - Full name: {user_data.get('full_name')}")
            print(f"   - Phone: {user_data.get('phone')}")
            print(f"   - Role: {user_data.get('role')}")
        else:
            print(f"❌ Failed to get user details: {user_response.status_code}")
    
    return True

if __name__ == "__main__":
    debug_student_guardian_loading()