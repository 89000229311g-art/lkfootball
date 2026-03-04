import requests

def test_coach_login():
    url = "http://localhost:8000/api/v1/auth/login"
    
    # Coach credentials from reset_passwords.py output
    username = "+37361000003"
    password = "coach123"
    
    payload = {
        "username": username,
        "password": password
    }
    
    print(f"Attempting login for Coach: {username} with password: {password}")
    
    try:
        response = requests.post(url, data=payload)
        
        print(f"Status Code: {response.status_code}")
        
        if response.status_code == 200:
            token_data = response.json()
            print("✅ LOGIN SUCCESSFUL")
            print(f"Access Token: {token_data.get('access_token')[:20]}...")
            print(f"Role: {token_data.get('role', 'Unknown')}")
        else:
            print("❌ LOGIN FAILED")
            print(f"Response: {response.text}")
            
    except Exception as e:
        print(f"❌ CONNECTION ERROR: {e}")

if __name__ == "__main__":
    test_coach_login()
