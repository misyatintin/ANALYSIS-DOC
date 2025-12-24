from http.server import BaseHTTPRequestHandler
import json

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        
        if self.path == '/health':
            response = {"status": "ok"}
        elif self.path == '/workspaces':
            response = []
        elif self.path == '/documents':
            response = []
        elif self.path.startswith('/qa-history'):
            response = []
        elif self.path == '/comparisons':
            response = []
        elif self.path == '/decision-matrices':
            response = []
        elif self.path.startswith('/charts'):
            response = []
        else:
            response = {"message": "AnalysisDoc API"}
        
        self.wfile.write(json.dumps(response).encode())
    
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', '*')
        self.end_headers()
