#!/usr/bin/env python3
"""
Debug script to check payment status and test with explicit completed status
"""

import requests
import json

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

def test_payment_with_completed_status():
    """Test payment with explicit completed status"""
    print("🔍 Testing payment with explicit completed status...")
    
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
    
    # Create payment with explicit completed status
    payment_data = {
        "student_id": student_id,
        "amount": 500.0,
        "payment_date": "2024-01-15",
        "payment_period": "2024-01-01",  # Correct format: YYYY-MM-DD
        "payment_method": "cash",
        "status": "completed"  # Explicitly set status to completed
    }
    
    print(f"\n🧪 Creating payment with completed status...")
    print(f"Payment data: {json.dumps(payment_data, indent=2)}")
    
    payment_response = requests.post(f"{API_BASE}/payments", 
                                   json=payment_data, 
                                   headers=admin_headers)
    
    if payment_response.status_code != 200:
        print(f"❌ Failed to create payment: {payment_response.status_code}")
        print(f"Response: {payment_response.text}")
        return False
    
    payment_result = payment_response.json()
    payment_id = payment_result['id']
    print(f"✅ Payment created successfully. Payment ID: {payment_id}")
    print(f"Payment status: {payment_result.get('status', 'unknown')}")
    
    # Get parent notifications
    notifications_response = requests.get(f"{API_BASE}/messages/notifications", headers=parent_headers)
    if notifications_response.status_code != 200:
        print(f"❌ Failed to get parent notifications: {notifications_response.status_code}")
        return False
    
    notifications_data = notifications_response.json()
    notifications = notifications_data if isinstance(notifications_data, list) else notifications_data.get('data', [])
    
    print(f"\n📋 Parent notifications ({len(notifications)}):")
    payment_notification_found = False
    for notification in notifications:
        content = notification['content']
        print(f"   - {content[:60]}...")
        if "Оплата подтверждена" in content:
            payment_notification_found = True
            print(f"   ✅ Found payment completion notification!")
    
    if not payment_notification_found:
        print(f"\n❌ No payment completion notification found")
    else:
        print(f"\n✅ Payment completion notification found!")
    
    return True

if __name__ == "__main__":
    test_payment_with_completed_status()