#!/usr/bin/env python3
"""
Test different endpoints to find the correct one
"""
import requests
import json

BASE_URL = "http://localhost:8000/api/v1"

def test_endpoints():
    """Test different endpoint variations"""
    
    # Login first
    login_data = {"username": "admin", "password": "123"}
    response = requests.post(f"{BASE_URL}/auth/login", data=login_data)
    
    if response.status_code != 200:
        print(f"❌ Login failed: {response.text}")
        return
    
    token = response.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    
    # Test different endpoint variations
    endpoints = [
        "/payments/manual-invoice",
        "/payments/manual-invoice/",
        "/payments/manual_invoice",
        "/payments/manual-invoice/create",
        "/payments/create-manual-invoice"
    ]
    
    test_payload = {
        "student_id": 1,
        "payment_period": "2026-02-01",
        "invoice_items": [
            {
                "item_type": "equipment",
                "description": "Test equipment",
                "quantity": 1,
                "unit_price": 100.0
            }
        ]
    }
    
    print("🔍 Testing different endpoints...")
    
    for endpoint in endpoints:
        print(f"\n📍 Testing: {endpoint}")
        try:
            response = requests.post(f"{BASE_URL}{endpoint}", json=test_payload, headers=headers)
            print(f"   Status: {response.status_code}")
            if response.status_code != 405:
                print(f"   Response: {response.text[:200]}")
                if response.status_code == 200:
                    print("   ✅ SUCCESS!")
                    return endpoint
            else:
                print("   ❌ Method Not Allowed")
        except Exception as e:
            print(f"   ❌ Error: {e}")
    
    print("\n💥 No working endpoint found!")

if __name__ == "__main__":
    test_endpoints()