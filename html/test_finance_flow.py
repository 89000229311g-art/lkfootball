
import requests
import json
import random
import string
from datetime import datetime, date

BASE_URL = "http://localhost:8000/api/v1"

# 1. Login as Admin (Owner)
def login(username, password):
    response = requests.post(f"{BASE_URL}/auth/login", data={"username": username, "password": password})
    if response.status_code != 200:
        print(f"Login failed: {response.text}")
        return None
    return response.json()["access_token"]

# 2. Create Test Student & Parent
def create_test_entities(token):
    headers = {"Authorization": f"Bearer {token}"}
    
    # Get a group first
    groups_resp = requests.get(f"{BASE_URL}/groups/", headers=headers)
    group_id = 1
    if groups_resp.status_code == 200:
        groups = groups_resp.json().get("data", [])
        if groups:
            group_id = groups[0]["id"]

    # Create Parent User
    parent_email = f"parent_test_{random.randint(1000,9999)}@example.com"
    parent_phone = f"+37369{random.randint(100000,999999)}"
    parent_data = {
        "username": parent_phone,
        "password": "password123",
        "email": parent_email,
        "full_name": "Test Parent Finance",
        "role": "parent",
        "phone": parent_phone,
        "child_full_name": "TestStudent Finance",
        "child_birth_date": "2015-01-01",
        "child_group_id": group_id
    }
    
    # Check if user exists (mock check or just try create)
    # We'll just try to create and ignore 400 if exists (or randomize)
    
    resp = requests.post(f"{BASE_URL}/auth/users", json=parent_data, headers=headers)
    if resp.status_code in [200, 201]:
        parent_id = resp.json()["id"]
        print(f"Created Parent: {parent_id}")
    else:
        # Try to find if exists
        print(f"Parent creation failed/exists: {resp.text}")
        return None, None

    # Create Student
    student_data = {
        "first_name": "TestStudent",
        "last_name": "Finance",
        "dob": "2015-01-01",
        "parent_phone": parent_phone, # Link via phone
        "gender": "Male"
    }
    resp = requests.post(f"{BASE_URL}/students/", json=student_data, headers=headers)
    if resp.status_code in [200, 201]:
        student_id = resp.json()["id"]
        print(f"Created Student: {student_id}")
    else:
        print(f"Student creation failed: {resp.text}")
        return None, None
        
    return parent_id, student_id

# 3. Create Invoices (Manual Invoice Creation)
def create_invoices(token, student_id):
    headers = {"Authorization": f"Bearer {token}"}
    
    items = [
        {"type": "membership", "amount": 1000, "desc": "Abonament Oct"},
        {"type": "individual_training", "amount": 500, "desc": "Indiv Training 1"},
        {"type": "equipment", "amount": 1500, "desc": "Uniform Kit"},
        {"type": "other", "amount": 200, "desc": "Registration Fee"}
    ]
    
    invoice_ids = []
    
    for item in items:
        # Using manual invoice endpoint
        # Correct payload based on schema ManualInvoiceCreate
        payload = {
            "student_id": student_id,
            "payment_period": datetime.now().strftime("%Y-%m-01"), # Must be YYYY-MM-DD
            "invoice_items": [
                {
                    "item_type": item["type"],
                    "description": item["desc"],
                    "quantity": 1,
                    "unit_price": item["amount"]
                }
            ],
            "notes": item["desc"]
        }
        
        resp = requests.post(f"{BASE_URL}/payments/manual-invoice", json=payload, headers=headers)
        if resp.status_code == 200:
            inv = resp.json()
            print(f"Created Invoice {inv['id']} for {item['type']}")
            invoice_ids.append(inv['id'])
        else:
            print(f"Failed to create invoice {item['type']}: {resp.text}")
            
    return invoice_ids

# 4. Verify Pending
def verify_pending(token, student_id):
    headers = {"Authorization": f"Bearer {token}"}
    resp = requests.get(f"{BASE_URL}/payments/student/{student_id}/invoices", headers=headers)
    if resp.status_code == 200:
        invoices = resp.json()
        pending = [i for i in invoices if i['status'] == 'pending']
        print(f"Found {len(pending)} pending invoices for student")
        return len(pending) > 0
    else:
        print(f"Failed to get invoices: {resp.status_code} {resp.text}")
    return False

# 5. Pay Invoices (to test Analytics)
def pay_invoices(token, invoice_ids):
    headers = {"Authorization": f"Bearer {token}"}
    for inv_id in invoice_ids:
        # Confirm payment
        payload = {"status": "completed", "method": "cash"}
        resp = requests.put(f"{BASE_URL}/payments/{inv_id}", json=payload, headers=headers)
        if resp.status_code == 200:
            print(f"Paid Invoice {inv_id}")
        else:
            print(f"Failed to pay {inv_id}: {resp.text}")

# 6. Verify Analytics
def verify_analytics(token):
    headers = {"Authorization": f"Bearer {token}"}
    # Check revenue by service type
    resp = requests.get(f"{BASE_URL}/analytics/revenue-by-service-type", headers=headers)
    if resp.status_code == 200:
        data = resp.json()
        print("Analytics Data:", json.dumps(data, indent=2, ensure_ascii=False))
        return True
    else:
        print(f"Analytics failed: {resp.text}")
        return False

def main():
    token = login("+37369000005", "Gennadiy2026!") # Using credential from memory
    if not token:
        # Try fallback if owner name changed
        token = login("admin", "admin") 
        
    if not token:
        print("Cannot login")
        return

    parent_id, student_id = create_test_entities(token)
    if not student_id:
        return

    print("\n--- Creating Invoices ---")
    invoice_ids = create_invoices(token, student_id)
    
    print("\n--- Verifying Pending ---")
    verify_pending(token, student_id)
    
    print("\n--- Paying Invoices ---")
    pay_invoices(token, invoice_ids)
    
    print("\n--- Verifying Analytics ---")
    verify_analytics(token)

if __name__ == "__main__":
    main()
