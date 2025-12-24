# Free Deployment Guide for AnalysisDoc

## Overview
- **Frontend**: Vercel (free)
- **Backend**: Render.com (free tier)
- **Database**: TiDB Cloud (free MySQL) or PlanetScale (free)

---

## Step 1: Set Up Free MySQL Database (TiDB Cloud)

1. Go to https://tidbcloud.com/ and sign up (free)
2. Create a new **Serverless** cluster (free tier)
3. Once created, click "Connect" and get:
   - Host: `gateway01.xxx.prod.aws.tidbcloud.com`
   - Port: `4000`
   - User: your username
   - Password: your password
4. Create a database named `analysis`:
   ```sql
   CREATE DATABASE analysis;
   ```

**Alternative: PlanetScale**
1. Go to https://planetscale.com/ and sign up
2. Create a database named `analysis`
3. Get connection string from "Connect" button

---

## Step 2: Deploy Backend on Render.com

1. Go to https://render.com/ and sign up (free)
2. Click "New" → "Web Service"
3. Connect your GitHub repo OR use "Public Git repository"
4. Configure:
   - **Name**: `analysisdoc-api`
   - **Root Directory**: `webapp/backend`
   - **Runtime**: Python 3
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn main:app --host 0.0.0.0 --port $PORT`

5. Add Environment Variables:
   ```
   OPENROUTER_API_KEY=your_openrouter_key
   DB_HOST=your_tidb_host
   DB_USER=your_db_user
   DB_PASSWORD=your_db_password
   DB_NAME=analysis
   DB_SSL=true
   PRODUCTION=true
   ```

6. Click "Create Web Service"
7. Wait for deployment (5-10 minutes)
8. Copy your backend URL: `https://analysisdoc-api.onrender.com`

---

## Step 3: Deploy Frontend on Vercel

1. Go to https://vercel.com/ and sign up (free)
2. Click "Add New" → "Project"
3. Import your GitHub repo
4. Configure:
   - **Root Directory**: `webapp/frontend`
   - **Framework Preset**: Other

5. Before deploying, update `app.js` with your backend URL:
   ```javascript
   const API_URL = 'https://analysisdoc-api.onrender.com';
   ```
   
   OR add to index.html before app.js:
   ```html
   <script>window.BACKEND_URL = 'https://analysisdoc-api.onrender.com';</script>
   ```

6. Click "Deploy"
7. Your app will be live at: `https://your-project.vercel.app`

---

## Step 4: Update CORS (if needed)

If you get CORS errors, update `main.py`:
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://your-project.vercel.app"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

---

## Free Tier Limits

### Render.com (Backend)
- 750 hours/month free
- Spins down after 15 min inactivity (cold start ~30s)
- 512MB RAM

### Vercel (Frontend)
- Unlimited static hosting
- 100GB bandwidth/month

### TiDB Cloud (Database)
- 5GB storage free
- 50M Request Units/month

### PlanetScale (Alternative DB)
- 5GB storage
- 1 billion row reads/month
- 10 million row writes/month

---

## Quick Deploy Commands

### Local Testing
```bash
cd webapp/backend
python -m venv venv
venv\Scripts\activate  # Windows
pip install -r requirements.txt
python main.py
```

### Push to GitHub
```bash
git add webapp/
git commit -m "Add webapp for deployment"
git push origin main
```

---

## Troubleshooting

### Backend not starting
- Check Render logs for errors
- Verify all environment variables are set
- Make sure DB_SSL=true for cloud databases

### Database connection failed
- Verify DB credentials
- Check if IP is whitelisted (TiDB/PlanetScale)
- Ensure SSL is enabled

### CORS errors
- Update allow_origins in main.py
- Redeploy backend

### Slow first request
- Render free tier has cold starts
- First request after inactivity takes ~30s
