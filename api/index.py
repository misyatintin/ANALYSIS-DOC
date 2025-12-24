from http.server import BaseHTTPRequestHandler
import json
import os

def get_db_connection():
    import mysql.connector
    return mysql.connector.connect(
        host=os.getenv("DB_HOST"),
        port=int(os.getenv("DB_PORT", "4000")),
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASSWORD"),
        database=os.getenv("DB_NAME"),
        ssl_disabled=False,
    )

def check_env_vars():
    return {
        "DB_HOST": "SET" if os.getenv("DB_HOST") else "NOT SET",
        "DB_PORT": "SET" if os.getenv("DB_PORT") else "NOT SET",
        "DB_USER": "SET" if os.getenv("DB_USER") else "NOT SET",
        "DB_PASSWORD": "SET" if os.getenv("DB_PASSWORD") else "NOT SET",
        "DB_NAME": "SET" if os.getenv("DB_NAME") else "NOT SET",
        "OPENROUTER_API_KEY": "SET" if os.getenv("OPENROUTER_API_KEY") else "NOT SET",
    }

def init_tables():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Create tables if not exist
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS workspaces (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            description TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS documents (
            id INT AUTO_INCREMENT PRIMARY KEY,
            workspace_id INT,
            filename VARCHAR(255) NOT NULL,
            file_type VARCHAR(50) NOT NULL,
            file_size INT NOT NULL,
            suggestions JSON,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS qa_history (
            id INT AUTO_INCREMENT PRIMARY KEY,
            question TEXT,
            answer_json TEXT,
            document_ids JSON,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    
    conn.commit()
    cursor.close()
    conn.close()

class handler(BaseHTTPRequestHandler):
    def send_json(self, data, status=200):
        self.send_response(status)
        self.send_header('Content-type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(data, default=str).encode())
    
    def do_GET(self):
        path = self.path.split('?')[0]
        
        try:
            if path == '/health':
                self.send_json({"status": "ok", "env_vars": check_env_vars()})
            
            elif path == '/env-check':
                self.send_json(check_env_vars())
            
            elif path == '/test-db':
                try:
                    conn = get_db_connection()
                    conn.close()
                    self.send_json({"status": "connected"})
                except Exception as e:
                    self.send_json({"status": "error", "message": str(e)})
            
            elif path == '/init-db':
                try:
                    init_tables()
                    self.send_json({"status": "tables created"})
                except Exception as e:
                    self.send_json({"status": "error", "message": str(e)})
            
            elif path == '/workspaces':
                try:
                    conn = get_db_connection()
                    cursor = conn.cursor(dictionary=True)
                    cursor.execute("SELECT * FROM workspaces ORDER BY id DESC")
                    results = cursor.fetchall()
                    cursor.close()
                    conn.close()
                    self.send_json(results)
                except Exception as e:
                    self.send_json([])
            
            elif path == '/documents':
                try:
                    conn = get_db_connection()
                    cursor = conn.cursor(dictionary=True)
                    cursor.execute("SELECT id, filename, file_type, file_size, workspace_id, suggestions, created_at FROM documents ORDER BY id DESC")
                    results = cursor.fetchall()
                    cursor.close()
                    conn.close()
                    # Parse suggestions JSON
                    for r in results:
                        if r.get('suggestions'):
                            try:
                                r['suggestions'] = json.loads(r['suggestions'])
                            except:
                                pass
                    self.send_json(results)
                except Exception as e:
                    self.send_json([])
            
            elif path.startswith('/qa-history'):
                self.send_json([])
            
            elif path == '/comparisons':
                self.send_json([])
            
            elif path == '/decision-matrices':
                self.send_json([])
            
            elif path.startswith('/charts'):
                self.send_json([])
            
            elif path.startswith('/analysis'):
                self.send_json([])
            
            else:
                self.send_json({"message": "AnalysisDoc API", "endpoints": ["/health", "/test-db", "/init-db", "/workspaces", "/documents"]})
        
        except Exception as e:
            self.send_json({"error": str(e)}, 500)
    
    def do_POST(self):
        self.send_json({"error": "POST not implemented yet"}, 501)
    
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', '*')
        self.end_headers()
