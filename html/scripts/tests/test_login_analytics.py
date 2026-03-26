
import requests
import json
import random
from datetime import datetime

BASE_URL = "http://localhost:8000/api/v1"

def login(username, password):
    print(f"Trying login with {username}...")
    try:
        response = requests.post(f"{BASE_URL}/auth/login", data={"username": username, "password": password})
        if response.status_code == 200:
            print("Login success!")
            return response.json()["access_token"]
        print(f"Login failed: {response.text}")
    except Exception as e:
        print(f"Connection error: {e}")
    return None

def main():
    usernames = ["+37369000005", "069000005", "37369000005", "69000005", "Gennady"]
    password = "Gennadiy2026!"
    token = None
    
    for u in usernames:
        token = login(u, password)
        if token:
            break
            
    if not token:
        print("All login attempts failed.")
        return

    # Create entities
    headers = {"Authorization": f"Bearer {token}"}
    
    # Check if student exists or create
    # ... (simplified for now to just check analytics first)
    
    print("\n--- Checking Analytics Endpoint ---")
    resp = requests.get(f"{BASE_URL}/analytics/revenue-by-service-type", headers=headers)
    if resp.status_code == 200:
        print("Analytics Endpoint Works!")
        print(json.dumps(resp.json(), indent=2, ensure_ascii=False))
    else:
        print(f"Analytics Endpoint Failed: {resp.status_code} {resp.text}")

if __name__ == "__main__":
    main()
