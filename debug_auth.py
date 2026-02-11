
import requests
import json
import sys

BASE_URL = "http://localhost"
# Adjust port if necessary, user environment suggests standard http server potentially on port 80 or similar, 
# but server.py says int(os.environ.get('PORT', 80)). 
# I'll try to find where the server is running.
# The user's previous logs showed http://47.85.22.110/api/login which is remote.
# But user also said "在本地运行看下效果". 
# If local, it might be localhost:8000 or similar.
# I'll assume localhost:80 for now based on server.py default, but will try to detect.

def test_login_and_auth():
    print(f"[*] Testing against {BASE_URL}...")
    
    # 1. Login
    login_url = f"{BASE_URL}/api/login"
    try:
        resp = requests.post(login_url, json={"username": "admin", "password": "Admin@2026"})
        print(f"Login Response Status: {resp.status_code}")
        print(f"Login Response Body: {resp.text}")
        
        if resp.status_code != 200:
            print("[-] Login failed.")
            return

        data = resp.json()
        token = data.get("token")
        print(f"[+] Got Token: {token}")

        # 2. Check Data Access
        data_url = f"{BASE_URL}/api/data"
        headers = {"Authorization": f"Bearer {token}"}
        
        resp2 = requests.get(data_url, headers=headers)
        print(f"Data Access Status: {resp2.status_code}")
        
        if resp2.status_code == 200:
            print("[+] Data access successful!")
        else:
            print(f"[-] Data access failed: {resp2.text}")

    except Exception as e:
        print(f"[-] Connection failed: {e}")

if __name__ == "__main__":
    test_login_and_auth()
