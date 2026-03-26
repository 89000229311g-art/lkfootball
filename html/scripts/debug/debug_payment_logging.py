#!/usr/bin/env python3
"""
Debug script to test payment creation with detailed logging
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

def debug_payment_with_logging():
    """Test payment creation with detailed logging"""
    print("🔍 Debugging payment creation with logging...")
    
    # Login as admin
    login_response = requests.post(ADMIN_LOGIN_URL, data=ADMIN_CREDENTIALS)
    if login_response.status_code != 200:
        print(f"❌ Admin login failed: {login_response.status_code}")
        return False
    
    admin_token = login_response.json().get("access_token")
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    
    # First, let's check the student details to understand the guardian structure
    student_response = requests.get(f"{API_BASE}/students/104", headers=admin_headers)
    if student_response.status_code != 200:
        print(f"❌ Failed to get student: {student_response.status_code}")
        return False
    
    student_data = student_response.json()
    print(f"🔍 Student: {student_data['first_name']} {student_data['last_name']}")
    print(f"🔍 Guardian IDs: {student_data.get('guardian_ids', [])}")
    
    # Create payment with detailed logging
    payment_data = {
        "student_id": 104,  # Misha Mishin
        "amount": 500.0,
        "payment_date": str(date.today()),
        "method": "cash",
        "status": "completed",
        "payment_period": "2024-01-01",
        "description": "Debug payment with logging"
    }
    
    print(f"🧪 Creating payment with data: {json.dumps(payment_data, indent=2)}")
    
    payment_response = requests.post(PAYMENTS_URL, json=payment_data, headers=admin_headers)
    
    print(f"📋 Payment response status: {payment_response.status_code}")
    print(f"📋 Payment response: {payment_response.text}")
    
    if payment_response.status_code != 200:
        print(f"❌ Payment creation failed")
        return False
    
    payment_result = payment_response.json()
    print(f"✅ Payment created: ID {payment_result['id']}")
    
    return True

if __name__ == "__main__":
    debug_payment_with_logging()