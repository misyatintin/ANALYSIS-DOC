"""Database connection and models for MySQL - Full Version with Workspaces"""
import os
import json
import ssl
import mysql.connector
from mysql.connector import pooling
from dotenv import load_dotenv

load_dotenv()

# Check if running in production (cloud)
IS_PRODUCTION = os.getenv("VERCEL", False) or os.getenv("PRODUCTION", "").lower() == "true"

DB_CONFIG = {
    "host": os.getenv("DB_HOST", "localhost"),
    "database": os.getenv("DB_NAME", "analysis"),
    "user": os.getenv("DB_USER", "root"),
    "password": os.getenv("DB_PASSWORD", "new_password"),
    "port": int(os.getenv("DB_PORT", "3306")),
}

# Add SSL for cloud databases (TiDB, PlanetScale, etc.)
if IS_PRODUCTION or os.getenv("DB_SSL", "").lower() == "true":
    DB_CONFIG["ssl_disabled"] = False
    DB_CONFIG["ssl_verify_identity"] = True

connection_pool = None

def get_pool():
    global connection_pool
    if connection_pool is None:
        try:
            connection_pool = pooling.MySQLConnectionPool(pool_name="pool", pool_size=3, **DB_CONFIG)
        except Exception as e:
            print(f"Connection pool error: {e}")
            # Fallback to single connection mode
            return None
    return connection_pool

def get_connection():
    pool = get_pool()
    if pool:
        return pool.get_connection()
    # Fallback direct connection
    return mysql.connector.connect(**DB_CONFIG)

