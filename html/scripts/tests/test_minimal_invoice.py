#!/usr/bin/env python3
"""
Test with minimal payload to isolate the issue
"""
import requests
import json

def test_minimal_invoice():
    """Test with minimal payload"""
    
    # Login first
    login_data = {"username": "admin", "password": "123"}
    response = requests.post("http://localhost:8000/api/v1/auth/login", data=login_data)
    
    if response.status_code != 200:
        print(f"❌ Login failed: {response.text}")
        return
    
    token = response.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    
    # Test with minimal payload
    minimal_payload = {
        "student_id": 1,
        "invoice_items": [
            {
                "item_type": "equipment",
                "description": "Test equipment",
                "quantity": 1,
                "unit_price": 100.0
            }
        ]
    }
    
    print("🔍 Testing with minimal payload...")
    print(f"📤 Payload: {json.dumps(minimal_payload, indent=2)}")
    
    response = requests.post("http://localhost:8000/api/v1/payments/manual-invoice", json=minimal_payload, headers=headers)
    
    print(f"\n📊 Response:")
    print(f"   Status: {response.status_code}")
    print(f"   Headers: {dict(response.headers)}")
    print(f"   Response: {response.text[:500]}")
    
    # Also test with GET to see what happens
    print(f"\n📍 Testing GET method (should fail with different error):")
    response = requests.get("http://localhost:8000/api/v1/payments/manual-invoice", headers=headers)
    print(f"   Status: {response.status_code}")
    print(f"   Response: {response.text[:200]}")

if __name__ == "__main__":
    test_minimal_invoice()