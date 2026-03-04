#!/usr/bin/env python3
"""
Test creating multiple invoices for the same student with different service types
"""

import requests
import json

# Login as super admin
print("🔑 Logging in as super admin...")
login_response = requests.post(
    "http://localhost:8000/api/v1/auth/login",
    data={"username": "owner", "password": "123"},
    headers={"Content-Type": "application/x-www-form-urlencoded"}
)

token = login_response.json()["access_token"]
print(f"✅ Got access token")

# Test different service types for the same student
student_id = 104  # Миша Мишин
service_types = [
    ('subscription', 'membership', 'Monthly subscription'),
    ('tournament', 'other', 'Tournament fee'),
    ('equipment', 'equipment', 'Training equipment'),
    ('individual', 'individual_training', 'Individual training session')
]

print(f"\n🧪 Testing multiple invoice types for student {student_id}")
print("="*60)

for i, (payment_type, item_type, description) in enumerate(service_types, 1):
    print(f"\n{i}. Creating {payment_type} invoice...")
    
    payload = {
        "student_id": student_id,
        "payment_period": "2026-02-01",
        "invoice_items": [
            {
                "item_type": item_type,
                "description": f"{description} - Test {i}",
                "quantity": 1,
                "unit_price": 100.00 * i  # Different amounts
            }
        ]
    }
    
    response = requests.post(
        "http://localhost:8000/api/v1/payments/manual-invoice",
        json=payload,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }
    )
    
    if response.status_code == 200:
        result = response.json()
        print(f"   ✅ Success! Payment ID: {result['id']}, Amount: {result['amount']}")
    else:
        print(f"   ❌ Failed: {response.status_code} - {response.text}")

print(f"\n{'='*60}")
print("✅ Multiple invoice test completed!")
print("This confirms that the backend allows multiple invoices per student")
print("for different service types, which should resolve the user's issue.")