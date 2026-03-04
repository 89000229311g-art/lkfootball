#!/usr/bin/env python3
"""
Debug script to check user ID 116
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

def check_user_116():
    """Check user ID 116"""
    print("🔍 Checking user ID 116...")
    
    # Login as admin
    login_response = requests.post(ADMIN_LOGIN_URL, data=ADMIN_CREDENTIALS)
    if login_response.status_code != 200:
        print(f"❌ Admin login failed: {login_response.status_code}")
        return False
    
    admin_token = login_response.json().get("access_token")
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    
    # Get user by ID
    user_response = requests.get(f"{API_BASE}/auth/users/116", headers=admin_headers)
    if user_response.status_code == 200:
        user = user_response.json()
        print(f"✅ User 116 found:")
        print(f"   ID: {user.get('id')}")
        print(f"   Phone: {user.get('phone')}")
        print(f"   Full Name: {user.get('full_name')}")
        print(f"   Role: {user.get('role')}")
    else:
        print(f"❌ User 116 not found: {user_response.status_code}")
    
    # Get all users to see the pattern
    users_response = requests.get(f"{API_BASE}/auth/users?limit=200", headers=admin_headers)
    if users_response.status_code == 200:
        users_data = users_response.json()
        users = users_data.get('data', [])
        
        print(f"\n📋 All users:")
        for user in users:
            print(f"   ID: {user['id']}, Phone: {user['phone']}, Role: {user['role']}, Name: {user.get('full_name', 'N/A')}")
    
    return True

if __name__ == "__main__":
    check_user_116()