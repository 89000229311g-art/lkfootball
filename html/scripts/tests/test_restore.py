import requests
import json

BASE_URL = "http://localhost:8000/api/v1"

def test_restore_scenario():
    # 1. Setup: Login as Super Admin (Anatoly)
    print("\n--- 1. Login as Super Admin ---")
    super_login = {
        "username": "0669720567",
        "password": "20051990"
    }
    response = requests.post(f"{BASE_URL}/auth/login", data=super_login)
    if response.status_code != 200:
        print("❌ Failed to login as Super Admin")
        return
    token = response.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    
    # 2. Create User (Parent)
    print("\n--- 2. Create Parent User ---")
    phone = "+37360000001"
    
    # Check if exists first (cleanup)
    resp = requests.get(f"{BASE_URL}/auth/users?search={phone}", headers=headers)
    if resp.status_code == 200 and resp.json().get('data'):
        uid = resp.json()['data'][0]['id']
        requests.delete(f"{BASE_URL}/auth/users/{uid}", headers=headers)
        print("Cleaned up existing user")

    # Create Group for child
    # Just hardcode group_id 1 assuming it exists or handle error
    group_id = 1

    user_data = {
        "phone": phone,
        "password": "password123",
        "full_name": "Restore Test Parent",
        "role": "parent",
        "child_full_name": "Restore Child",
        "child_birth_date": "2015-01-01",
        "child_group_id": group_id
    }
    
    create_resp = requests.post(f"{BASE_URL}/auth/users", json=user_data, headers=headers)
    if create_resp.status_code != 200:
        print(f"❌ Failed to create user: {create_resp.text}")
        return
    
    user_id = create_resp.json()['id']
    print(f"✅ Created User ID: {user_id}")
    
    # 3. Delete User
    print("\n--- 3. Delete User ---")
    del_resp = requests.delete(f"{BASE_URL}/auth/users/{user_id}", headers=headers)
    if del_resp.status_code == 200:
        print("✅ User Deleted")
    else:
        print(f"❌ Delete failed: {del_resp.text}")
        return

    # 4. Try to Create User AGAIN with same phone
    print("\n--- 4. Create User AGAIN (Same Phone) ---")
    create_resp_2 = requests.post(f"{BASE_URL}/auth/users", json=user_data, headers=headers)
    
    if create_resp_2.status_code == 400:
        print("✅ Correctly rejected duplicate creation (Status 400)")
        print(f"   Message: {create_resp_2.json().get('detail')}")
    else:
        print(f"❌ Unexpected response: {create_resp_2.status_code} {create_resp_2.text}")

    # 5. Restore User
    print("\n--- 5. Restore User ---")
    restore_resp = requests.post(f"{BASE_URL}/auth/users/{user_id}/restore", headers=headers)
    if restore_resp.status_code == 200:
        print("✅ User Restored")
        # Check login
        login_data = {"username": phone, "password": "password123"}
        login_resp = requests.post(f"{BASE_URL}/auth/login", data=login_data)
        if login_resp.status_code == 200:
            print("✅ Login SUCCESS after restore")
        else:
            print(f"❌ Login failed after restore: {login_resp.status_code}")
    else:
        print(f"❌ Restore failed: {restore_resp.text}")

if __name__ == "__main__":
    test_restore_scenario()