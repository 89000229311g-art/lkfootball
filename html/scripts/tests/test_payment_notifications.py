#!/usr/bin/env python3
"""
Test script to verify payment notification logic for admins.
Tests both receipt upload notifications and payment completion notifications.
"""

import requests
import json
from datetime import date

# API Configuration
API_BASE = "http://localhost:8000/api/v1"
ADMIN_LOGIN_URL = f"{API_BASE}/auth/login"
PARENT_LOGIN_URL = f"{API_BASE}/auth/login"
UPLOAD_RECEIPT_URL = f"{API_BASE}/payments/receipt"
RECORD_PAYMENT_URL = f"{API_BASE}/payments/"
NOTIFICATIONS_URL = f"{API_BASE}/messages/notifications"

# Test credentials
ADMIN_CREDENTIALS = {
    "username": "admin",
    "password": "123"
}

PARENT_CREDENTIALS = {
    "username": "parent",
    "password": "123"
}

def test_upload_receipt_notification():
    """Test that uploading a receipt creates admin notifications"""
    print("🧪 Testing receipt upload notification...")
    
    # Step 1: Login as parent
    print("Step 1: Login as parent...")
    login_response = requests.post(PARENT_LOGIN_URL, data=PARENT_CREDENTIALS)
    if login_response.status_code != 200:
        print(f"❌ Parent login failed: {login_response.status_code}")
        return False
    
    parent_token = login_response.json().get("access_token")
    parent_headers = {"Authorization": f"Bearer {parent_token}"}
    
    # Step 2: Upload a receipt
    print("Step 2: Upload receipt...")
    
    # Create a simple test file (PNG format)
    # This is a minimal valid PNG file (1x1 pixel)
    png_header = b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x00\x05\x18\xd4c\x00\x00\x00\x00IEND\xaeB`\x82'
    files = {
        'file': ('test_receipt.png', png_header, 'image/png')
    }
    
    data = {
        'student_id': '104',  # Using existing test student
        'amount': '500.00',
        'period': '2024-01'
    }
    
    upload_response = requests.post(
        UPLOAD_RECEIPT_URL,
        files=files,
        data=data,
        headers=parent_headers
    )
    
    if upload_response.status_code != 200:
        print(f"❌ Receipt upload failed: {upload_response.status_code}")
        print(f"Response: {upload_response.text}")
        return False
    
    payment_data = upload_response.json()
    print(f"✅ Receipt uploaded successfully. Payment ID: {payment_data.get('id')}")
    
    # Step 3: Check admin notifications
    print("Step 3: Check admin notifications...")
    
    # Login as admin
    admin_login_response = requests.post(ADMIN_LOGIN_URL, data=ADMIN_CREDENTIALS)
    if admin_login_response.status_code != 200:
        print(f"❌ Admin login failed: {admin_login_response.status_code}")
        return False
    
    admin_token = admin_login_response.json().get("access_token")
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    
    # Get admin notifications
    notifications_response = requests.get(NOTIFICATIONS_URL, headers=admin_headers)
    if notifications_response.status_code != 200:
        print(f"❌ Failed to get notifications: {notifications_response.status_code}")
        return False
    
    notifications = notifications_response.json()
    print(f"📋 Admin has {len(notifications)} notifications")
    
    # Look for receipt upload notification
    receipt_notification_found = False
    for notification in notifications:
        content = notification.get('content', '')
        if '📸 ЗАГРУЖЕН ЧЕК' in content and '500.0 MDL' in content:
            receipt_notification_found = True
            print(f"✅ Found receipt notification: {content[:100]}...")
            break
    
    if not receipt_notification_found:
        print("❌ No receipt upload notification found for admin")
        print("Available notifications:")
        for notification in notifications[-5:]:  # Show last 5
            print(f"  - {notification.get('content', '')[:80]}...")
        return False
    
    return True

def test_record_payment_notification():
    """Test that recording a payment creates parent notification"""
    print("\n🧪 Testing payment completion notification...")
    
    # Step 1: Login as admin
    print("Step 1: Login as admin...")
    login_response = requests.post(ADMIN_LOGIN_URL, data=ADMIN_CREDENTIALS)
    if login_response.status_code != 200:
        print(f"❌ Admin login failed: {login_response.status_code}")
        return False
    
    admin_token = login_response.json().get("access_token")
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    
    # Step 2: Record a payment
    print("Step 2: Record payment...")
    
    payment_data = {
        "student_id": 104,
        "amount": 750.00,
        "payment_date": str(date.today()),
        "payment_period": "2024-01-01",  # Add payment period to trigger notification
        "method": "cash",
        "status": "completed",
        "description": "Test payment for notification"
    }
    
    payment_response = requests.post(
        RECORD_PAYMENT_URL,
        json=payment_data,
        headers=admin_headers
    )
    
    if payment_response.status_code != 200:
        print(f"❌ Payment recording failed: {payment_response.status_code}")
        print(f"Response: {payment_response.text}")
        return False
    
    payment_result = payment_response.json()
    print(f"✅ Payment recorded successfully. Payment ID: {payment_result.get('id')}")
    
    # Step 3: Check parent notifications
    print("Step 3: Check parent notifications...")
    
    # Login as parent
    parent_login_response = requests.post(PARENT_LOGIN_URL, data=PARENT_CREDENTIALS)
    if parent_login_response.status_code != 200:
        print(f"❌ Parent login failed: {parent_login_response.status_code}")
        return False
    
    parent_token = parent_login_response.json().get("access_token")
    parent_headers = {"Authorization": f"Bearer {parent_token}"}
    
    # Get parent notifications
    notifications_response = requests.get(NOTIFICATIONS_URL, headers=parent_headers)
    if notifications_response.status_code != 200:
        print(f"❌ Failed to get notifications: {notifications_response.status_code}")
        return False
    
    notifications = notifications_response.json()
    print(f"📋 Parent has {len(notifications)} notifications")
    
    # Look for payment completion notification
    payment_notification_found = False
    for notification in notifications:
        content = notification.get('content', '')
        if 'оплата подтверждена' in content.lower() or 'payment confirmed' in content.lower():
            payment_notification_found = True
            print(f"✅ Found payment notification: {content[:100]}...")
            break
    
    if not payment_notification_found:
        print("❌ No payment completion notification found for parent")
        print("Available notifications:")
        for notification in notifications[-5:]:  # Show last 5
            print(f"  - {notification.get('content', '')[:80]}...")
        return False
    
    return True

def main():
    """Run all payment notification tests"""
    print("🚀 Starting payment notification tests...\n")
    
    tests = [
        ("Receipt Upload Notification", test_upload_receipt_notification),
        ("Payment Completion Notification", test_record_payment_notification)
    ]
    
    results = []
    for test_name, test_func in tests:
        print(f"\n{'='*60}")
        print(f"Running: {test_name}")
        print('='*60)
        
        try:
            result = test_func()
            results.append((test_name, result))
        except Exception as e:
            print(f"❌ Test failed with exception: {e}")
            results.append((test_name, False))
    
    # Summary
    print(f"\n{'='*60}")
    print("TEST SUMMARY")
    print('='*60)
    
    passed = 0
    for test_name, result in results:
        status = "✅ PASSED" if result else "❌ FAILED"
        print(f"{test_name}: {status}")
        if result:
            passed += 1
    
    print(f"\nTotal: {passed}/{len(tests)} tests passed")
    
    if passed == len(tests):
        print("🎉 All payment notification tests passed!")
        return True
    else:
        print("⚠️  Some tests failed. Check the output above for details.")
        return False

if __name__ == "__main__":
    main()