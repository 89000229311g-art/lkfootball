#!/usr/bin/env python3
"""
Debug script to check user search
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

def check_user_search():
    """Check user search"""
    print("🔍 Checking user search...")
    
    # Login as admin
    login_response = requests.post(ADMIN_LOGIN_URL, data=ADMIN_CREDENTIALS)
    if login_response.status_code != 200:
        print(f"❌ Admin login failed: {login_response.status_code}")
        return False
    
    admin_token = login_response.json().get("access_token")
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    
    # Search for user by phone
    phone = "+3731111111"
    print(f"Searching for user with phone: {phone}")
    
    user_response = requests.get(f"{API_BASE}/auth/users?search={phone}", headers=admin_headers)
    if user_response.status_code == 200:
        users_data = user_response.json()
        users = users_data.get('data', [])
        
        print(f"Found {len(users)} users:")
        for user in users:
            print(f"   ID: {user['id']}, Phone: {user['phone']}, Role: {user['role']}, Name: {user.get('full_name', 'N/A')}")
    else:
        print(f"❌ User search failed: {user_response.status_code}")
        print(f"Response: {user_response.text}")
    
    # Also try without plus sign
    phone2 = "3731111111"
    print(f"\nSearching for user with phone: {phone2}")
    
    user_response2 = requests.get(f"{API_BASE}/auth/users?search={phone2}", headers=admin_headers)
    if user_response2.status_code == 200:
        users_data2 = user_response2.json()
        users2 = users_data2.get('data', [])
        
        print(f"Found {len(users2)} users:")
        for user in users2:
            print(f"   ID: {user['id']}, Phone: {user['phone']}, Role: {user['role']}, Name: {user.get('full_name', 'N/A')}")
    else:
        print(f"❌ User search failed: {user_response2.status_code}")
    
    return True

if __name__ == "__main__":
    check_user_search()