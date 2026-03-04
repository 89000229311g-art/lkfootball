#!/usr/bin/env python3
"""
Test manual invoice creation with valid student ID
"""

import requests
import json

# Login first
print("🔑 Logging in as super admin...")
login_response = requests.post(
    "http://localhost:8000/api/v1/auth/login",
    data={
        "username": "owner",
        "password": "123"
    },
    headers={"Content-Type": "application/x-www-form-urlencoded"}
)

if login_response.status_code != 200:
    print(f"❌ Login failed: {login_response.status_code}")
    print(login_response.text)
    exit(1)

token = login_response.json()["access_token"]
print(f"✅ Got access token: {token[:20]}...")

# Test manual invoice creation
print("\n💰 Testing manual invoice creation...")

# Use a valid student ID from our database
payload = {
    "student_id": 104,  # Миша Мишин
    "payment_period": "2026-02-01",
    "invoice_items": [
        {
            "item_type": "membership",
            "description": "Test subscription for February 2026",
            "quantity": 1,
            "unit_price": 1200.00
        }
    ]
}

print(f"📤 Sending payload: {json.dumps(payload, indent=2)}")

response = requests.post(
    "http://localhost:8000/api/v1/payments/manual-invoice",
    json=payload,
    headers={
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
)

print(f"\n📊 Response Status: {response.status_code}")
print(f"📊 Response Headers: {dict(response.headers)}")

if response.status_code == 200:
    print("✅ Manual invoice created successfully!")
    print(f"Response: {json.dumps(response.json(), indent=2)}")
elif response.status_code == 404:
    print("❌ Student not found")
    print(f"Response: {response.text}")
else:
    print(f"❌ Error: {response.status_code}")
    print(f"Response: {response.text}")