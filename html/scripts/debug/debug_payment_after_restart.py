#!/usr/bin/env python3
"""
Debug script to test payment creation with debug output after server restart
"""

import requests
import json
from datetime import date

# API Configuration
API_BASE = "http://localhost:8000/api/v1"
ADMIN_LOGIN_URL = f"{API_BASE}/auth/login"
PAYMENTS_URL = f"{API_BASE}/payments"

# Test credentials
ADMIN_CREDENTIALS = {
    "username": "admin",
    "password": "123"
}

def debug_payment_after_restart():
    """Test payment creation with debug output after server restart"""
    print("🔍 Testing payment creation with debug output after server restart...")
    
    # Login as admin
    login_response = requests.post(ADMIN_LOGIN_URL, data=ADMIN_CREDENTIALS)
    if login_response.status_code != 200:
        print(f"❌ Admin login failed: {login_response.status_code}")
        return False
    
    admin_token = login_response.json().get("access_token")
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    
    # Create payment with debug identifier
    payment_data = {
        "student_id": 104,  # Misha Mishin
        "amount": 500.0,
        "payment_date": str(date.today()),
        "method": "cash",
        "status": "completed",
        "payment_period": "2024-01-01",
        "description": "DEBUG_PAYMENT_AFTER_RESTART_999"
    }
    
    print(f"🧪 Creating payment with debug identifier...")
    payment_response = requests.post(PAYMENTS_URL, json=payment_data, headers=admin_headers)
    
    if payment_response.status_code != 200:
        print(f"❌ Payment creation failed: {payment_response.status_code}")
        print(f"Response: {payment_response.text}")
        return False
    
    payment_result = payment_response.json()
    print(f"✅ Payment created: ID {payment_result['id']}")
    
    # Wait a bit for background tasks
    import time
    time.sleep(3)
    
    # Check parent notifications
    parent_login_response = requests.post(ADMIN_LOGIN_URL, data={"username": "parent", "password": "123"})
    if parent_login_response.status_code != 200:
        print(f"❌ Parent login failed: {parent_login_response.status_code}")
        return False
    
    parent_token = parent_login_response.json().get("access_token")
    parent_headers = {"Authorization": f"Bearer {parent_token}"}
    
    notifications_response = requests.get(f"{API_BASE}/messages/notifications", headers=parent_headers)
    if notifications_response.status_code != 200:
        print(f"❌ Failed to get notifications: {notifications_response.status_code}")
        return False
    
    notifications = notifications_response.json()
    print(f"\n📋 Parent notifications: {len(notifications)}")
    
    payment_notification_found = False
    for i, notification in enumerate(notifications):
        content = notification.get('content', '')
        print(f"  {i+1}. {content[:100]}...")
        if 'оплата' in content.lower() or 'payment' in content.lower():
            print(f"     ^ Found payment notification!")
            payment_notification_found = True
    
    if not payment_notification_found:
        print("❌ No payment notification found")
    
    return payment_notification_found

if __name__ == "__main__":
    debug_payment_after_restart()