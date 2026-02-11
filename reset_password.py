import sqlite3
import hashlib
import secrets
import os

DB_FILE = "app_data.db"
DEFAULT_PASS = "Admin@2026"

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

def reset_password():
    if not os.path.exists(DB_FILE):
        print(f"Error: {DB_FILE} not found. Please run server.py first.")
        return

    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    
    try:
        salt, pwd_hash = hash_password(DEFAULT_PASS)
        # 检查是否存在 admin 用户
        c.execute("SELECT username FROM admin_auth WHERE username='admin'")
        if c.fetchone():
            c.execute("UPDATE admin_auth SET salt=?, password_hash=?, token=NULL WHERE username='admin'", 
                      (salt, pwd_hash))
            print(f"Updated 'admin' password to default: {DEFAULT_PASS}")
        else:
            c.execute("INSERT INTO admin_auth (username, salt, password_hash) VALUES (?, ?, ?)",
                      ('admin', salt, pwd_hash))
            print(f"Created 'admin' user with default password: {DEFAULT_PASS}")
            
        conn.commit()
    except sqlite3.OperationalError as e:
        print(f"Database error: {e}")
        print("Maybe the table 'admin_auth' does not exist yet.")
    finally:
        conn.close()

if __name__ == "__main__":
    reset_password()
