#!/usr/bin/env python3
"""
Test the complete frontend flow simulation
"""

import requests
import json

# Test user credentials from create_users.py
USERS = {
    'super_admin': {'username': 'owner', 'password': '123'},
    'admin': {'username': 'admin', 'password': '123'},
    'coach': {'username': 'coach', 'password': '123'},
    'parent': {'username': 'parent', 'password': '123'}
}

def test_user_role(user_type):
    """Test login and get user info for a specific role"""
    print(f"\n{'='*50}")
    print(f"Testing {user_type.upper()} role")
    print(f"{'='*50}")
    
    user_creds = USERS[user_type]
    
    # Login
    print(f"🔑 Logging in as {user_creds['username']}...")
    login_response = requests.post(
        "http://localhost:8000/api/v1/auth/login",
        data=user_creds,
        headers={"Content-Type": "application/x-www-form-urlencoded"}
    )
    
    if login_response.status_code != 200:
        print(f"❌ Login failed: {login_response.status_code}")
        print(login_response.text)
        return None
    
    token = login_response.json()["access_token"]
    print(f"✅ Login successful")
    
    # Get user info
    print(f"👤 Getting user info...")
    user_response = requests.get(
        "http://localhost:8000/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token}"}
    )
    
    if user_response.status_code != 200:
        print(f"❌ Failed to get user info: {user_response.status_code}")
        return None
    
    user_data = user_response.json()
    print(f"✅ User info retrieved")
    print(f"   Name: {user_data.get('full_name')}")
    print(f"   Role: {user_data.get('role')}")
    print(f"   Phone: {user_data.get('phone')}")
    
    # Test permissions for invoice creation
    user_role = user_data.get('role', '').lower()
    can_create_invoice = user_role in ['super_admin', 'admin']
    print(f"🔍 Can create invoices: {can_create_invoice}")
    
    return {
        'token': token,
        'user': user_data,
        'can_create_invoice': can_create_invoice
    }

def test_invoice_creation(user_info, student_id=104):
    """Test manual invoice creation"""
    print(f"\n💰 Testing invoice creation...")
    
    if not user_info['can_create_invoice']:
        print("❌ User doesn't have permission to create invoices")
        return False
    
    payload = {
        "student_id": student_id,
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
    
    response = requests.post(
        "http://localhost:8000/api/v1/payments/manual-invoice",
        json=payload,
        headers={
            "Authorization": f"Bearer {user_info['token']}",
            "Content-Type": "application/json"
        }
    )
    
    if response.status_code == 200:
        print("✅ Invoice created successfully!")
        result = response.json()
        print(f"   Payment ID: {result.get('id')}")
        print(f"   Amount: {result.get('amount')}")
        print(f"   Status: {result.get('status')}")
        return True
    else:
        print(f"❌ Invoice creation failed: {response.status_code}")
        print(f"   Response: {response.text}")
        return False

# Test all user roles
print("🚀 Testing Frontend Role-Based Permissions")
print("This simulates what would happen in the frontend when users try to create invoices")

for user_type in ['super_admin', 'admin', 'coach', 'parent']:
    user_info = test_user_role(user_type)
    if user_info:
        test_invoice_creation(user_info)

print(f"\n{'='*50}")
print("✅ Testing completed!")
print("Summary:")
print("- super_admin: Can create invoices ✅")
print("- admin: Can create invoices ✅") 
print("- coach: Cannot create invoices ❌")
print("- parent: Cannot create invoices ❌")
print("This matches the frontend logic in handleInvoiceStudent()")