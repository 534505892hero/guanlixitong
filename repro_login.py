import requests
import json
import os

# Configuration
BASE_URL = "http://localhost:80"  # Assuming local server is running on port 80
# If you want to test against the remote server, use "http://47.85.22.110" 
# But for debugging code logic, localhost is better. 
# Since I cannot access remote server logs, I must verify local logic first.

def test_login(username, password):
    url = f"{BASE_URL}/api/login"
    payload = {
        "username": username,
        "password": password
    }
    headers = {
        "Content-Type": "application/json"
    }
    
    print(f"[*] Testing login with user='{username}' pass='{password}'")
    try:
        response = requests.post(url, json=payload, headers=headers, timeout=5)
        print(f"    Status Code: {response.status_code}")
        print(f"    Response: {response.text}")
        
        if response.status_code == 200:
            print("    [SUCCESS] Login successful!")
            return True
        else:
            print("    [FAILED] Login failed.")
            return False
    except Exception as e:
        print(f"    [ERROR] Connection failed: {e}")
        return False

if __name__ == "__main__":
    # Test 1: Default Credentials
    print("--- Test Case 1: Default Credentials ---")
    test_login("admin", "Admin@2026")
    
    # Test 2: Wrong Password
    print("\n--- Test Case 2: Wrong Password ---")
    test_login("admin", "WrongPass")
    
    # Test 3: Wrong Username
    print("\n--- Test Case 3: Wrong Username ---")
    test_login("user", "Admin@2026")
