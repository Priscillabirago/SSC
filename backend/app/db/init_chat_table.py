from app.db.session import engine
from app.models import coach_message
from app.db.base import Base

if __name__ == "__main__":
    print("Creating chat message table (if not exists)...")
    Base.metadata.create_all(bind=engine, tables=[coach_message.CoachMessage.__table__])
    print("Done.")
