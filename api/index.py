"""Vercel Serverless Function - FastAPI Backend"""
import sys
import os

# Add the backend directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

from main import app

# Vercel handler
handler = app
