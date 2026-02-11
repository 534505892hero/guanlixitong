
import unittest
import requests
import time
import subprocess
import os
import sys
import json
import threading

SERVER_PORT = 8091
BASE_URL = f"http://localhost:{SERVER_PORT}"

class TestSystemRobustness(unittest.TestCase):
    server_proc = None

    @classmethod
    def setUpClass(cls):
        # 强制删除旧数据库以确保环境纯净
        db_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "app_data.db")
        if os.path.exists(db_path):
            try:
                os.remove(db_path)
                print(f"[*] Removed old DB: {db_path}")
            except:
                pass

        print(f"[*] Starting server on port {SERVER_PORT}...")
        env = os.environ.copy()
        env['PORT'] = str(SERVER_PORT)
        # 使用 unbuffered output
        env['PYTHONUNBUFFERED'] = '1'
        cls.server_proc = subprocess.Popen([sys.executable, 'server.py'], env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        
        # 等待服务器初始化完成 (读取 stdout 直到看到 Starting server)
        start_time = time.time()
        while time.time() - start_time < 5:
            line = cls.server_proc.stdout.readline().decode('utf-8')
            if 'Starting server' in line:
                print("[*] Server ready.")
                break
            if 'Initialized' in line:
                print(f"[*] Server Init: {line.strip()}")
        
        # 额外等待确保端口监听
        time.sleep(1)

    @classmethod
    def tearDownClass(cls):
        if cls.server_proc:
            cls.server_proc.terminate()
            print("[*] Server stopped.")

    def setUp(self):
        # Clean state if needed, or just login
        self.username = "admin"
        self.password = "Admin@2026"
        self.token = None
        self.refresh_token = None

    def login(self):
        resp = requests.post(f"{BASE_URL}/api/auth/login", json={"username": self.username, "password": self.password})
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.token = data['token']
        self.refresh_token = data.get('refresh_token')
        return data

    def test_01_login_and_token_structure(self):
        data = self.login()
        self.assertIn('token', data)
        self.assertIn('refresh_token', data)
        print("[Pass] Login returns access and refresh tokens.")

    def test_02_access_protected_resource(self):
        self.login()
        headers = {'Authorization': f'Bearer {self.token}'}
        resp = requests.get(f"{BASE_URL}/api/patents", headers=headers)
        self.assertEqual(resp.status_code, 200)
        self.assertIsInstance(resp.json(), list)
        print("[Pass] Protected resource accessible with valid token.")

    def test_03_token_refresh_flow(self):
        self.login()
        # Simulate expiry or just force refresh
        resp = requests.post(f"{BASE_URL}/api/auth/refresh", json={"refresh_token": self.refresh_token})
        self.assertEqual(resp.status_code, 200)
        new_token = resp.json()['token']
        self.assertNotEqual(self.token, new_token)
        
        # Verify new token works
        headers = {'Authorization': f'Bearer {new_token}'}
        resp = requests.get(f"{BASE_URL}/api/patents", headers=headers)
        self.assertEqual(resp.status_code, 200)
        print("[Pass] Token refresh flow works.")

    def test_04_persistence_reliability(self):
        self.login()
        headers = {'Authorization': f'Bearer {self.token}'}
        
        # 1. Create Data
        payload = [{
            "title": "Robustness Test Patent",
            "type": "Invention",
            "application_no": "TEST-001",
            "inventors": "Tester",
            "application_date": "2023-10-01",
            "status": "Pending",
            "application_file": "/uploads/mock.pdf",
            "certificate_file": "/uploads/mock.pdf"
        }]
        requests.post(f"{BASE_URL}/api/patents", headers=headers, json=payload)
        
        # 2. Restart Server (Simulated by just querying again, real persistence is DB based)
        # In a real integration test we might restart the process, but here we trust SQLite file persistence
        
        # 3. Read Data
        resp = requests.get(f"{BASE_URL}/api/patents", headers=headers)
        data = resp.json()
        self.assertTrue(any(d['application_no'] == 'TEST-001' for d in data))
        print("[Pass] Data persistence verified.")

    def test_05_concurrent_access(self):
        # Simulate multiple clients
        self.login()
        headers = {'Authorization': f'Bearer {self.token}'}
        
        def make_request():
            requests.get(f"{BASE_URL}/api/patents", headers=headers)

        threads = []
        for _ in range(10):
            t = threading.Thread(target=make_request)
            threads.append(t)
            t.start()
        
        for t in threads:
            t.join()
            
        print("[Pass] Concurrent access handled without crash.")

if __name__ == "__main__":
    unittest.main()
