#!/usr/bin/env python3
"""
Final comprehensive test for payment notifications
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

def test_receipt_upload_notification():
    """Test receipt upload notification"""
    print("\n" + "="*60)
    print("Running: Receipt Upload Notification")
    print("="*60)
    
    print("🧪 Testing receipt upload notification...")
    
    # Login as admin (for permissions)
    login_response = requests.post(ADMIN_LOGIN_URL, data=ADMIN_CREDENTIALS)
    if login_response.status_code != 200:
        print(f"❌ Admin login failed: {login_response.status_code}")
        return False
    
    admin_token = login_response.json().get("access_token")
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    
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
    
    print("Step 1: Get student info...")
    print("Step 2: Upload receipt...")
    
    # Create a minimal PNG file content
    png_content = b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x00\x05\x18\xd4c\x00\x00\x00\x00IEND\xaeB`\x82'
    
    files = {
        'file': ('receipt.png', png_content, 'image/png')
    }
    
    data = {
        'student_id': str(student_id),
        'amount': '500',
        'period': '2024-01'  # Format: YYYY-MM
    }
    
    upload_response = requests.post(f"{API_BASE}/payments/receipt", 
                                    files=files, 
                                    data=data, 
                                    headers=admin_headers)
    
    if upload_response.status_code != 200:
        print(f"❌ Receipt upload failed: {upload_response.status_code}")
        print(f"Response: {upload_response.text}")
        return False
    
    upload_result = upload_response.json()
    payment_id = upload_result['id']
    print(f"✅ Receipt uploaded successfully. Payment ID: {payment_id}")
    
    print("Step 3: Check admin notifications...")
    
    # Get admin notifications
    notifications_response = requests.get(f"{API_BASE}/messages/notifications", headers=admin_headers)
    if notifications_response.status_code != 200:
        print(f"❌ Failed to get admin notifications: {notifications_response.status_code}")
        return False
    
    notifications_data = notifications_response.json()
    notifications = notifications_data if isinstance(notifications_data, list) else notifications_data.get('data', [])
    
    print(f"📋 Admin has {len(notifications)} notifications")
    
    # Look for receipt notification
    receipt_notification_found = False
    for notification in notifications:
        content = notification['content']
        if "ЗАГРУЖЕН ЧЕК" in content and student['first_name'] in content and student['last_name'] in content:
            receipt_notification_found = True
            print(f"✅ Found receipt notification: {content[:60]}...")
            break
    
    if not receipt_notification_found:
        print(f"❌ No receipt upload notification found for admin")
        print("Available notifications:")
        for notification in notifications:
            print(f"   - {notification['content'][:60]}...")
    
    return receipt_notification_found

def test_payment_completion_notification():
    """Test payment completion notification"""
    print("\n" + "="*60)
    print("Running: Payment Completion Notification")
    print("="*60)
    
    print("\n🧪 Testing payment completion notification...")
    
    # Login as admin
    login_response = requests.post(ADMIN_LOGIN_URL, data=ADMIN_CREDENTIALS)
    if login_response.status_code != 200:
        print(f"❌ Admin login failed: {login_response.status_code}")
        return False
    
    admin_token = login_response.json().get("access_token")
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    
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
    
    print("Step 1: Login as admin...")
    print("Step 2: Record payment...")
    
    # Create payment with completed status
    payment_data = {
        "student_id": student_id,
        "amount": 500.0,
        "payment_date": "2024-01-15",
        "payment_period": "2024-01-01",  # Correct format: YYYY-MM-DD
        "payment_method": "cash",
        "status": "completed"  # Explicitly set status to completed
    }
    
    payment_response = requests.post(f"{API_BASE}/payments", 
                                   json=payment_data, 
                                   headers=admin_headers)
    
    if payment_response.status_code != 200:
        print(f"❌ Payment recording failed: {payment_response.status_code}")
        print(f"Response: {payment_response.text}")
        return False
    
    payment_result = payment_response.json()
    payment_id = payment_result['id']
    print(f"✅ Payment recorded successfully. Payment ID: {payment_id}")
    print(f"Payment status: {payment_result.get('status', 'unknown')}")
    
    print("Step 3: Check parent notifications...")
    
    # Login as parent
    parent_login_response = requests.post(ADMIN_LOGIN_URL, data=PARENT_CREDENTIALS)
    if parent_login_response.status_code != 200:
        print(f"❌ Parent login failed: {parent_login_response.status_code}")
        return False
    
    parent_token = parent_login_response.json().get("access_token")
    parent_headers = {"Authorization": f"Bearer {parent_token}"}
    
    # Get parent notifications
    notifications_response = requests.get(f"{API_BASE}/messages/notifications", headers=parent_headers)
    if notifications_response.status_code != 200:
        print(f"❌ Failed to get parent notifications: {notifications_response.status_code}")
        return False
    
    notifications_data = notifications_response.json()
    notifications = notifications_data if isinstance(notifications_data, list) else notifications_data.get('data', [])
    
    print(f"📋 Parent has {len(notifications)} notifications")
    
    # Look for payment completion notification
    payment_notification_found = False
    for notification in notifications:
        content = notification['content']
        if "Оплата подтверждена" in content and student['first_name'] in content and student['last_name'] in content:
            payment_notification_found = True
            print(f"✅ Found payment completion notification: {content[:60]}...")
            break
    
    if not payment_notification_found:
        print(f"❌ No payment completion notification found for parent")
        print("Available notifications:")
        for notification in notifications:
            print(f"   - {notification['content'][:60]}...")
    
    return payment_notification_found

def main():
    """Main test function"""
    print("🚀 Starting payment notification tests...")
    
    # Test receipt upload notification
    receipt_test_passed = test_receipt_upload_notification()
    
    # Test payment completion notification
    payment_test_passed = test_payment_completion_notification()
    
    # Summary
    print("\n" + "="*60)
    print("TEST SUMMARY")
    print("="*60)
    print(f"Receipt Upload Notification: {'✅ PASSED' if receipt_test_passed else '❌ FAILED'}")
    print(f"Payment Completion Notification: {'✅ PASSED' if payment_test_passed else '❌ FAILED'}")
    print(f"\nTotal: {sum([receipt_test_passed, payment_test_passed])}/2 tests passed")
    
    if not (receipt_test_passed and payment_test_passed):
        print("⚠️  Some tests failed. Check the output above for details.")
    else:
        print("🎉 All tests passed!")

if __name__ == "__main__":
    main()