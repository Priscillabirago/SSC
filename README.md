# SSC (Smart Study Companion) 

An AI-driven study organizer and academic coach for students. Features intelligent scheduling, task management, focus sessions, and personalized coaching.

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

## Backend Setup (Simplified)

### 1. Set Environment Variables

Edit `env/backend.env` to set your database and API keys, for example:

```
DATABASE_URL=sqlite:///../smart_study_companion.db
JWT_SECRET_KEY=change-me
AI_PROVIDER=openai
OPENAI_API_KEY=your-openai-key
GEMINI_API_KEY=
```

### 2. Install Python Dependencies and Run Backend

```
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload
```

- The backend will use a local SQLite file (`../smart_study_companion.db`) for storage.


## 3. Frontend Setup (from project root)

```
cd frontend
npm install
npm run dev
```



