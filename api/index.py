from http.server import BaseHTTPRequestHandler
import json
import os
from urllib.parse import parse_qs, urlparse

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
            file_data LONGBLOB,
            suggestions JSON,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS analysis_results (
            id INT AUTO_INCREMENT PRIMARY KEY,
            document_id INT,
            analysis_type VARCHAR(50),
            result_json LONGTEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS qa_history (
            id INT AUTO_INCREMENT PRIMARY KEY,
            question TEXT,
            answer_json LONGTEXT,
            document_ids JSON,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS comparisons (
            id INT AUTO_INCREMENT PRIMARY KEY,
            document_ids JSON,
            result_json LONGTEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS decision_matrices (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(255),
            criteria JSON,
            options JSON,
            result_json LONGTEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS charts (
            id INT AUTO_INCREMENT PRIMARY KEY,
            document_id INT,
            chart_type VARCHAR(50),
            title VARCHAR(255),
            chart_data JSON,
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
    
    def get_body(self):
        content_length = int(self.headers.get('Content-Length', 0))
        if content_length:
            return json.loads(self.rfile.read(content_length))
        return {}
    
    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        query = parse_qs(parsed.query)
        
        try:
            if path == '/health':
                self.send_json({"status": "ok", "env_vars": check_env_vars()})
            
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
                conn = get_db_connection()
                cursor = conn.cursor(dictionary=True)
                cursor.execute("""
                    SELECT w.*, COUNT(d.id) as document_count 
                    FROM workspaces w LEFT JOIN documents d ON w.id = d.workspace_id 
                    GROUP BY w.id ORDER BY w.id DESC
                """)
                results = cursor.fetchall()
                cursor.close()
                conn.close()
                self.send_json(results)
            
            elif path == '/documents':
                conn = get_db_connection()
                cursor = conn.cursor(dictionary=True)
                cursor.execute("SELECT id, filename, file_type, file_size, workspace_id, suggestions, created_at FROM documents ORDER BY id DESC")
                results = cursor.fetchall()
                cursor.close()
                conn.close()
                for r in results:
                    if r.get('suggestions'):
                        try:
                            r['suggestions'] = json.loads(r['suggestions'])
                        except:
                            pass
                self.send_json(results)
            
            elif path.startswith('/analysis/'):
                doc_id = path.split('/')[-1]
                conn = get_db_connection()
                cursor = conn.cursor(dictionary=True)
                cursor.execute("SELECT * FROM analysis_results WHERE document_id = %s ORDER BY created_at DESC", (doc_id,))
                results = cursor.fetchall()
                cursor.close()
                conn.close()
                for r in results:
                    if r.get('result_json'):
                        try:
                            r['result_json'] = json.loads(r['result_json'])
                        except:
                            pass
                self.send_json(results)
            
            elif path == '/qa-history':
                limit = query.get('limit', ['10'])[0]
                conn = get_db_connection()
                cursor = conn.cursor(dictionary=True)
                cursor.execute(f"SELECT * FROM qa_history ORDER BY created_at DESC LIMIT {int(limit)}")
                results = cursor.fetchall()
                cursor.close()
                conn.close()
                for r in results:
                    if r.get('answer_json'):
                        try:
                            r['answer_json'] = json.loads(r['answer_json'])
                        except:
                            pass
                self.send_json(results)
            
            elif path == '/comparisons':
                conn = get_db_connection()
                cursor = conn.cursor(dictionary=True)
                cursor.execute("SELECT * FROM comparisons ORDER BY created_at DESC")
                results = cursor.fetchall()
                cursor.close()
                conn.close()
                for r in results:
                    if r.get('result_json'):
                        try:
                            r['result_json'] = json.loads(r['result_json'])
                        except:
                            pass
                self.send_json(results)
            
            elif path == '/decision-matrices':
                conn = get_db_connection()
                cursor = conn.cursor(dictionary=True)
                cursor.execute("SELECT * FROM decision_matrices ORDER BY created_at DESC")
                results = cursor.fetchall()
                cursor.close()
                conn.close()
                for r in results:
                    for field in ['criteria', 'options', 'result_json']:
                        if r.get(field):
                            try:
                                r[field] = json.loads(r[field])
                            except:
                                pass
                self.send_json(results)
            
            elif path.startswith('/charts/'):
                doc_id = path.split('/')[-1]
                conn = get_db_connection()
                cursor = conn.cursor(dictionary=True)
                cursor.execute("SELECT * FROM charts WHERE document_id = %s ORDER BY created_at DESC", (doc_id,))
                results = cursor.fetchall()
                cursor.close()
                conn.close()
                for r in results:
                    if r.get('chart_data'):
                        try:
                            r['chart_data'] = json.loads(r['chart_data'])
                        except:
                            pass
                self.send_json(results)
            
            else:
                self.send_json({"message": "AnalysisDoc API"})
        
        except Exception as e:
            self.send_json({"error": str(e)}, 500)
    
    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path
        
        try:
            if path == '/workspaces':
                data = self.get_body()
                conn = get_db_connection()
                cursor = conn.cursor()
                cursor.execute("INSERT INTO workspaces (name, description) VALUES (%s, %s)", 
                             (data.get('name'), data.get('description')))
                workspace_id = cursor.lastrowid
                conn.commit()
                cursor.close()
                conn.close()
                self.send_json({"id": workspace_id, "name": data.get('name')})
            
            elif path == '/upload':
                # For now, return a placeholder - file upload needs multipart handling
                self.send_json({"error": "File upload not supported in serverless mode. Use local development."}, 501)
            
            elif path == '/analyze':
                self.send_json({"error": "Analysis not available in free tier due to timeout limits"}, 501)
            
            elif path == '/compare':
                self.send_json({"error": "Comparison not available in free tier due to timeout limits"}, 501)
            
            elif path == '/decision-matrix':
                self.send_json({"error": "Decision matrix not available in free tier due to timeout limits"}, 501)
            
            elif path == '/qa':
                self.send_json({"error": "Q&A not available in free tier due to timeout limits"}, 501)
            
            elif path == '/charts':
                self.send_json({"error": "Chart generation not available in free tier due to timeout limits"}, 501)
            
            else:
                self.send_json({"error": "Endpoint not found"}, 404)
        
        except Exception as e:
            self.send_json({"error": str(e)}, 500)
    
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', '*')
        self.end_headers()
