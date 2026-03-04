import requests
import json

API_URL = "http://localhost:8000/api/v1"

# We need a token. I'll assume I can login or use an existing token if available.
# Or I can check `debug_auth.py` or similar to get a token.
# Let's try to login as super admin first.

def test_payments():
    try:
        # 1. Login
        print("Logging in...")
        login_data = {
            "username": "+37376624536", # Owner
            "password": "123456"
        }
        # The endpoint is /auth/login
        response = requests.post(f"{API_URL}/auth/login", data=login_data)
        if response.status_code != 200:
            print(f"Login failed: {response.text}")
            return
        
        token = response.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        print("Login successful.")

        # 2. Get Payments
        print("Fetching payments...")
        response = requests.get(f"{API_URL}/payments/", headers=headers)
        if response.status_code == 200:
            print(f"Successfully fetched {len(response.json())} payments.")
            print(json.dumps(response.json()[:1], indent=2))
        else:
            print(f"Failed to fetch payments: {response.status_code}")
            print(response.text)

    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    test_payments()
