from app.db.session import engine
from app.models import user, subject, task, study_session, daily_energy, daily_reflection, constraint, coach_memory
from app.db.base import Base

Base.metadata.create_all(bind=engine)
print("Database tables created!")
