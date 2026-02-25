"""Startup script for production deployment.

On a fresh database (no tables), creates all tables from models and stamps
Alembic to head. On an existing database, runs Alembic migrations normally.
"""

import subprocess
import sys

from sqlalchemy import inspect

from app.db.session import engine
from app.db.base import Base
from app.models import (  # noqa: F401
    CoachMemory, CoachMessage, DailyEnergy, DailyReflection,
    ScheduleConstraint, StudySession, Subject, Task, User,
)


def main():
    inspector = inspect(engine)
    tables = inspector.get_table_names()

    if "users" not in tables:
        print("Fresh database detected — creating all tables...")
        Base.metadata.create_all(bind=engine)
        print("Tables created. Stamping Alembic to head...")
        subprocess.check_call([sys.executable, "-m", "alembic", "stamp", "head"])
        print("Done.")
    else:
        print("Existing database — running migrations...")
        subprocess.check_call([sys.executable, "-m", "alembic", "upgrade", "head"])
        print("Migrations complete.")


if __name__ == "__main__":
    main()
