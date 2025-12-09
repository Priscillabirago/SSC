#!/bin/bash

# Docker initialization script - run this after docker compose up

echo "🔄 Running database migrations..."
docker exec -it ssc_backend alembic upgrade head

echo "🌱 Seeding database with demo data..."
docker exec -it ssc_backend python -m app.db.seed

echo "✅ Database initialized!"
echo ""
echo "You can now login at http://localhost:3000 with:"
echo "  Email: demo@student.com"
echo "  Password: password123"

