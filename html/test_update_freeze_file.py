#!/usr/bin/env python3
"""
Test script to verify the new updateFreezeFile endpoint
"""
import requests
import json
from datetime import date, timedelta

# API configuration
API_BASE = "http://localhost:8000/api/v1"
LOGIN_URL = f"{API_BASE}/auth/login"
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

def test_update_freeze_file_endpoint():
    """Test the new updateFreezeFile endpoint"""
    print("🧪 Testing updateFreezeFile endpoint...")
    
    # Step 1: Login as admin
    print("\n1. Logging in as admin...")
    try:
        login_response = requests.post(ADMIN_LOGIN_URL, data=ADMIN_CREDENTIALS)
        login_response.raise_for_status()
        admin_token = login_response.json().get("access_token")
        admin_headers = {"Authorization": f"Bearer {admin_token}"}
        print("✅ Admin login successful")
    except Exception as e:
        print(f"❌ Admin login failed: {e}")
        return False
    
    # Step 2: Login as parent to create a freeze request
    print("\n2. Logging in as parent...")
    try:
        login_response = requests.post(LOGIN_URL, data=PARENT_CREDENTIALS)
        login_response.raise_for_status()
        parent_token = login_response.json().get("access_token")
        parent_headers = {"Authorization": f"Bearer {parent_token}"}
        print("✅ Parent login successful")
    except Exception as e:
        print(f"❌ Parent login failed: {e}")
        return False
    
    # Step 3: Create a freeze request as parent
    print("\n3. Creating freeze request as parent...")
    try:
        end_date = date.today() + timedelta(days=7)
        freeze_data = {
            "end_date": end_date.isoformat(),
            "reason": "Test freeze request for file update"
        }
        
        freeze_response = requests.post(
            f"{API_BASE}/students/104/freeze-request", 
            json=freeze_data, 
            headers=parent_headers
        )
        freeze_response.raise_for_status()
        
        freeze_result = freeze_response.json()
        request_id = freeze_result.get('request_id')
        print(f"✅ Freeze request created: ID {request_id}")
        
        if not request_id:
            print(f"❌ No request_id in response: {freeze_result}")
            return False
        
    except Exception as e:
        print(f"❌ Freeze request creation failed: {e}")
        return False
    
    # Step 4: Test updating the freeze request file as admin
    print("\n4. Testing updateFreezeFile endpoint as admin...")
    try:
        test_file_url = "https://example.com/test-document.pdf"
        
        update_response = requests.patch(
            f"{API_BASE}/students/freeze-requests/{request_id}/file",
            json={"file_url": test_file_url},
            headers=admin_headers
        )
        update_response.raise_for_status()
        
        update_result = update_response.json()
        print(f"✅ File URL updated successfully: {update_result.get('file_url')}")
        
    except Exception as e:
        print(f"❌ File update failed: {e}")
        if hasattr(e, 'response') and e.response:
            print(f"Response details: {e.response.text}")
        return False
    
    # Step 5: Test unauthorized access (parent trying to update)
    print("\n5. Testing unauthorized access (parent trying to update file)...")
    try:
        unauthorized_response = requests.patch(
            f"{API_BASE}/students/freeze-requests/{request_id}/file",
            json={"file_url": "https://example.com/unauthorized.pdf"},
            headers=parent_headers
        )
        
        if unauthorized_response.status_code == 403:
            print("✅ Unauthorized access correctly blocked (403)")
        else:
            print(f"❌ Expected 403 but got {unauthorized_response.status_code}")
            return False
            
    except Exception as e:
        print(f"❌ Unauthorized test failed: {e}")
        return False
    
    return True

if __name__ == "__main__":
    print("🚀 Testing updateFreezeFile endpoint...\n")
    
    success = test_update_freeze_file_endpoint()
    
    if success:
        print("\n🎉 All tests passed! The updateFreezeFile endpoint is working correctly.")
    else:
        print("\n⚠️ Some tests failed. Check the logs above for details.")