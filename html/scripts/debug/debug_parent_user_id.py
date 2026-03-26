#!/usr/bin/env python3
"""
Debug script to check parent user ID
"""

import requests

# API Configuration
API_BASE = "http://localhost:8000/api/v1"
ADMIN_LOGIN_URL = f"{API_BASE}/auth/login"

# Test credentials
PARENT_CREDENTIALS = {
    "username": "parent",
    "password": "123"
}

def check_parent_user_id():
    """Check parent user ID"""
    print("🔍 Checking parent user ID...")
    
    # Login as parent
    login_response = requests.post(ADMIN_LOGIN_URL, data=PARENT_CREDENTIALS)
    if login_response.status_code != 200:
        print(f"❌ Parent login failed: {login_response.status_code}")
        return False
    
    parent_token = login_response.json().get("access_token")
    parent_headers = {"Authorization": f"Bearer {parent_token}"}
    
    # Get user info
    user_response = requests.get(f"{API_BASE}/auth/me", headers=parent_headers)
    if user_response.status_code != 200:
        print(f"❌ Failed to get user info: {user_response.status_code}")
        return False
    
    user_info = user_response.json()
    print(f"✅ Parent user info:")
    print(f"   ID: {user_info.get('id')}")
    print(f"   Username: {user_info.get('username')}")
    print(f"   Email: {user_info.get('email')}")
    print(f"   Role: {user_info.get('role')}")
    
    return user_info.get('id')

if __name__ == "__main__":
    check_parent_user_id()