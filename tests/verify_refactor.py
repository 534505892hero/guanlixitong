
import requests
import time
import subprocess
import os
import sys
import json

SERVER_PORT = 8090
BASE_URL = f"http://localhost:{SERVER_PORT}"

def run_test():
    print(f"[*] Starting server on port {SERVER_PORT}...")
    # Start server
    env = os.environ.copy()
    env['PORT'] = str(SERVER_PORT)
    server_proc = subprocess.Popen([sys.executable, 'server.py'], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    
    try:
        time.sleep(2) # Wait for startup

        print("[*] Testing Auth...")
        # 1. Login
        resp = requests.post(f"{BASE_URL}/api/auth/login", json={"username": "admin", "password": "Admin@2026"})
        if resp.status_code != 200:
            print(f"[-] Login failed: {resp.text}")
            return
        token = resp.json()['token']
        headers = {'Authorization': f'Bearer {token}'}
        print("[+] Login success.")

        # 2. Upload File
        print("[*] Testing File Upload...")
        files = {'file': ('test.txt', b'Hello World')}
        resp = requests.post(f"{BASE_URL}/api/upload", headers={'Authorization': f'Bearer {token}'}, files=files)
        if resp.status_code != 200:
            print(f"[-] Upload failed: {resp.text}")
            return
        file_url = resp.json()['url']
        print(f"[+] Upload success: {file_url}")

        # 3. Sync Patent Data
        print("[*] Testing Patent Sync...")
        patents = [{
            "title": "Test Patent",
            "type": "Invention",
            "application_no": "CN123456",
            "inventors": "Admin",
            "application_date": "2023-01-01",
            "status": "Granted",
            "application_file": file_url,
            "certificate_file": file_url,
            "extra_field": "some data"
        }]
        resp = requests.post(f"{BASE_URL}/api/patents", headers=headers, json=patents)
        if resp.status_code != 200:
            print(f"[-] Sync failed: {resp.text}")
            return
        print("[+] Sync success.")

        # 4. Pull Data (Verification)
        print("[*] Verifying Data Persistence...")
        resp = requests.get(f"{BASE_URL}/api/patents", headers=headers)
        data = resp.json()
        if len(data) == 1 and data[0]['title'] == "Test Patent" and data[0]['application_file'] == file_url:
            print("[+] Data verification passed!")
        else:
            print(f"[-] Data mismatch: {data}")
            return

        # 5. Logout
        print("[*] Testing Logout...")
        requests.post(f"{BASE_URL}/api/auth/logout", headers=headers)
        
        # 6. Verify Token Invalid
        resp = requests.get(f"{BASE_URL}/api/patents", headers=headers)
        if resp.status_code == 401:
            print("[+] Logout success (Token invalidated).")
        else:
            print(f"[-] Logout failed, still access: {resp.status_code}")

    except Exception as e:
        print(f"[-] Test Exception: {e}")
    finally:
        server_proc.terminate()
        print("[*] Server stopped.")

if __name__ == "__main__":
    run_test()
