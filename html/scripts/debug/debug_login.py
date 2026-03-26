#!/usr/bin/env python3
"""
Direct login test with detailed debugging
"""
import requests
import json

BASE_URL = "http://localhost:8000/api/v1"

def debug_login():
    """Debug login with detailed output"""
    print("🔍 Debugging login...")
    
    # Test direct login
    login_data = {
        "username": "admin",
        "password": "admin"
    }
    
    print(f"Sending login request to: {BASE_URL}/auth/login")
    print(f"Login data: {login_data}")
    
    try:
        response = requests.post(f"{BASE_URL}/auth/login", data=login_data)
        print(f"Response status: {response.status_code}")
        print(f"Response headers: {dict(response.headers)}")
        print(f"Response text: {response.text}")
        
        if response.status_code == 200:
            result = response.json()
            print(f"✅ Login successful!")
            print(f"Token: {result.get('access_token', 'No token')}")
            return result.get('access_token')
        else:
            print(f"❌ Login failed with status {response.status_code}")
            try:
                error_data = response.json()
                print(f"Error details: {error_data}")
            except:
                print(f"Raw error: {response.text}")
            return None
            
    except Exception as e:
        print(f"❌ Request failed: {e}")
        return None

if __name__ == "__main__":
    token = debug_login()
    if token:
        print(f"\n🎉 Success! Token: {token[:20]}...")
    else:
        print(f"\n💥 Login failed!")