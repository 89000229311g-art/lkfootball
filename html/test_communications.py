import requests
import sys

BASE_URL = "http://localhost:8000/api/v1"

def login(username, password):
    url = f"{BASE_URL}/auth/login"
    payload = {"username": username, "password": password}
    try:
        response = requests.post(url, data=payload)
        if response.status_code == 200:
            print(f"✅ Login successful for {username}")
            return response.json()["access_token"]
        else:
            print(f"❌ Login failed for {username}: {response.text}")
            return None
    except Exception as e:
        print(f"❌ Connection error during login for {username}: {e}")
        return None

def send_support_message(token, sender_role, message_text):
    url = f"{BASE_URL}/messages/support"
    headers = {"Authorization": f"Bearer {token}"}
    payload = {"content": message_text}
    
    print(f"\n📤 Sending support message from {sender_role}...")
    try:
        response = requests.post(url, json=payload, headers=headers)
        if response.status_code == 200:
            print(f"✅ Message sent successfully from {sender_role}")
            print(f"Response: {response.json()}")
            return True
        else:
            print(f"❌ Failed to send message from {sender_role}")
            print(f"Status: {response.status_code}")
            print(f"Response: {response.text}")
            return False
    except Exception as e:
        print(f"❌ Connection error sending message from {sender_role}: {e}")
        return False

def main():
    print("🚀 Starting Communication Tests\n")
    
    # Test 1: Parent -> Support
    parent_token = login("parent", "123")
    if parent_token:
        send_support_message(parent_token, "PARENT", "Hello support, this is a test message from a parent.")
    else:
        print("⚠️ Skipping Parent test due to login failure")

    # Test 2: Coach -> Support
    coach_token = login("coach", "123")
    if coach_token:
        send_support_message(coach_token, "COACH", "Hello support, this is a test message from a coach.")
    else:
        print("⚠️ Skipping Coach test due to login failure")

if __name__ == "__main__":
    main()
