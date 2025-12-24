"""Vercel Serverless Function - Minimal Test"""
from fastapi import FastAPI
import os

app = FastAPI()

@app.get("/")
def root():
    return {"message": "API Working!"}

@app.get("/health")
def health():
    return {"status": "ok", "python": "working"}

@app.get("/workspaces")
def workspaces():
    return []

@app.get("/documents")
def documents():
    return []

@app.get("/qa-history")
def qa_history():
    return []

@app.get("/comparisons")
def comparisons():
    return []

@app.get("/decision-matrices")
def matrices():
    return []

@app.get("/charts/{doc_id}")
def charts(doc_id: int):
    return []

handler = app
