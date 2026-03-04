import requests

def test_login():
    url = "http://localhost:8000/api/v1/auth/login"
    
    # Payload as sent by frontend (form-urlencoded)
    payload = {
        "username": "+37379000002",
        "password": "coach123"
    }
    
    print(f"Sending POST to {url} with {payload}")
    
    try:
        response = requests.post(url, data=payload)
        
        print(f"Status Code: {response.status_code}")
        print(f"Response Body: {response.text}")
        
        if response.status_code == 200:
            print("✅ LOGIN SUCCESSFUL")
        else:
            print("❌ LOGIN FAILED")
            
    except Exception as e:
        print(f"❌ CONNECTION ERROR: {e}")

if __name__ == "__main__":
    test_login()
