import http.server
import socketserver
import sqlite3
import json
import os
import mimetypes
import hashlib
import secrets
import base64
import cgi
import shutil
import time
from urllib.parse import urlparse, parse_qs

PORT = int(os.environ.get('PORT', 80))
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_FILE = os.path.join(BASE_DIR, "app_data.db")
UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")
DEFAULT_ADMIN_PASS = "Admin@2026"

# Ensure upload dir exists
if not os.path.exists(UPLOAD_DIR):
    os.makedirs(UPLOAD_DIR)

def hash_password(password, salt=None):
    if not salt:
        salt = secrets.token_hex(16)
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
    
    # 1. Users Table
    c.execute('''CREATE TABLE IF NOT EXISTS users
                 (id INTEGER PRIMARY KEY AUTOINCREMENT,
                  username TEXT UNIQUE,
                  salt TEXT,
                  password_hash TEXT,
                  token TEXT,
                  token_expiry REAL,
                  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)''')
                  
    # 2. Software Copyrights Table
    c.execute('''CREATE TABLE IF NOT EXISTS software_copyrights
                 (id INTEGER PRIMARY KEY AUTOINCREMENT,
                  user_id INTEGER,
                  name TEXT,
                  version TEXT,
                  registration_no TEXT,
                  owner TEXT,
                  develop_date TEXT,
                  publish_status TEXT,
                  file_path TEXT,
                  extra_data TEXT,
                  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                  FOREIGN KEY(user_id) REFERENCES users(id))''')

    # 3. Papers Table
    c.execute('''CREATE TABLE IF NOT EXISTS papers
                 (id INTEGER PRIMARY KEY AUTOINCREMENT,
                  user_id INTEGER,
                  title TEXT,
                  journal TEXT,
                  authors TEXT,
                  publish_date TEXT,
                  type TEXT,
                  status TEXT,
                  file_path TEXT,
                  extra_data TEXT,
                  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                  FOREIGN KEY(user_id) REFERENCES users(id))''')

    # 4. Patents Table
    c.execute('''CREATE TABLE IF NOT EXISTS patents
                 (id INTEGER PRIMARY KEY AUTOINCREMENT,
                  user_id INTEGER,
                  title TEXT,
                  type TEXT,
                  application_no TEXT,
                  application_date TEXT,
                  status TEXT,
                  inventors TEXT,
                  application_file TEXT,
                  certificate_file TEXT,
                  extra_data TEXT,
                  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                  FOREIGN KEY(user_id) REFERENCES users(id))''')
    
    # Initialize Admin
    c.execute("SELECT * FROM users WHERE username='admin'")
    if not c.fetchone():
        salt, pwd_hash = hash_password(DEFAULT_ADMIN_PASS)
        c.execute("INSERT INTO users (username, salt, password_hash) VALUES (?, ?, ?)",
                  ('admin', salt, pwd_hash))
        print(f"[*] Initialized 'admin' user.")
    
    conn.commit()
    conn.close()

