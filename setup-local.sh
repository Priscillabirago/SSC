#!/bin/bash

# Setup script for local development

echo "🚀 Setting up Smart Study Companion for local development..."

# Create backend .env file
echo "📝 Creating backend/.env file..."
cat > backend/.env << 'EOF'
DATABASE_URL=postgresql+psycopg2://postgres:postgres@localhost:5432/smart_study_companion
JWT_SECRET_KEY=change-me-in-production
AI_PROVIDER=openai
OPENAI_API_KEY=add-your-openai-key-here
GEMINI_API_KEY=
EOF

# Create frontend .env.local file
echo "📝 Creating frontend/.env.local file..."
cat > frontend/.env.local << 'EOF'
NEXT_PUBLIC_API_URL=http://localhost:8000
EOF

# Install backend dependencies
echo "📦 Installing backend dependencies..."
cd backend
if ! command -v poetry &> /dev/null; then
    echo "⚠️  Poetry not found. Installing..."
    pip install poetry
fi
poetry install

# Run migrations
echo "🔄 Running database migrations..."
poetry run alembic upgrade head

# Seed database
echo "🌱 Seeding database..."
poetry run python -m app.db.seed

cd ..

# Install frontend dependencies
echo "📦 Installing frontend dependencies..."
cd frontend
npm install

cd ..

echo "✅ Setup complete!"
echo ""
echo "To start the application:"
echo "  1. Make sure PostgreSQL is running on port 5432"
echo "  2. Run: ./start-local.sh"

