#!/usr/bin/env python3
"""
Debug script to check which guardian should receive payment notifications
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

def check_payment_guardian():
    """Check which guardian should receive payment notifications"""
    print("🔍 Checking which guardian should receive payment notifications...")
    
    # Login as admin
    login_response = requests.post(ADMIN_LOGIN_URL, data=ADMIN_CREDENTIALS)
    if login_response.status_code != 200:
        print(f"❌ Admin login failed: {login_response.status_code}")
        return False
    
    admin_token = login_response.json().get("access_token")
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    
    # Get student with guardians
    students_response = requests.get(f"{API_BASE}/students?search=Миша", headers=admin_headers)
    if students_response.status_code != 200:
        print(f"❌ Failed to get students: {students_response.status_code}")
        return False
    
    students_data = students_response.json()
    students = students_data.get('data', [])
    
    if not students:
        print("❌ Student not found")
        return False
    
    student = students[0]
    guardians = student.get('guardians', [])
    
    print(f"📋 Student: {student['first_name']} {student['last_name']} (ID: {student['id']})")
    print(f"   Guardians: {len(guardians)}")
    
    for guardian in guardians:
        print(f"\n   Guardian ID: {guardian['id']}")
        print(f"   Phone: {guardian['phone']}")
        print(f"   Name: {guardian['full_name']}")
        print(f"   Relationship: {guardian['relationship_type']}")
        
        # Find user by phone (without plus sign)
        phone = guardian['phone'].replace('+', '') if guardian['phone'].startswith('+') else guardian['phone']
        user_response = requests.get(f"{API_BASE}/auth/users?search={phone}", headers=admin_headers)
        if user_response.status_code == 200:
            users_data = user_response.json()
            users = users_data.get('data', [])
            if users:
                user = users[0]
                print(f"   -> User ID: {user['id']}")
                print(f"   -> User Phone: {user['phone']}")
                print(f"   -> User Name: {user.get('full_name', 'N/A')}")
                print(f"   -> User Role: {user['role']}")
                
                # Check if this is the user that logs in as "parent"
                if user['phone'] == 'parent':
                    print(f"   -> This is the 'parent' login account!")
            else:
                print(f"   -> No user found for phone {phone}")
        else:
            print(f"   -> Failed to search user: {user_response.status_code}")
    
    return True

if __name__ == "__main__":
    check_payment_guardian()