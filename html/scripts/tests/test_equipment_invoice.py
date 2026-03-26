#!/usr/bin/env python3
"""
Test script to verify equipment invoice creation functionality
"""
import requests
import json
from datetime import datetime

BASE_URL = "http://localhost:8001"

def login(phone, password):
    """Login and get access token"""
    login_data = {
        "username": phone,
        "password": password
    }
    response = requests.post(f"{BASE_URL}/api/v1/auth/login", data=login_data)  # Use form data, not JSON
    if response.status_code == 200:
        return response.json()["access_token"]
    else:
        print(f"❌ Login failed: {response.text}")
        return None

def test_equipment_invoice():
    """Test creating an equipment invoice"""
    print("🧪 Testing equipment invoice creation...")
    
    # Login as admin user
    token = login("admin", "123")  # Admin user (password from create_users.py)
    if not token:
        print("Trying test user credentials...")
        token = login("+373888888", "2")  # Администратор
        if not token:
            return False
    
    headers = {"Authorization": f"Bearer {token}"}
    
    # Get a student ID
    print("📋 Getting student list...")
    students_resp = requests.get(f"{BASE_URL}/api/v1/students", headers=headers)
    if students_resp.status_code != 200:
        print(f"❌ Failed to get students: {students_resp.text}")
        return False
    
    students = students_resp.json().get("data", [])
    if not students:
        print("❌ No students found")
        return False
    
    student = students[0]
    student_id = student["id"]
    student_name = f"{student['first_name']} {student['last_name']}"
    print(f"👤 Selected student: {student_name} (ID: {student_id})")
    
    # Create equipment invoice
    current_date = datetime.now()
    payment_period = current_date.strftime("%Y-%m-01")  # First day of current month
    
    payload = {
        "student_id": student_id,
        "payment_period": payment_period,  # This should be a date string like "2026-02-01"
        "invoice_items": [
            {
                "item_type": "equipment",
                "description": "Форма и гетры для тренировок",
                "quantity": 1,
                "unit_price": 1500.00
            }
        ],
        "notes": "Тестовая покупка экипировки"
    }
    
    print(f"📤 Sending payload: {json.dumps(payload, indent=2, ensure_ascii=False)}")
    
    # Create the invoice
    response = requests.post(f"{BASE_URL}/api/v1/payments/manual-invoice", json=payload, headers=headers)
    
    if response.status_code == 200:
        result = response.json()
        print(f"✅ Equipment invoice created successfully!")
        print(f"   Invoice ID: {result['id']}")
        print(f"   Total Amount: {result['total_amount']} MDL")
        print(f"   Status: {result['status']}")
        print(f"   Student: {result['student_name']}")
        print(f"   Items: {len(result['invoice_items'])}")
        for item in result['invoice_items']:
            print(f"     - {item['description']}: {item['quantity']} x {item['unit_price']} = {item['total_price']} MDL")
        return True
    else:
        print(f"❌ Failed to create equipment invoice")
        print(f"   Status: {response.status_code}")
        print(f"   Response: {response.text}")
        return False

if __name__ == "__main__":
    success = test_equipment_invoice()
    if success:
        print("\n🎉 Equipment invoice creation test passed!")
    else:
        print("\n💥 Equipment invoice creation test failed!")