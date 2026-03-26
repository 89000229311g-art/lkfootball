#!/usr/bin/env python3
"""
Simple test to debug payment recording issue
"""

import requests
import json
from datetime import date

# API Configuration
API_BASE = "http://localhost:8000/api/v1"
ADMIN_LOGIN_URL = f"{API_BASE}/auth/login"
RECORD_PAYMENT_URL = f"{API_BASE}/payments/"

# Test credentials
ADMIN_CREDENTIALS = {
    "username": "admin",
    "password": "123"
}

def test_simple_payment():
    """Test simple payment recording"""
    print("🧪 Testing simple payment recording...")
    
    # Step 1: Login as admin
    print("Step 1: Login as admin...")
    login_response = requests.post(ADMIN_LOGIN_URL, data=ADMIN_CREDENTIALS)
    if login_response.status_code != 200:
        print(f"❌ Admin login failed: {login_response.status_code}")
        print(f"Response: {login_response.text}")
        return False
    
    admin_token = login_response.json().get("access_token")
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    
    # Step 2: Try simple payment
    print("Step 2: Record simple payment...")
    
    payment_data = {
        "student_id": 104,
        "amount": 100.00,
        "payment_date": str(date.today()),
        "method": "cash",
        "status": "completed",
        "description": "Simple test payment"
    }
    
    print(f"Sending payment data: {json.dumps(payment_data, indent=2)}")
    
    payment_response = requests.post(
        RECORD_PAYMENT_URL,
        json=payment_data,
        headers=admin_headers
    )
    
    print(f"Response status: {payment_response.status_code}")
    print(f"Response: {payment_response.text}")
    
    if payment_response.status_code == 200:
        payment_result = payment_response.json()
        print(f"✅ Payment recorded successfully. Payment ID: {payment_result.get('id')}")
        return True
    else:
        print(f"❌ Payment recording failed: {payment_response.status_code}")
        return False

if __name__ == "__main__":
    test_simple_payment()