# SSC (Smart Study Companion)

An AI-driven study organizer and academic coach for students. Features intelligent scheduling, task management, focus sessions, and personalized coaching.

**[Try it live →](https://ssc-eight-psi.vercel.app)**

You can also clone this repo and run it locally (see [Local Development](#local-development)).

## Key Features

- **Smart Scheduling**: AI-powered weekly study plan generation with optimization
- **Task Management**: Create and organize tasks with deadlines, priorities, and recurring patterns
- **Focus Sessions**: Pomodoro timer with focus mode and session tracking
- **AI Coach**: Personalized study advice, strategies, and daily reflections
- **Analytics**: Track productivity, adherence, and study patterns
- **Energy Tracking**: Monitor daily energy levels for optimal scheduling

## Tech Stack

- **Backend**: FastAPI (Python), SQLAlchemy, Alembic
- **Frontend**: Next.js, React, TypeScript, Tailwind CSS
- **AI**: OpenAI / Google Gemini integration
- **Database**: SQLite (development) / PostgreSQL (production)

## Local Development

### 1. Backend Setup

Create `backend/.env` (see `.env.example` at project root for reference). For local dev with SQLite:

```
DATABASE_URL=sqlite:///smart_study_companion.db
JWT_SECRET_KEY=change-me-for-local
AI_PROVIDER=gemini
GEMINI_API_KEY=your-key
```

Install dependencies and run:

```bash
pip install -r requirements.txt
python start.py       # creates DB tables if needed
uvicorn app.main:app --reload --port 8000
```

API docs: http://localhost:8000/docs

### 2. Frontend Setup

Create `frontend/.env.local` with `NEXT_PUBLIC_API_URL=http://localhost:8000` for local backend.

```bash
npm install
npm run dev
```

Frontend: http://localhost:3000

### Alternative: Full setup script

If you have PostgreSQL running locally, you can use `./setup-local.sh` then `./start-local.sh`. See those scripts for details.

## Deploying to Render

If your backend is on Render and you see `column users.plan_share_token does not exist`, the database schema is out of date. Run migrations:

### Option 1: Pre-Deploy Command (recommended)

Add a **Pre-Deploy Command** in your Render backend service:

- **Dashboard** → Your backend service → **Settings** → **Pre-Deploy Command**
- Set: `alembic upgrade head`

Render runs this before each deploy so migrations stay in sync. (Your build/start context is already in `backend/`, so no `cd` is needed.)

### Option 2: Run manually once

1. Go to Render Dashboard → Your backend service → **Shell**
2. Run: `alembic upgrade head` (or `cd backend && alembic upgrade head` if your shell starts at repo root)

Ensure `DATABASE_URL` is set in Render’s environment so Alembic connects to your PostgreSQL database.
