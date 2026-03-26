import requests
import json

BASE_URL = "http://localhost:8000/api/v1"
PHONE = "+37376624536"
PASSWORD = "admin123"

def test_users_lifecycle():
    # 1. Login
    print("Logging in...")
    login_data = {
        "username": PHONE,
        "password": PASSWORD
    }
    resp = requests.post(f"{BASE_URL}/auth/login", data=login_data)
    if resp.status_code != 200:
        print(f"Login failed: {resp.text}")
        return
    
    token = resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    print("Login successful.")

    # 2. Create User
    print("Creating test user...")
    test_user_data = {
        "phone": "+37399999999",
        "password": "password123",
        "full_name": "Test Parent",
        "role": "parent"
    }
    resp = requests.post(f"{BASE_URL}/auth/users", json=test_user_data, headers=headers)
    if resp.status_code == 400 and "already exists" in resp.text:
        print("User already exists, trying to find it...")
        # Try to find user ID
        resp = requests.get(f"{BASE_URL}/auth/users", headers=headers)
        users = resp.json()
        test_user = next((u for u in users if u["phone"] == test_user_data["phone"]), None)
        if not test_user:
            print("Could not find existing user.")
            return
        user_id = test_user["id"]
        print(f"Found existing user ID: {user_id}")
    elif resp.status_code != 200:
        print(f"Create failed: {resp.text}")
        return
    else:
        user_id = resp.json()["id"]
        print(f"User created. ID: {user_id}")

    # 3. Update User
    print("Updating user...")
    update_data = {
        "full_name": "Test Parent Updated"
    }
    resp = requests.put(f"{BASE_URL}/auth/users/{user_id}", json=update_data, headers=headers)
    if resp.status_code != 200:
        print(f"Update failed: {resp.text}")
    else:
        print("Update successful.")
        print(f"Updated data: {resp.json()}")

    # 4. Delete User
    print("Deleting user...")
    resp = requests.delete(f"{BASE_URL}/auth/users/{user_id}", headers=headers)
    if resp.status_code != 204:
        print(f"Delete failed: {resp.status_code} {resp.text}")
    else:
        print("Delete successful.")

if __name__ == "__main__":
    test_users_lifecycle()
