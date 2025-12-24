"""Vercel Serverless Function"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def root():
    return {"message": "AnalysisDoc API", "status": "running"}

@app.get("/health")
def health():
    return {
        "status": "ok",
        "db_host": os.getenv("DB_HOST", "NOT SET"),
        "db_name": os.getenv("DB_NAME", "NOT SET"),
    }

@app.get("/test-db")
def test_db():
    try:
        import mysql.connector
        conn = mysql.connector.connect(
            host=os.getenv("DB_HOST"),
            port=int(os.getenv("DB_PORT", "4000")),
            user=os.getenv("DB_USER"),
            password=os.getenv("DB_PASSWORD"),
            database=os.getenv("DB_NAME"),
            ssl_disabled=False,
        )
        cursor = conn.cursor()
        cursor.execute("SELECT 1")
        cursor.fetchone()
        cursor.close()
        conn.close()
        return {"status": "success", "message": "Database connected!"}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.get("/workspaces")
def get_workspaces():
    try:
        import mysql.connector
        conn = mysql.connector.connect(
            host=os.getenv("DB_HOST"),
            port=int(os.getenv("DB_PORT", "4000")),
            user=os.getenv("DB_USER"),
            password=os.getenv("DB_PASSWORD"),
            database=os.getenv("DB_NAME"),
            ssl_disabled=False,
        )
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT * FROM workspaces ORDER BY id DESC")
        results = cursor.fetchall()
        cursor.close()
        conn.close()
        return results
    except Exception as e:
        return {"error": str(e)}

@app.get("/documents")
def get_documents():
    try:
        import mysql.connector
        conn = mysql.connector.connect(
            host=os.getenv("DB_HOST"),
            port=int(os.getenv("DB_PORT", "4000")),
            user=os.getenv("DB_USER"),
            password=os.getenv("DB_PASSWORD"),
            database=os.getenv("DB_NAME"),
            ssl_disabled=False,
        )
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT id, filename, file_type, file_size, workspace_id, created_at FROM documents ORDER BY id DESC")
        results = cursor.fetchall()
        cursor.close()
        conn.close()
        return results
    except Exception as e:
        return {"error": str(e)}

@app.get("/qa-history")
def get_qa_history(limit: int = 10):
    return []

@app.get("/comparisons")
def get_comparisons():
    return []

@app.get("/decision-matrices")
def get_matrices():
    return []

@app.get("/charts/{doc_id}")
def get_charts(doc_id: int):
    return []

# Handler for Vercel
handler = app
