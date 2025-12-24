"""Vercel Serverless Function - FastAPI Backend"""
import sys
import os

# Add the backend directory to path
backend_path = os.path.join(os.path.dirname(__file__), '..', 'backend')
sys.path.insert(0, backend_path)

# Set production environment
os.environ["PRODUCTION"] = "true"

# Import the FastAPI app
from main import app

# Vercel uses this as the handler
handler = app
