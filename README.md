# SAC (Smart Study Companion)

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

### 2. Install Python Dependencies

```
cd backend
pip install -r requirements.txt
```

### 3. Run Backend Locally

```
cd backend
uvicorn app.main:app --reload
```

- The backend will use a local SQLite file (`../smart_study_companion.db`) for storage.


## Frontend Setup
_(unchanged; refer to prior instructions for Next.js)_

