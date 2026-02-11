import http.server
import socketserver
import sqlite3
import json
import os
import mimetypes
import hashlib
import secrets
import base64
from urllib.parse import urlparse

PORT = int(os.environ.get('PORT', 80))
# Ensure DB file is in the same directory as the script
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_FILE = os.path.join(BASE_DIR, "app_data.db")
DEFAULT_ADMIN_PASS = "Admin@2026"

def hash_password(password, salt=None):
    if not salt:
        salt = secrets.token_hex(16)
    # 使用 PBKDF2 进行哈希
    pwd_hash = hashlib.pbkdf2_hmac(
        'sha256', 
        password.encode('utf-8'), 
        salt.encode('utf-8'), 
        100000
    )
    return salt, pwd_hash.hex()

def verify_password(password, salt, stored_hash):
    _, pwd_hash = hash_password(password, salt)
    return pwd_hash == stored_hash

def init_db():
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    
    # 业务数据表
    c.execute('''CREATE TABLE IF NOT EXISTS user_data
                 (id INTEGER PRIMARY KEY AUTOINCREMENT,
                  key TEXT UNIQUE,
                  value TEXT,
                  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)''')
                  
    # 用户认证表
    c.execute('''CREATE TABLE IF NOT EXISTS admin_auth
                 (username TEXT PRIMARY KEY,
                  salt TEXT,
                  password_hash TEXT,
                  token TEXT)''')
    
    # 初始化默认管理员
    c.execute("SELECT * FROM admin_auth WHERE username='admin'")
    if not c.fetchone():
        salt, pwd_hash = hash_password(DEFAULT_ADMIN_PASS)
        c.execute("INSERT INTO admin_auth (username, salt, password_hash) VALUES (?, ?, ?)",
                  ('admin', salt, pwd_hash))
        print(f"[*] Initialized 'admin' user with default password.")
    
    conn.commit()
    conn.close()

class CustomHandler(http.server.SimpleHTTPRequestHandler):
    def send_json(self, data, code=200):
        self.send_response(code)
        self.send_header('Content-type', 'application/json')
        # 添加安全头
        self.send_header('X-Frame-Options', 'DENY')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode('utf-8'))

    def check_auth(self):
        auth_header = self.headers.get('Authorization')
        if not auth_header or not auth_header.startswith('Bearer '):
            print(f"[-] Auth failed: Missing or invalid header: {auth_header}")
            return False
        token = auth_header.split(' ')[1]
        
        conn = sqlite3.connect(DB_FILE)
        c = conn.cursor()
        c.execute("SELECT username FROM admin_auth WHERE token=?", (token,))
        user = c.fetchone()
        conn.close()
        
        if user:
            # print(f"[+] Auth success for user: {user[0]}")
            return True
        else:
            print(f"[-] Auth failed: Invalid token {token[:10]}...")
            return False

    def do_GET(self):
        parsed_path = urlparse(self.path)
        if parsed_path.path == '/api/data':
            if not self.check_auth():
                self.send_json({"error": "Unauthorized"}, 401)
                return
            self.handle_get_data()
        else:
            super().do_GET()

    def do_POST(self):
        parsed_path = urlparse(self.path)
        
        if parsed_path.path == '/api/login':
            self.handle_login()
        elif parsed_path.path == '/api/change_password':
            if not self.check_auth():
                self.send_json({"error": "Unauthorized"}, 401)
                return
            self.handle_change_password()
        elif parsed_path.path == '/api/data':
            if not self.check_auth():
                self.send_json({"error": "Unauthorized"}, 401)
                return
            self.handle_post_data()
        else:
            self.send_error(404, "Not Found")

    def handle_login(self):
        try:
            length = int(self.headers['Content-Length'])
            body = json.loads(self.rfile.read(length))
            username = body.get('username')
            password = body.get('password')
            
            conn = sqlite3.connect(DB_FILE)
            c = conn.cursor()
            # 支持 admin 用户名登录
            if username != 'admin':
                self.send_json({"error": "Invalid username"}, 401)
                conn.close()
                return

            c.execute("SELECT salt, password_hash FROM admin_auth WHERE username='admin'")
            row = c.fetchone()
            
            if row and verify_password(password, row[0], row[1]):
                token = secrets.token_urlsafe(32)
                c.execute("UPDATE admin_auth SET token=? WHERE username='admin'", (token,))
                conn.commit()
                self.send_json({"token": token})
            else:
                self.send_json({"error": "Invalid password"}, 401)
            conn.close()
        except Exception as e:
            self.send_json({"error": str(e)}, 500)

    def handle_change_password(self):
        try:
            length = int(self.headers['Content-Length'])
            body = json.loads(self.rfile.read(length))
            old_pass = body.get('old_password')
            new_pass = body.get('new_password')
            
            conn = sqlite3.connect(DB_FILE)
            c = conn.cursor()
            c.execute("SELECT salt, password_hash FROM admin_auth WHERE username='admin'")
            row = c.fetchone()
            
            if row and verify_password(old_pass, row[0], row[1]):
                salt, new_hash = hash_password(new_pass)
                # 修改密码后 Token 失效，需要重新登录
                c.execute("UPDATE admin_auth SET salt=?, password_hash=?, token=NULL WHERE username='admin'", 
                          (salt, new_hash))
                conn.commit()
                self.send_json({"status": "Password changed successfully"})
            else:
                self.send_json({"error": "Invalid old password"}, 401)
            conn.close()
        except Exception as e:
            self.send_json({"error": str(e)}, 500)

    def handle_get_data(self):
        try:
            conn = sqlite3.connect(DB_FILE)
            conn.row_factory = sqlite3.Row
            c = conn.cursor()
            c.execute("SELECT key, value FROM user_data")
            rows = c.fetchall()
            data = {row['key']: json.loads(row['value']) for row in rows}
            conn.close()
            self.send_json(data)
        except Exception as e:
            self.send_json({"error": str(e)}, 500)

    def handle_post_data(self):
        try:
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            data = json.loads(post_data.decode('utf-8'))
            
            conn = sqlite3.connect(DB_FILE)
            c = conn.cursor()
            for key, value in data.items():
                c.execute("INSERT OR REPLACE INTO user_data (key, value) VALUES (?, ?)", 
                          (key, json.dumps(value)))
            conn.commit()
            conn.close()
            self.send_json({"status": "success"})
        except Exception as e:
            self.send_json({"error": str(e)}, 500)

if __name__ == "__main__":
    init_db()
    mimetypes.add_type('application/javascript', '.js')
    mimetypes.add_type('text/css', '.css')
    
    # 允许地址重用，避免重启时 Port already in use
    socketserver.TCPServer.allow_reuse_address = True
    print(f"Starting server at http://localhost:{PORT}")
    with socketserver.TCPServer(("", PORT), CustomHandler) as httpd:
        httpd.serve_forever()
