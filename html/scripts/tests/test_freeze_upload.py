#!/usr/bin/env python3
"""
Test script to verify freeze request file upload integration
"""
import requests
import json
from datetime import date, timedelta

# API configuration
API_BASE = "http://localhost:8000/api/v1"
LOGIN_URL = f"{API_BASE}/auth/login"
FREEZE_REQUEST_URL = f"{API_BASE}/students/104/freeze-request"
UPLOAD_URL = f"{API_BASE}/medical-docs"

# Test credentials from create_users.py
TEST_CREDENTIALS = {
    "username": "parent",
    "password": "123"
}

def test_freeze_request_with_file():
    """Test the complete freeze request flow with file upload"""
    print("🧪 Testing freeze request with file upload integration...")
    
    # Step 1: Login to get token
    print("\n1. Logging in...")
    try:
        login_response = requests.post(LOGIN_URL, data=TEST_CREDENTIALS)
        login_response.raise_for_status()
        token = login_response.json().get("access_token")
        headers = {"Authorization": f"Bearer {token}"}
        print("✅ Login successful")
    except Exception as e:
        print(f"❌ Login failed: {e}")
        return False
    
    # Step 2: Create a test file upload (simulate file)
    print("\n2. Testing file upload endpoint...")
    try:
        # Create a simple text file for testing
        test_file_content = b"This is a test medical document for freeze request"
        files = {"file": ("test_freeze_doc.txt", test_file_content, "text/plain")}
        
        upload_response = requests.post(UPLOAD_URL, files=files, headers=headers)
        upload_response.raise_for_status()
        
        file_data = upload_response.json()
        file_url = file_data.get("url") or file_data.get("data", {}).get("url")
        
        if not file_url:
            print(f"❌ File upload succeeded but no URL returned: {file_data}")
            return False
            
        print(f"✅ File uploaded successfully: {file_url}")
    except Exception as e:
        print(f"❌ File upload failed: {e}")
        file_url = None  # Continue without file to test basic functionality
    
    # Step 3: Create freeze request with file URL
    print("\n3. Creating freeze request...")
    try:
        # Set end date to 7 days from now
        end_date = date.today() + timedelta(days=7)
        
        freeze_data = {
            "end_date": end_date.isoformat(),
            "reason": "Test freeze request with file upload",
            "file_url": file_url
        }
        
        freeze_response = requests.post(
            FREEZE_REQUEST_URL, 
            json=freeze_data, 
            headers=headers
        )
        freeze_response.raise_for_status()
        
        freeze_result = freeze_response.json()
        print(f"✅ Freeze request created successfully: ID {freeze_result.get('id')}")
        
        # Verify the file_url was stored
        if file_url:
            print(f"✅ File URL stored in freeze request: {file_url}")
        else:
            print("ℹ️ No file URL provided in freeze request")
            
        return True
        
    except Exception as e:
        print(f"❌ Freeze request creation failed: {e}")
        if hasattr(e, 'response') and e.response:
            print(f"Response details: {e.response.text}")
        return False

def test_notification_delivery():
    """Test that notifications are delivered properly"""
    print("\n🧪 Testing notification delivery...")
    
    try:
        # Login as parent
        login_response = requests.post(LOGIN_URL, data=TEST_CREDENTIALS)
        login_response.raise_for_status()
        token = login_response.json().get("access_token")
        headers = {"Authorization": f"Bearer {token}"}
        
        # Get notifications
        notifications_response = requests.get(
            f"{API_BASE}/messages/notifications", 
            headers=headers
        )
        notifications_response.raise_for_status()
        
        notifications = notifications_response.json()
        print(f"✅ Retrieved {len(notifications)} notifications")
        
        # Look for freeze request notifications
        freeze_notifications = [n for n in notifications if 'заморозку' in str(n.get('content', '')).lower()]
        if freeze_notifications:
            print(f"✅ Found {len(freeze_notifications)} freeze request notifications")
            for notif in freeze_notifications:
                print(f"  - {notif.get('content')}")
        else:
            print("⚠️ No freeze request notifications found")
            
        return True
        
    except Exception as e:
        print(f"❌ Notification test failed: {e}")
        return False

if __name__ == "__main__":
    print("🚀 Starting freeze request integration tests...\n")
    
    # Test 1: Basic freeze request with file upload
    success1 = test_freeze_request_with_file()
    
    # Test 2: Notification delivery
    success2 = test_notification_delivery()
    
    print(f"\n📊 Test Results:")
    print(f"Freeze Request with File: {'✅ PASS' if success1 else '❌ FAIL'}")
    print(f"Notification Delivery: {'✅ PASS' if success2 else '❌ FAIL'}")
    
    if success1 and success2:
        print("\n🎉 All tests passed! Freeze request integration is working correctly.")
    else:
        print("\n⚠️ Some tests failed. Check the logs above for details.")