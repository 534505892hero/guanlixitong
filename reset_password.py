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

def verify_password(password, salt, stored_hash):
    _, pwd_hash = hash_password(password, salt)
    return pwd_hash == stored_hash

def reset_password():
    abs_path = os.path.abspath(DB_FILE)
    print(f"[*] Target Database: {abs_path}")
    
    if not os.path.exists(DB_FILE):
        print(f"Error: {DB_FILE} not found.")
        print("Please ensure you are in the correct directory where 'server.py' is running.")
        return

    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    
    try:
        # 1. Generate new hash
        salt, pwd_hash = hash_password(DEFAULT_PASS)
        
        # 2. Update or Insert
        c.execute("SELECT username FROM admin_auth WHERE username='admin'")
        if c.fetchone():
            c.execute("UPDATE admin_auth SET salt=?, password_hash=?, token=NULL WHERE username='admin'", 
                      (salt, pwd_hash))
            print(f"[*] Updated 'admin' user.")
        else:
            c.execute("INSERT INTO admin_auth (username, salt, password_hash) VALUES (?, ?, ?)",
                      ('admin', salt, pwd_hash))
            print(f"[*] Created 'admin' user.")
            
        conn.commit()
        print(f"[*] Password reset to default: {DEFAULT_PASS}")
        
        # 3. Verification Step
        print("-" * 30)
        print("[*] Verifying new password...")
        c.execute("SELECT salt, password_hash FROM admin_auth WHERE username='admin'")
        row = c.fetchone()
        if row:
            db_salt, db_hash = row
            if verify_password(DEFAULT_PASS, db_salt, db_hash):
                print("[SUCCESS] Verification Passed! The password in DB matches 'Admin@2026'.")
                print("You can now login with this password.")
            else:
                print("[FAILED] Verification Failed! Hash mismatch.")
        else:
            print("[FAILED] User 'admin' not found after update!")
            
    except sqlite3.OperationalError as e:
        print(f"Database error: {e}")
        print("Hint: If using Docker, make sure to run this script INSIDE the container or ensure volume mapping is correct.")
    finally:
        conn.close()

if __name__ == "__main__":
    reset_password()
