#!/usr/bin/env python3
"""
Simple test to check what notifications parent has after payment
"""

import requests
import json
from datetime import date

# API Configuration
API_BASE = "http://localhost:8000/api/v1"
PARENT_LOGIN_URL = f"{API_BASE}/auth/login"
NOTIFICATIONS_URL = f"{API_BASE}/messages/notifications"

# Test credentials
PARENT_CREDENTIALS = {
    "username": "parent",
    "password": "123"
}

def check_parent_notifications():
    """Check what notifications parent currently has"""
    print("📋 Checking parent notifications...")
    
    # Login as parent
    login_response = requests.post(PARENT_LOGIN_URL, data=PARENT_CREDENTIALS)
    if login_response.status_code != 200:
        print(f"❌ Parent login failed: {login_response.status_code}")
        return False
    
    parent_token = login_response.json().get("access_token")
    parent_headers = {"Authorization": f"Bearer {parent_token}"}
    
    # Get notifications
    notifications_response = requests.get(NOTIFICATIONS_URL, headers=parent_headers)
    if notifications_response.status_code != 200:
        print(f"❌ Failed to get notifications: {notifications_response.status_code}")
        return False
    
    notifications = notifications_response.json()
    print(f"📋 Parent has {len(notifications)} notifications:")
    
    for i, notification in enumerate(notifications):
        content = notification.get('content', '')
        print(f"  {i+1}. {content[:100]}...")
        if 'оплата' in content.lower() or 'payment' in content.lower():
            print(f"     ^ Found payment-related notification!")
    
    return True

if __name__ == "__main__":
    check_parent_notifications()