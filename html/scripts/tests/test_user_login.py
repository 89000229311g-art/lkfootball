
import requests
import json

BASE_URL = "http://0.0.0.0:8000/api/v1"

def test_user_flow():
    print("🚀 Starting User Flow Test...")
    
    # 1. Login
    print("\n🔑 Logging in...")
    login_data = {
        "username": "+37376000056",  # Parent we targeted
        "password": "password123"
    }
    
    try:
        response = requests.post(f"{BASE_URL}/auth/login", data=login_data)
        if response.status_code != 200:
            print(f"❌ Login failed: {response.status_code} - {response.text}")
            return
            
        token = response.json().get("access_token")
        print(f"✅ Login successful! Token received.")
        
        headers = {
            "Authorization": f"Bearer {token}"
        }
        
        # 2. Get Notifications
        print("\n🔔 Fetching Notifications...")
        notif_response = requests.get(f"{BASE_URL}/messages/notifications", headers=headers)
        
        if notif_response.status_code == 200:
            notifications = notif_response.json()
            print(f"✅ Notifications fetched: {len(notifications)} found.")
            for n in notifications:
                print(f"   - [ID: {n['id']}] {n['content'][:100]}...")
                
            if len(notifications) > 0:
                print("\n🎉 SUCCESS: The user CAN see notifications via API.")
            else:
                print("\n⚠️ WARNING: API returned 0 notifications (maybe cleared?).")
        else:
            print(f"❌ Failed to fetch notifications: {notif_response.status_code} - {notif_response.text}")

        # 3. Check Unread Count
        print("\n🔢 Checking Unread Count...")
        count_response = requests.get(f"{BASE_URL}/messages/notifications/unread", headers=headers)
        if count_response.status_code == 200:
            print(f"✅ Unread count: {count_response.json()}")
        else:
            print(f"❌ Failed to get count: {count_response.status_code}")

    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == "__main__":
    test_user_flow()
