# AnalysisDoc Web App

A fully-featured, responsive web application for AI-powered document analysis with FastAPI backend and MySQL database.

## Features

### Document Management
- Upload documents (PDF, DOCX, images, text files up to 15MB)
- Multi-file upload support
- Organize documents in workspaces
- View document history and metadata

### AI Analysis Types
- **Summary** - Extract key points, highlights, and sections
- **Pros/Cons** - Identify strengths and weaknesses with citations
- **Gaps/Risks** - Find missing information and potential risks
- **Upgrade Suggestions** - Get actionable improvement recommendations
- **Report Generation** - Create comprehensive analysis reports
- **Slides Outline** - Generate presentation structure

### Advanced Features
- **Document Comparison** - Compare 2+ documents side-by-side
- **Decision Matrix** - Weighted criteria evaluation with scoring
- **Q&A** - Ask natural language questions about documents
- **Chart Generation** - Create bar, line, and pie charts from data
- **Export** - Download analysis results as JSON or CSV

### UI/UX
- Fully responsive design (mobile, tablet, desktop)
- Dark theme with smooth animations
- Real-time loading indicators
- Toast notifications
- Drag & drop file upload

## Setup

### 1. MySQL Database

```sql
CREATE DATABASE IF NOT EXISTS analysis;
```

Database config (in `backend/.env`):
- Host: localhost
- Database: analysis
- User: root
- Password: new_password

### 2. Backend Setup

```bash
cd webapp/backend

# Create virtual environment
python -m venv venv

# Activate (Windows)
venv\Scripts\activate

# Activate (Mac/Linux)
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Run the server
python main.py
```

API runs at: `http://localhost:8000`

### 3. Frontend

Simply open `webapp/frontend/index.html` in your browser.

Or serve it with Python:
```bash
cd webapp/frontend
python -m http.server 3000
```
Then open: `http://localhost:3000`

## API Endpoints

### Workspaces
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /workspaces | Create workspace |
| GET | /workspaces | List workspaces |
| GET | /workspaces/{id} | Get workspace details |
| PUT | /workspaces/{id} | Update workspace |
| DELETE | /workspaces/{id} | Delete workspace |

### Documents
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /upload | Upload single document |
| POST | /upload-multiple | Upload multiple documents |
| GET | /documents | List all documents |
| GET | /documents/{id} | Get document details |
| DELETE | /documents/{id} | Delete document |

### Analysis
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /analyze | Analyze a document |
| POST | /analyze-upload | Upload and analyze |
| GET | /analysis/{doc_id} | Get analysis history |
| POST | /report | Generate report |
| POST | /slides | Generate slides outline |

### Comparison & Matrix
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /compare | Compare documents |
| GET | /comparisons | List comparisons |
| POST | /decision-matrix | Create decision matrix |
| GET | /decision-matrices | List matrices |

### Q&A & Charts
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /qa | Ask a question |
| GET | /qa-history | Get Q&A history |
| POST | /charts | Generate chart |
| GET | /charts/{doc_id} | Get document charts |

### Export
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /export/{doc_id}?format=json | Export as JSON |
| GET | /export/{doc_id}?format=csv | Export as CSV |

## Configuration

Edit `webapp/backend/.env`:

```env
# OpenRouter API
OPENROUTER_API_KEY=your-api-key

# MySQL Database
DB_HOST=localhost
DB_NAME=analysis
DB_USER=root
DB_PASSWORD=new_password
```

## Tech Stack

- **Backend**: FastAPI, Python 3.9+
- **Database**: MySQL 8.0+
- **AI**: OpenRouter API (Claude, GPT-4)
- **Frontend**: Vanilla JS, TailwindCSS, Chart.js
- **Icons**: Font Awesome 6
