"""Vercel Serverless Function - Simple Test"""
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
    return {"message": "API is working!"}

@app.get("/health")
def health():
    return {
        "status": "ok",
        "env": {
            "DB_HOST": os.getenv("DB_HOST", "NOT SET"),
            "DB_PORT": os.getenv("DB_PORT", "NOT SET"),
            "DB_USER": os.getenv("DB_USER", "NOT SET")[:5] + "***" if os.getenv("DB_USER") else "NOT SET",
            "DB_NAME": os.getenv("DB_NAME", "NOT SET"),
            "PRODUCTION": os.getenv("PRODUCTION", "NOT SET"),
        }
    }

@app.get("/test-db")
def test_db():
    try:
        import mysql.connector
        config = {
            "host": os.getenv("DB_HOST"),
            "port": int(os.getenv("DB_PORT", "3306")),
            "user": os.getenv("DB_USER"),
            "password": os.getenv("DB_PASSWORD"),
            "database": os.getenv("DB_NAME"),
            "ssl_disabled": False,
        }
        conn = mysql.connector.connect(**config)
        conn.close()
        return {"status": "Database connected successfully!"}
    except Exception as e:
        return {"status": "error", "error": str(e)}

# Vercel handler
handler = app
