#!/usr/bin/env python3
"""
Test script to verify freeze request functionality
"""
import requests
import json
from datetime import datetime, timedelta

# Configuration
BASE_URL = "http://localhost:8000"
API_PREFIX = "/api/v1"
LOGIN_ENDPOINT = f"{BASE_URL}{API_PREFIX}/auth/login"
FREEZE_ENDPOINT_TEMPLATE = f"{BASE_URL}{API_PREFIX}/students/{{student_id}}/freeze-request"

# Test credentials from create_users.py
PARENT_PHONE = "parent"
PARENT_PASSWORD = "123"
STUDENT_ID = 104  # Миша Мишин (assigned to parent user_id: 137)

def login(phone, password):
    """Login and return access token"""
    response = requests.post(LOGIN_ENDPOINT, data={
        "username": phone,
        "password": password
    }, headers={"Content-Type": "application/x-www-form-urlencoded"})
    if response.status_code == 200:
        return response.json()["access_token"]
    else:
        print(f"Login failed: {response.status_code} - {response.text}")
        return None

def test_freeze_request():
    """Test the freeze request endpoint"""
    print("Testing freeze request functionality...")
    
    # Login as parent
    token = login(PARENT_PHONE, PARENT_PASSWORD)
    if not token:
        print("Failed to login")
        return False
    
    headers = {"Authorization": f"Bearer {token}"}
    
    # Use predefined student ID
    student_id = STUDENT_ID
    print(f"Testing freeze request for student ID: {student_id}")
    
    # Prepare freeze request data
    end_date = datetime.now() + timedelta(days=30)
    freeze_data = {
        "end_date": end_date.strftime("%Y-%m-%d"),
        "reason": "Test freeze request from automation script",
        "file_url": "https://example.com/test-document.pdf"
    }
    
    print(f"Sending freeze request: {json.dumps(freeze_data, indent=2)}")
    
    # Send freeze request
    response = requests.post(
        FREEZE_ENDPOINT_TEMPLATE.format(student_id=student_id),
        json=freeze_data,
        headers=headers
    )
    
    print(f"Response status: {response.status_code}")
    print(f"Response body: {response.text}")
    
    if response.status_code == 200:
        print("✅ Freeze request created successfully!")
        return True
    else:
        print(f"❌ Freeze request failed: {response.status_code}")
        return False

if __name__ == "__main__":
    success = test_freeze_request()
    exit(0 if success else 1)