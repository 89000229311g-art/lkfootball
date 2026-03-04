#!/usr/bin/env python3
"""
Debug script to test payment creation with debug output
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

def debug_payment_with_debug_output():
    """Test payment creation with debug output"""
    print("🔍 Testing payment creation with debug output...")
    
    # Login as admin
    login_response = requests.post(ADMIN_LOGIN_URL, data=ADMIN_CREDENTIALS)
    if login_response.status_code != 200:
        print(f"❌ Admin login failed: {login_response.status_code}")
        return False
    
    admin_token = login_response.json().get("access_token")
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    
    # Create payment with debug identifier
    payment_data = {
        "student_id": 104,  # Misha Mishin
        "amount": 500.0,
        "payment_date": str(date.today()),
        "method": "cash",
        "status": "completed",
        "payment_period": "2024-01-01",
        "description": "DEBUG_PAYMENT_WITH_OUTPUT_789"
    }
    
    print(f"🧪 Creating payment with debug identifier...")
    payment_response = requests.post(PAYMENTS_URL, json=payment_data, headers=admin_headers)
    
    if payment_response.status_code != 200:
        print(f"❌ Payment creation failed: {payment_response.status_code}")
        print(f"Response: {payment_response.text}")
        return False
    
    payment_result = payment_response.json()
    print(f"✅ Payment created: ID {payment_result['id']}")
    
    return True

if __name__ == "__main__":
    debug_payment_with_debug_output()