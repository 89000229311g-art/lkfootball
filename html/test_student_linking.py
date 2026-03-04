import requests
import json

BASE_URL = "http://localhost:8000/api/v1"
ADMIN_PHONE = "+37369000000"
ADMIN_PASS = "admin123"

def test_student_parent_linking():
    # 1. Login as Admin
    print("Logging in...")
    login_resp = requests.post(f"{BASE_URL}/auth/login", data={"username": ADMIN_PHONE, "password": ADMIN_PASS})
    if login_resp.status_code != 200:
        print(f"Login failed: {login_resp.text}")
        return
    token = login_resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 2. Create a Parent User
    parent_phone = "+37311122233"
    print(f"Creating parent user {parent_phone}...")
    
    # Check if exists
    users = requests.get(f"{BASE_URL}/auth/users", headers=headers).json()
    existing = next((u for u in users if u["phone"] == parent_phone), None)
    if existing:
        requests.delete(f"{BASE_URL}/auth/users/{existing['id']}", headers=headers)
        print("Deleted existing user.")

    parent_data = {
        "phone": parent_phone,
        "password": "password123",
        "full_name": "Test Link Parent",
        "role": "parent"
    }
    create_user_resp = requests.post(f"{BASE_URL}/auth/users", json=parent_data, headers=headers)
    if create_user_resp.status_code != 200:
        print(f"Failed to create user: {create_user_resp.text}")
        return
    parent_id = create_user_resp.json()["id"]
    print(f"Parent created. ID: {parent_id}")

    # 3. Create a Student with parent_phone
    print("Creating student with parent_phone...")
    student_data = {
        "first_name": "TestChild",
        "last_name": "Link",
        "parent_phone": parent_phone,
        "group_id": None
    }
    create_student_resp = requests.post(f"{BASE_URL}/students/", json=student_data, headers=headers)
    if create_student_resp.status_code != 200:
        print(f"Failed to create student: {create_student_resp.text}")
        return
    student = create_student_resp.json()
    student_id = student["id"]
    print(f"Student created. ID: {student_id}")

    # 4. Verify Link
    print("Verifying link...")
    # Get student details
    get_student_resp = requests.get(f"{BASE_URL}/students/{student_id}", headers=headers)
    student_details = get_student_resp.json()
    
    guardians = student_details.get("guardians", [])
    linked = any(g["id"] == parent_id for g in guardians)
    
    if linked:
        print("SUCCESS: Student is linked to Parent!")
    else:
        print("FAILURE: Student is NOT linked to Parent.")
        print(f"Guardians found: {guardians}")

    # Cleanup
    print("Cleaning up...")
    requests.delete(f"{BASE_URL}/students/{student_id}", headers=headers)
    requests.delete(f"{BASE_URL}/auth/users/{parent_id}", headers=headers)

if __name__ == "__main__":
    test_student_parent_linking()
