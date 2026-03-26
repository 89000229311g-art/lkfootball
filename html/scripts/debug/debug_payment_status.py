#!/usr/bin/env python3
"""
Debug script to check payment status and notifications
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

PARENT_CREDENTIALS = {
    "username": "parent",
    "password": "123"
}

def check_payment_status():
    """Check payment status and notifications"""
    print("🔍 Checking payment status and notifications...")
    
    # Login as admin
    login_response = requests.post(ADMIN_LOGIN_URL, data=ADMIN_CREDENTIALS)
    if login_response.status_code != 200:
        print(f"❌ Admin login failed: {login_response.status_code}")
        return False
    
    admin_token = login_response.json().get("access_token")
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    
    # Login as parent
    parent_login_response = requests.post(ADMIN_LOGIN_URL, data=PARENT_CREDENTIALS)
    if parent_login_response.status_code != 200:
        print(f"❌ Parent login failed: {parent_login_response.status_code}")
        return False
    
    parent_token = parent_login_response.json().get("access_token")
    parent_headers = {"Authorization": f"Bearer {parent_token}"}
    
    # Get student
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
    student_id = student['id']
    
    print(f"📋 Student: {student['first_name']} {student['last_name']} (ID: {student_id})")
    
    # Get recent payments
    payments_response = requests.get(f"{API_BASE}/payments?student_id={student_id}&limit=5", headers=admin_headers)
    if payments_response.status_code != 200:
        print(f"❌ Failed to get payments: {payments_response.status_code}")
        return False
    
    payments_data = payments_response.json()
    payments = payments_data.get('data', [])
    
    print(f"\n📋 Recent payments:")
    for payment in payments:
        print(f"   Payment ID: {payment['id']}")
        print(f"   Amount: {payment['amount']} MDL")
        print(f"   Status: {payment['status']}")
        print(f"   Date: {payment['payment_date']}")
        print(f"   Period: {payment.get('payment_period', 'N/A')}")
        print()
    
    # Get parent notifications
    notifications_response = requests.get(f"{API_BASE}/messages/notifications", headers=parent_headers)
    if notifications_response.status_code != 200:
        print(f"❌ Failed to get parent notifications: {notifications_response.status_code}")
        return False
    
    notifications_data = notifications_response.json()
    notifications = notifications_data.get('data', [])
    
    print(f"\n📋 Parent notifications ({len(notifications)}):")
    for notification in notifications:
        print(f"   {notification['content'][:50]}...")
    
    return True

if __name__ == "__main__":
    check_payment_status()