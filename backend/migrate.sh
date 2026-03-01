#!/usr/bin/env bash
# Run Alembic migrations. Use this as Render's Release Command.
set -e
cd "$(dirname "$0")"
python -m alembic upgrade head
