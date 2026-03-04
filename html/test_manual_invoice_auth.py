#!/usr/bin/env python3
"""
Test script for manual invoice creation with authentication
"""

import requests
import json

# Login first to get token
login_data = {
    "username": "+37312345678",  # Phone number as username
    "password": "admin123"  # Common default password
}

try:
    # Try to login with form data
    login_response = requests.post(
        "http://localhost:8000/api/v1/auth/login",
        data={  # Use data instead of json for form data
            "username": "owner",  # Super admin test user from create_users.py
            "password": "123"     # Default password from create_users.py
        },
        headers={"Content-Type": "application/x-www-form-urlencoded"}
    )
    
    print(f"Login Status Code: {login_response.status_code}")
    
    if login_response.status_code == 200:
        token_data = login_response.json()
        access_token = token_data.get("access_token")
        print(f"✅ Got access token: {access_token[:20]}...")
        
        # Test data
        test_payload = {
            "student_id": 1,
            "payment_period": "2026-02-01",
            "invoice_items": [
                {
                    "item_type": "membership",
                    "description": "Абонемент за февраль 2026",
                    "quantity": 1,
                    "unit_price": 1500.0
                }
            ]
        }
        
        # Test the endpoint with auth
        response = requests.post(
            "http://localhost:8000/api/v1/payments/manual-invoice",
            json=test_payload,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {access_token}"
            }
        )
        
        print(f"Invoice Status Code: {response.status_code}")
        print(f"Response Headers: {dict(response.headers)}")
        
        if response.status_code == 200:
            print("✅ SUCCESS: Invoice created successfully!")
            print(f"Response: {json.dumps(response.json(), indent=2, ensure_ascii=False)}")
        else:
            print(f"❌ ERROR: {response.status_code}")
            try:
                error_data = response.json()
                print(f"Error details: {json.dumps(error_data, indent=2, ensure_ascii=False)}")
            except:
                print(f"Raw response: {response.text}")
                
    else:
        print(f"❌ Login failed: {login_response.text}")
        
except requests.exceptions.ConnectionError:
    print("❌ ERROR: Could not connect to backend. Make sure it's running on localhost:8000")
except Exception as e:
    print(f"❌ ERROR: {str(e)}")