class RequestHandler(http.server.SimpleHTTPRequestHandler):
    def send_json(self, data, code=200):
        self.send_response(code)
        self.send_header('Content-type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, DELETE')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode('utf-8'))

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, DELETE')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.end_headers()

    def get_user_from_token(self):
        auth_header = self.headers.get('Authorization')
        if not auth_header or not auth_header.startswith('Bearer '):
            return None
        token = auth_header.split(' ')[1]
        
        conn = sqlite3.connect(DB_FILE)
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        # Check token validity and expiry (simple 24h check)
        c.execute("SELECT * FROM users WHERE token=?", (token,))
        user = c.fetchone()
        conn.close()
        
        if user:
            # Check expiry (simple check, 86400 seconds)
            if time.time() > user['token_expiry']:
                return None
            return user
        return None

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        
        if path.startswith('/api/'):
            user = self.get_user_from_token()
            if not user and path not in ['/api/auth/login']:
                 self.send_json({"error": "Unauthorized"}, 401)
                 return

            if path == '/api/copyrights':
                self.handle_list('software_copyrights', user['id'])
            elif path == '/api/papers':
                self.handle_list('papers', user['id'])
            elif path == '/api/patents':
                self.handle_list('patents', user['id'])
            elif path == '/api/auth/check': # Simple auth check
                self.send_json({"status": "ok", "username": user['username']})
            else:
                self.send_error(404)
        else:
            super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path
        
        if path == '/api/auth/login':
            self.handle_login()
            return
        
        user = self.get_user_from_token()
        if not user:
            self.send_json({"error": "Unauthorized"}, 401)
            return

        if path == '/api/auth/logout':
            self.handle_logout(user['id'])
        elif path == '/api/auth/password':
            self.handle_change_password(user)
        elif path == '/api/upload':
            self.handle_upload(user['id'])
        elif path == '/api/copyrights':
            self.handle_sync('software_copyrights', user['id'])
        elif path == '/api/papers':
            self.handle_sync('papers', user['id'])
        elif path == '/api/patents':
            self.handle_sync('patents', user['id'])
        else:
            self.send_error(404)
            
    def do_DELETE(self):
         # Optional: Handle delete specific item if needed, but we use Full Sync for now
         self.send_error(405)

    def handle_login(self):
        try:
            length = int(self.headers['Content-Length'])
            body = json.loads(self.rfile.read(length))
            username = body.get('username')
            password = body.get('password')
            
            conn = sqlite3.connect(DB_FILE)
            c = conn.cursor()
            c.execute("SELECT id, salt, password_hash FROM users WHERE username=?", (username,))
            row = c.fetchone()
            
            if row and verify_password(password, row[1], row[2]):
                token = secrets.token_urlsafe(32)
                expiry = time.time() + 86400 # 24 hours
                c.execute("UPDATE users SET token=?, token_expiry=? WHERE id=?", (token, expiry, row[0]))
                conn.commit()
                self.send_json({"token": token, "username": username})
            else:
                self.send_json({"error": "Invalid credentials"}, 401)
            conn.close()
        except Exception as e:
            self.send_json({"error": str(e)}, 500)

    def handle_logout(self, user_id):
        conn = sqlite3.connect(DB_FILE)
        c = conn.cursor()
        c.execute("UPDATE users SET token=NULL WHERE id=?", (user_id,))
        conn.commit()
        conn.close()
        self.send_json({"status": "logged_out"})

    def handle_change_password(self, user):
        try:
            length = int(self.headers['Content-Length'])
            body = json.loads(self.rfile.read(length))
            old_pass = body.get('old_password')
            new_pass = body.get('new_password')
            
            if verify_password(old_pass, user['salt'], user['password_hash']):
                salt, new_hash = hash_password(new_pass)
                conn = sqlite3.connect(DB_FILE)
                c = conn.cursor()
                c.execute("UPDATE users SET salt=?, password_hash=?, token=NULL WHERE id=?", 
                          (salt, new_hash, user['id']))
                conn.commit()
                conn.close()
                self.send_json({"status": "success"})
            else:
                self.send_json({"error": "Invalid old password"}, 401)
        except Exception as e:
            self.send_json({"error": str(e)}, 500)

    def handle_upload(self, user_id):
        # Using cgi.FieldStorage to parse multipart
        form = cgi.FieldStorage(
            fp=self.rfile,
            headers=self.headers,
            environ={'REQUEST_METHOD': 'POST',
                     'CONTENT_TYPE': self.headers['Content-Type'],
                     }
        )
        
        if 'file' not in form:
            self.send_json({"error": "No file field"}, 400)
            return
            
        fileitem = form['file']
        if not fileitem.file:
             self.send_json({"error": "Empty file"}, 400)
             return

        # Create user specific upload dir
        user_dir = os.path.join(UPLOAD_DIR, str(user_id))
        if not os.path.exists(user_dir):
            os.makedirs(user_dir)
            
        # Secure filename
        filename = os.path.basename(fileitem.filename)
        # Avoid overwrite by prepending timestamp
        filename = f"{int(time.time())}_{filename}"
        filepath = os.path.join(user_dir, filename)
        
        with open(filepath, 'wb') as f:
            shutil.copyfileobj(fileitem.file, f)
            
        # Return relative path
        rel_path = f"/uploads/{user_id}/{filename}"
        self.send_json({"url": rel_path})

    def handle_list(self, table, user_id):
        conn = sqlite3.connect(DB_FILE)
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        # Select all columns
        c.execute(f"SELECT * FROM {table} WHERE user_id=?", (user_id,))
        rows = c.fetchall()
        
        # Convert to list of dicts
        result = []
        for row in rows:
            item = dict(row)
            # Parse extra_data back to dict fields if needed, 
            # OR just return flat structure and let frontend handle it.
            # We'll merge extra_data into the item for frontend convenience
            if item.get('extra_data'):
                try:
                    extras = json.loads(item['extra_data'])
                    if isinstance(extras, dict):
                        item.update(extras)
                except:
                    pass
            del item['extra_data']
            result.append(item)
            
        conn.close()
        self.send_json(result)

    def handle_sync(self, table, user_id):
        try:
            length = int(self.headers['Content-Length'])
            data_list = json.loads(self.rfile.read(length))
            
            if not isinstance(data_list, list):
                self.send_json({"error": "Expected list"}, 400)
                return

            conn = sqlite3.connect(DB_FILE)
            c = conn.cursor()
            
            # Strategy: Full Replace for the user (simplest for sync)
            # Delete all existing for this user
            c.execute(f"DELETE FROM {table} WHERE user_id=?", (user_id,))
            
            # Insert new
            for item in data_list:
                # Prepare fields based on table
                if table == 'software_copyrights':
                    cols = ['user_id', 'name', 'version', 'registration_no', 'owner', 'develop_date', 'publish_status', 'file_path', 'extra_data']
                    # Extract known fields, put rest in extra_data
                    known = {k: item.get(k, '') for k in cols if k not in ['user_id', 'extra_data']}
                    extras = {k: v for k, v in item.items() if k not in known}
                    vals = [user_id, known['name'], known['version'], known['registration_no'], known['owner'], known['develop_date'], known['publish_status'], known['file_path'], json.dumps(extras)]
                    c.execute(f"INSERT INTO {table} ({','.join(cols)}) VALUES ({','.join(['?']*len(cols))})", vals)
                    
                elif table == 'papers':
                    cols = ['user_id', 'title', 'journal', 'authors', 'publish_date', 'type', 'status', 'file_path', 'extra_data']
                    known = {k: item.get(k, '') for k in cols if k not in ['user_id', 'extra_data']}
                    extras = {k: v for k, v in item.items() if k not in known}
                    vals = [user_id, known['title'], known['journal'], known['authors'], known['publish_date'], known['type'], known['status'], known['file_path'], json.dumps(extras)]
                    c.execute(f"INSERT INTO {table} ({','.join(cols)}) VALUES ({','.join(['?']*len(cols))})", vals)
                    
                elif table == 'patents':
                    cols = ['user_id', 'title', 'type', 'application_no', 'application_date', 'status', 'inventors', 'application_file', 'certificate_file', 'extra_data']
                    known = {k: item.get(k, '') for k in cols if k not in ['user_id', 'extra_data']}
                    extras = {k: v for k, v in item.items() if k not in known}
                    vals = [user_id, known['title'], known['type'], known['application_no'], known['application_date'], known['status'], known['inventors'], known['application_file'], known['certificate_file'], json.dumps(extras)]
                    c.execute(f"INSERT INTO {table} ({','.join(cols)}) VALUES ({','.join(['?']*len(cols))})", vals)

            conn.commit()
            conn.close()
            self.send_json({"status": "synced", "count": len(data_list)})
        except Exception as e:
            self.send_json({"error": str(e)}, 500)

if __name__ == "__main__":
    init_db()
    mimetypes.add_type('application/javascript', '.js')
    mimetypes.add_type('text/css', '.css')
    
    socketserver.TCPServer.allow_reuse_address = True
    print(f"Starting server at http://localhost:{PORT}")
    with socketserver.TCPServer(("", PORT), RequestHandler) as httpd:
        httpd.serve_forever()
