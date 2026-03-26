#!/usr/bin/env python3
"""
Simple login test to debug the authentication issue
"""
import requests
import json

BASE_URL = "http://localhost:8000/api/v1"

def test_login():
    """Test login with different formats"""
    print("🔍 Testing login formats...")
    
    # Test 1: Phone number with country code
    print("\n1. Testing phone format: +373777777")
    response = requests.post(f"{BASE_URL}/auth/login", data={"username": "+373777777", "password": "1"})
    print(f"   Status: {response.status_code}")
    if response.status_code == 200:
        print("   ✅ Login successful!")
        return response.json()["access_token"]
    else:
        print(f"   ❌ Error: {response.text}")
    
    # Test 2: Phone number without country code
    print("\n2. Testing phone format: 373777777")
    response = requests.post(f"{BASE_URL}/auth/login", data={"username": "373777777", "password": "1"})
    print(f"   Status: {response.status_code}")
    if response.status_code == 200:
        print("   ✅ Login successful!")
        return response.json()["access_token"]
    else:
        print(f"   ❌ Error: {response.text}")
    
    # Test 3: Phone number without plus
    print("\n3. Testing phone format: 777777")
    response = requests.post(f"{BASE_URL}/auth/login", data={"username": "777777", "password": "1"})
    print(f"   Status: {response.status_code}")
    if response.status_code == 200:
        print("   ✅ Login successful!")
        return response.json()["access_token"]
    else:
        print(f"   ❌ Error: {response.text}")
    
    return None

if __name__ == "__main__":
    token = test_login()
    if token:
        print(f"\n🎉 Success! Token: {token[:20]}...")
    else:
        print("\n💥 All login attempts failed!")