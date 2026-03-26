#!/usr/bin/env python3
"""
Debug script to test guardian loading in payment endpoint
"""

import requests
import json
from datetime import date

# API Configuration
API_BASE = "http://localhost:8000/api/v1"
ADMIN_LOGIN_URL = f"{API_BASE}/auth/login"
PAYMENTS_URL = f"{API_BASE}/payments"
STUDENTS_URL = f"{API_BASE}/students"

# Test credentials
ADMIN_CREDENTIALS = {
    "username": "admin",
    "password": "123"
}

def test_guardian_loading():
    """Test guardian loading by checking the actual data"""
    print("🔍 Testing guardian loading...")
    
    # Login as admin
    login_response = requests.post(ADMIN_LOGIN_URL, data=ADMIN_CREDENTIALS)
    if login_response.status_code != 200:
        print(f"❌ Admin login failed: {login_response.status_code}")
        return False
    
    admin_token = login_response.json().get("access_token")
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    
    # Get student details from list endpoint (which has guardians)
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
        print("❌ Misha Mishin not found in students list")
        return False
    
    print(f"🔍 Found student: {misha['first_name']} {misha['last_name']}")
    print(f"🔍 Student ID: {misha['id']}")
    print(f"🔍 Guardians: {len(misha.get('guardians', []))}")
    
    if misha.get('guardians'):
        for i, guardian in enumerate(misha['guardians']):
            print(f"  Guardian {i+1}:")
            print(f"    - ID: {guardian.get('id')}")
            print(f"    - Full name: {guardian.get('full_name')}")
            print(f"    - Phone: {guardian.get('phone')}")
            print(f"    - Relationship: {guardian.get('relationship_type')}")
    
    # Now create a payment and see what happens
    payment_data = {
        "student_id": misha['id'],
        "amount": 500.0,
        "payment_date": str(date.today()),
        "method": "cash",
        "status": "completed",
        "payment_period": "2024-01-01",
        "description": "Test guardian loading"
    }
    
    print(f"\n🧪 Creating payment...")
    payment_response = requests.post(PAYMENTS_URL, json=payment_data, headers=admin_headers)
    
    if payment_response.status_code != 200:
        print(f"❌ Payment creation failed: {payment_response.status_code}")
        print(f"Response: {payment_response.text}")
        return False
    
    payment_result = payment_response.json()
    print(f"✅ Payment created: ID {payment_result['id']}")
    
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
    for notification in notifications:
        content = notification.get('content', '')
        if 'оплата' in content.lower() or 'payment' in content.lower():
            print(f"✅ Found payment notification: {content}")
            payment_notification_found = True
    
    if not payment_notification_found:
        print("❌ No payment notification found")
    
    return payment_notification_found

if __name__ == "__main__":
    test_guardian_loading()