#!/usr/bin/env python3
"""
Debug the manual-invoice endpoint
"""
import requests
import json

def debug_manual_invoice():
    """Debug the manual invoice endpoint"""
    
    # Login first
    login_data = {"username": "admin", "password": "123"}
    response = requests.post("http://localhost:8000/api/v1/auth/login", data=login_data)
    
    if response.status_code != 200:
        print(f"❌ Login failed: {response.text}")
        return
    
    token = response.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    
    # Test different methods on the endpoint
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
    
    print("🔍 Testing manual-invoice endpoint with different methods...")
    
    # Test POST
    print("\n📍 Testing POST method:")
    response = requests.post("http://localhost:8000/api/v1/payments/manual-invoice", json=test_payload, headers=headers)
    print(f"   Status: {response.status_code}")
    print(f"   Response: {response.text[:300]}")
    
    # Test GET (should fail with 405)
    print("\n📍 Testing GET method:")
    response = requests.get("http://localhost:8000/api/v1/payments/manual-invoice", headers=headers)
    print(f"   Status: {response.status_code}")
    print(f"   Response: {response.text[:200]}")
    
    # Test OPTIONS (to see allowed methods)
    print("\n📍 Testing OPTIONS method:")
    response = requests.options("http://localhost:8000/api/v1/payments/manual-invoice")
    print(f"   Status: {response.status_code}")
    print(f"   Allow header: {response.headers.get('Allow', 'Not found')}")
    
    # Test if endpoint exists at all
    print("\n📍 Testing if endpoint is registered:")
    response = requests.get("http://localhost:8000/docs")
    if response.status_code == 200:
        print("   ✅ /docs endpoint is accessible")
        # Look for manual-invoice in the docs
        if "manual-invoice" in response.text:
            print("   ✅ manual-invoice endpoint found in docs")
        else:
            print("   ❌ manual-invoice endpoint NOT found in docs")
    
    # Test a known working endpoint for comparison
    print("\n📍 Testing known working endpoint (GET /payments):")
    response = requests.get("http://localhost:8000/api/v1/payments/", headers=headers)
    print(f"   Status: {response.status_code}")
    if response.status_code == 200:
        print("   ✅ Payments endpoint works")
    else:
        print(f"   ❌ Payments endpoint failed: {response.text[:200]}")

if __name__ == "__main__":
    debug_manual_invoice()