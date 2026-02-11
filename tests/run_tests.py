import unittest
import urllib.request
import urllib.error
import json
import threading
import time
import subprocess
import os
import sys

# Configuration
TEST_PORT = 8080
BASE_URL = f"http://localhost:{TEST_PORT}"
DB_FILE = "app_data.db"
SERVER_SCRIPT = "server.py"

class TestResearchSystem(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # 1. Reset Database Password
        try:
            import reset_password
            reset_password.reset_password()
        except ImportError:
            # If we can't import, assume it's in the same dir and try to run it or just rely on existing state
            pass
        except Exception as e:
            print(f"Warning: Password reset failed: {e}")

        # 2. Start Server
        cls.server_process = subprocess.Popen(
            [sys.executable, SERVER_SCRIPT],
            env={**os.environ, "PORT": str(TEST_PORT)},
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL
        )
        time.sleep(2) # Wait for server startup

    @classmethod
    def tearDownClass(cls):
        if cls.server_process:
            cls.server_process.terminate()
            cls.server_process.wait()
        
        # Reset password again to be safe
        try:
            import reset_password
            reset_password.reset_password()
        except:
            pass

    def _request(self, method, endpoint, data=None, headers={}):
        url = f"{BASE_URL}{endpoint}"
        req = urllib.request.Request(url, method=method)
        for k, v in headers.items():
            req.add_header(k, v)
        
        if data:
            json_data = json.dumps(data).encode('utf-8')
            req.add_header('Content-Type', 'application/json')
            req.data = json_data

        try:
            with urllib.request.urlopen(req) as response:
                return {
                    "status": response.status,
                    "body": json.loads(response.read().decode('utf-8')),
                    "headers": response.headers
                }
        except urllib.error.HTTPError as e:
            body_bytes = e.read()
            body = {}
            if body_bytes:
                try:
                    body = json.loads(body_bytes.decode('utf-8'))
                except:
                    pass
            return {
                "status": e.code,
                "body": body,
                "error": str(e)
            }
        except Exception as e:
            return {"status": 0, "error": str(e)}

    def test_01_login_success(self):
        """Test Valid Login"""
        print("\n[Test] Login with valid credentials...")
        res = self._request("POST", "/api/login", {
            "username": "admin",
            "password": "Admin@2026"
        })
        self.assertEqual(res['status'], 200)
        self.assertIn("token", res['body'])
        return res['body']['token']

    def test_02_login_fail(self):
        """Test Invalid Password"""
        print("\n[Test] Login with invalid password...")
        res = self._request("POST", "/api/login", {
            "username": "admin",
            "password": "WrongPassword"
        })
        self.assertEqual(res['status'], 401)

    def test_03_sql_injection_login(self):
        """Test SQL Injection on Login"""
        print("\n[Test] SQL Injection attempt on login...")
        payloads = ["' OR '1'='1", "admin' --", "admin' #"]
        for p in payloads:
            res = self._request("POST", "/api/login", {
                "username": p,
                "password": "any"
            })
            # Should fail because code checks `if username != 'admin'`
            self.assertNotEqual(res['status'], 200)

    def test_04_change_password_flow(self):
        """Test Change Password Flow"""
        print("\n[Test] Change Password Flow...")
        
        # 1. Login to get token
        login_res = self._request("POST", "/api/login", {
            "username": "admin",
            "password": "Admin@2026"
        })
        token = login_res['body']['token']
        headers = {"Authorization": f"Bearer {token}"}

        # 2. Try change with wrong old password
        res = self._request("POST", "/api/change_password", {
            "old_password": "WrongOldPassword",
            "new_password": "NewSecurePassword123"
        }, headers)
        self.assertEqual(res['status'], 401)

        # 3. Change success
        res = self._request("POST", "/api/change_password", {
            "old_password": "Admin@2026",
            "new_password": "NewSecurePassword123"
        }, headers)
        self.assertEqual(res['status'], 200)

        # 4. Verify old password no longer works
        res = self._request("POST", "/api/login", {
            "username": "admin",
            "password": "Admin@2026"
        })
        self.assertEqual(res['status'], 401)

        # 5. Verify new password works
        res = self._request("POST", "/api/login", {
            "username": "admin",
            "password": "NewSecurePassword123"
        })
        self.assertEqual(res['status'], 200)

    def test_05_unauthorized_access(self):
        """Test Unauthorized Access to Data API"""
        print("\n[Test] Unauthorized Access...")
        res = self._request("GET", "/api/data")
        self.assertEqual(res['status'], 401)

    def test_06_concurrency(self):
        """Test Concurrency / Load"""
        print("\n[Test] Concurrency (50 requests)...")
        # Get a valid token first (password is currently NewSecurePassword123 from prev test)
        # Note: Previous test order matters. 
        # But unit tests order isn't guaranteed unless sorted. 
        # To be safe, I'll reset password at start of this test or just login with whatever works.
        # Actually, unittest runs alphabetically by default. test_06 comes after test_04.
        
        # Re-login with new password
        login_res = self._request("POST", "/api/login", {
            "username": "admin",
            "password": "NewSecurePassword123"
        })
        
        # If test_04 failed or wasn't run, this might fail. 
        # But let's assume sequential execution for this script.
        if login_res['status'] != 200:
            # Fallback to default if test_04 didn't run
            login_res = self._request("POST", "/api/login", {
                "username": "admin",
                "password": "Admin@2026"
            })
            
        token = login_res['body']['token']
        headers = {"Authorization": f"Bearer {token}"}

        def make_request():
            self._request("GET", "/api/data", headers=headers)

        threads = []
        start_time = time.time()
        for _ in range(50):
            t = threading.Thread(target=make_request)
            threads.append(t)
            t.start()
        
        for t in threads:
            t.join()
        
        duration = time.time() - start_time
        print(f"    Finished 50 requests in {duration:.2f}s")
        self.assertLess(duration, 5.0) # Should be fast locally

if __name__ == "__main__":
    unittest.main()