def init_database():
    """Initialize database - creates tables only if they don't exist"""
    conn = get_connection()
    cursor = conn.cursor()
    
    # Workspaces table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS workspaces (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            description TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
    """)
    
    # Documents table with suggestions
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS documents (
            id INT AUTO_INCREMENT PRIMARY KEY,
            workspace_id INT,
            filename VARCHAR(255) NOT NULL,
            file_type VARCHAR(50) NOT NULL,
            file_size INT NOT NULL,
            file_data LONGBLOB NOT NULL,
            suggestions JSON,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE SET NULL
        )
    """)
    
    # Analysis results
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS analysis_results (
            id INT AUTO_INCREMENT PRIMARY KEY,
            document_id INT NOT NULL,
            analysis_type VARCHAR(50) NOT NULL,
            result_json LONGTEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
        )
    """)
    
    # Comparisons
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS comparisons (
            id INT AUTO_INCREMENT PRIMARY KEY,
            workspace_id INT,
            document_ids JSON NOT NULL,
            result_json LONGTEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE SET NULL
        )
    """)
    
    # Decision matrices
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS decision_matrices (
            id INT AUTO_INCREMENT PRIMARY KEY,
            workspace_id INT,
            name VARCHAR(255) NOT NULL,
            criteria JSON NOT NULL,
            options JSON NOT NULL,
            result_json LONGTEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE SET NULL
        )
    """)
    
    # Charts
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS charts (
            id INT AUTO_INCREMENT PRIMARY KEY,
            document_id INT NOT NULL,
            chart_type VARCHAR(50) NOT NULL,
            title VARCHAR(255),
            chart_data JSON NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
        )
    """)
    
    # Q&A history
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS qa_history (
            id INT AUTO_INCREMENT PRIMARY KEY,
            workspace_id INT,
            document_ids JSON,
            question TEXT NOT NULL,
            answer_json LONGTEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE SET NULL
        )
    """)
    
    conn.commit()
    cursor.close()
    conn.close()
    print("Database initialized - tables ready")

# ============ WORKSPACE OPERATIONS ============
def create_workspace(name: str, description: str = None) -> int:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("INSERT INTO workspaces (name, description) VALUES (%s, %s)", (name, description))
    workspace_id = cursor.lastrowid
    conn.commit()
    cursor.close()
    conn.close()
    return workspace_id

def get_workspaces():
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("""
        SELECT w.*, COUNT(d.id) as document_count 
        FROM workspaces w LEFT JOIN documents d ON w.id = d.workspace_id 
        GROUP BY w.id ORDER BY w.updated_at DESC
    """)
    results = cursor.fetchall()
    cursor.close()
    conn.close()
    return results

def get_workspace(workspace_id: int):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT * FROM workspaces WHERE id = %s", (workspace_id,))
    result = cursor.fetchone()
    cursor.close()
    conn.close()
    return result

def update_workspace(workspace_id: int, name: str = None, description: str = None):
    conn = get_connection()
    cursor = conn.cursor()
    if name and description is not None:
        cursor.execute("UPDATE workspaces SET name = %s, description = %s WHERE id = %s", (name, description, workspace_id))
    elif name:
        cursor.execute("UPDATE workspaces SET name = %s WHERE id = %s", (name, workspace_id))
    conn.commit()
    cursor.close()
    conn.close()

def delete_workspace(workspace_id: int):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM workspaces WHERE id = %s", (workspace_id,))
    conn.commit()
    cursor.close()
    conn.close()

def assign_all_documents_to_workspace(workspace_id: int):
    """Assign all documents to a specific workspace"""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE documents SET workspace_id = %s", (workspace_id,))
    affected = cursor.rowcount
    conn.commit()
    cursor.close()
    conn.close()
    return affected

# ============ DOCUMENT OPERATIONS ============
def save_document(filename: str, file_type: str, file_size: int, file_data: bytes, workspace_id: int = None) -> int:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO documents (filename, file_type, file_size, file_data, workspace_id) VALUES (%s, %s, %s, %s, %s)",
        (filename, file_type, file_size, file_data, workspace_id)
    )
    doc_id = cursor.lastrowid
    conn.commit()
    cursor.close()
    conn.close()
    return doc_id

def get_document(doc_id: int):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT * FROM documents WHERE id = %s", (doc_id,))
    result = cursor.fetchone()
    cursor.close()
    conn.close()
    return result

def get_all_documents():
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT id, filename, file_type, file_size, workspace_id, suggestions, created_at FROM documents ORDER BY created_at DESC")
    results = cursor.fetchall()
    cursor.close()
    conn.close()
    return results

def get_documents_by_workspace(workspace_id: int):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT id, filename, file_type, file_size, workspace_id, suggestions, created_at FROM documents WHERE workspace_id = %s ORDER BY created_at DESC", (workspace_id,))
    results = cursor.fetchall()
    cursor.close()
    conn.close()
    return results

def delete_document(doc_id: int):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM documents WHERE id = %s", (doc_id,))
    conn.commit()
    cursor.close()
    conn.close()

def update_document_suggestions(doc_id: int, suggestions: str):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE documents SET suggestions = %s WHERE id = %s", (suggestions, doc_id))
    conn.commit()
    cursor.close()
    conn.close()

def update_document_workspace(doc_id: int, workspace_id: int):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE documents SET workspace_id = %s WHERE id = %s", (workspace_id, doc_id))
    conn.commit()
    cursor.close()
    conn.close()

# ============ ANALYSIS OPERATIONS ============
def save_analysis(document_id: int, analysis_type: str, result_json: str) -> int:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO analysis_results (document_id, analysis_type, result_json) VALUES (%s, %s, %s)",
        (document_id, analysis_type, result_json)
    )
    analysis_id = cursor.lastrowid
    conn.commit()
    cursor.close()
    conn.close()
    return analysis_id

def get_analysis_by_document(document_id: int):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT * FROM analysis_results WHERE document_id = %s ORDER BY created_at DESC", (document_id,))
    results = cursor.fetchall()
    cursor.close()
    conn.close()
    return results

# ============ COMPARISON OPERATIONS ============
def save_comparison(document_ids: list, result_json: str, workspace_id: int = None) -> int:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO comparisons (workspace_id, document_ids, result_json) VALUES (%s, %s, %s)",
        (workspace_id, json.dumps(document_ids), result_json)
    )
    comparison_id = cursor.lastrowid
    conn.commit()
    cursor.close()
    conn.close()
    return comparison_id

def get_comparisons(workspace_id: int = None):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    if workspace_id:
        cursor.execute("SELECT * FROM comparisons WHERE workspace_id = %s ORDER BY created_at DESC", (workspace_id,))
    else:
        cursor.execute("SELECT * FROM comparisons ORDER BY created_at DESC")
    results = cursor.fetchall()
    cursor.close()
    conn.close()
    return results

# ============ DECISION MATRIX OPERATIONS ============
def save_decision_matrix(name: str, criteria: list, options: list, result_json: str = None, workspace_id: int = None) -> int:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO decision_matrices (workspace_id, name, criteria, options, result_json) VALUES (%s, %s, %s, %s, %s)",
        (workspace_id, name, json.dumps(criteria), json.dumps(options), result_json)
    )
    matrix_id = cursor.lastrowid
    conn.commit()
    cursor.close()
    conn.close()
    return matrix_id

def get_decision_matrices(workspace_id: int = None):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    if workspace_id:
        cursor.execute("SELECT * FROM decision_matrices WHERE workspace_id = %s ORDER BY created_at DESC", (workspace_id,))
    else:
        cursor.execute("SELECT * FROM decision_matrices ORDER BY created_at DESC")
    results = cursor.fetchall()
    cursor.close()
    conn.close()
    return results

# ============ CHART OPERATIONS ============
def save_chart(document_id: int, chart_type: str, title: str, chart_data: dict) -> int:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO charts (document_id, chart_type, title, chart_data) VALUES (%s, %s, %s, %s)",
        (document_id, chart_type, title, json.dumps(chart_data))
    )
    chart_id = cursor.lastrowid
    conn.commit()
    cursor.close()
    conn.close()
    return chart_id

def get_charts_by_document(document_id: int):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT * FROM charts WHERE document_id = %s ORDER BY created_at DESC", (document_id,))
    results = cursor.fetchall()
    cursor.close()
    conn.close()
    return results

# ============ Q&A OPERATIONS ============
def save_qa(question: str, answer_json: str, document_ids: list = None, workspace_id: int = None) -> int:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO qa_history (workspace_id, document_ids, question, answer_json) VALUES (%s, %s, %s, %s)",
        (workspace_id, json.dumps(document_ids) if document_ids else None, question, answer_json)
    )
    qa_id = cursor.lastrowid
    conn.commit()
    cursor.close()
    conn.close()
    return qa_id

def get_qa_history(workspace_id: int = None, limit: int = 50):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    if workspace_id:
        cursor.execute("SELECT * FROM qa_history WHERE workspace_id = %s ORDER BY created_at DESC LIMIT %s", (workspace_id, limit))
    else:
        cursor.execute("SELECT * FROM qa_history ORDER BY created_at DESC LIMIT %s", (limit,))
    results = cursor.fetchall()
    cursor.close()
    conn.close()
    return results
