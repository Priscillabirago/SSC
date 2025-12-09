from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from app.core.security import get_password_hash
from app.db.session import SessionLocal
from app.models.constraint import ConstraintType, ScheduleConstraint
from app.models.study_session import SessionStatus, StudySession
from app.models.subject import Subject, SubjectDifficulty, SubjectPriority
from app.models.task import Task, TaskPriority
from app.models.user import User


def seed_demo_data(db: Session) -> None:
    existing = db.query(User).filter(User.email == "demo@student.com").first()
    if existing:
        return
    user = User(
        email="demo@student.com",
        full_name="Demo Student",
        hashed_password=get_password_hash("password123"),
        timezone="America/New_York",
        weekly_study_hours=18,
        preferred_study_windows=["morning", "evening"],
        max_session_length=90,
        break_duration=10,
    )
    db.add(user)
    db.flush()

    subjects = [
        Subject(
            user_id=user.id,
            name="Calculus II",
            priority=SubjectPriority.HIGH,
            difficulty=SubjectDifficulty.HARD,
            workload=4,
            exam_date=datetime.utcnow().date() + timedelta(days=10),
            color="#0EA5E9",
        ),
        Subject(
            user_id=user.id,
            name="Modern Literature",
            priority=SubjectPriority.MEDIUM,
            difficulty=SubjectDifficulty.MEDIUM,
            workload=3,
            exam_date=datetime.utcnow().date() + timedelta(days=21),
            color="#F97316",
        ),
        Subject(
            user_id=user.id,
            name="Physics Lab",
            priority=SubjectPriority.HIGH,
            difficulty=SubjectDifficulty.MEDIUM,
            workload=2,
            exam_date=datetime.utcnow().date() + timedelta(days=5),
            color="#10B981",
        ),
    ]
    db.add_all(subjects)
    db.flush()

    tasks = [
        Task(
            user_id=user.id,
            subject_id=subjects[0].id,
            title="Problem Set 6",
            estimated_minutes=180,
            deadline=datetime.utcnow() + timedelta(days=2),
            priority=TaskPriority.CRITICAL,
        ),
        Task(
            user_id=user.id,
            subject_id=subjects[1].id,
            title="Read Chapters 4-5",
            estimated_minutes=120,
            deadline=datetime.utcnow() + timedelta(days=3),
            priority=TaskPriority.MEDIUM,
        ),
        Task(
            user_id=user.id,
            subject_id=subjects[2].id,
            title="Lab Report Draft",
            estimated_minutes=150,
            deadline=datetime.utcnow() + timedelta(days=1),
            priority=TaskPriority.HIGH,
        ),
        Task(
            user_id=user.id,
            title="Scholarship Essay Outline",
            estimated_minutes=90,
            deadline=datetime.utcnow() + timedelta(days=6),
            priority=TaskPriority.MEDIUM,
        ),
        Task(
            user_id=user.id,
            subject_id=subjects[0].id,
            title="Review Integration Techniques",
            estimated_minutes=60,
            deadline=datetime.utcnow() + timedelta(days=4),
            priority=TaskPriority.HIGH,
        ),
    ]
    db.add_all(tasks)

    constraints = [
        ScheduleConstraint(
            user_id=user.id,
            name="Work Shift",
            type=ConstraintType.BUSY,
            description="Part-time job",
            is_recurring=True,
            days_of_week=[1, 3, 5],
            start_time=datetime.strptime("17:00", "%H:%M").time(),
            end_time=datetime.strptime("21:00", "%H:%M").time(),
        ),
        ScheduleConstraint(
            user_id=user.id,
            name="Biology Lecture",
            type=ConstraintType.CLASS,
            description="Lecture block",
            is_recurring=True,
            days_of_week=[0, 2, 4],
            start_time=datetime.strptime("09:00", "%H:%M").time(),
            end_time=datetime.strptime("10:30", "%H:%M").time(),
        ),
        ScheduleConstraint(
            user_id=user.id,
            name="Self-care",
            type=ConstraintType.NO_STUDY,
            is_recurring=True,
            days_of_week=[6],
            start_time=datetime.strptime("10:00", "%H:%M").time(),
            end_time=datetime.strptime("14:00", "%H:%M").time(),
        ),
    ]
    db.add_all(constraints)
    db.flush()

    now = datetime.utcnow().replace(hour=8, minute=0, second=0, microsecond=0)
    sessions: list[StudySession] = []
    for day_offset in range(7):
        day_start = now + timedelta(days=day_offset)
        sessions.extend(
            [
                StudySession(
                    user_id=user.id,
                    subject_id=subjects[0].id,
                    start_time=day_start,
                    end_time=day_start + timedelta(minutes=75),
                    status=SessionStatus.COMPLETED if day_offset < 3 else SessionStatus.PLANNED,
                    generated_by="seed",
                ),
                StudySession(
                    user_id=user.id,
                    subject_id=subjects[1].id,
                    start_time=day_start + timedelta(hours=2),
                    end_time=day_start + timedelta(hours=3, minutes=30),
                    status=SessionStatus.COMPLETED if day_offset < 2 else SessionStatus.PLANNED,
                    generated_by="seed",
                ),
            ]
        )
    db.add_all(sessions)
    db.commit()


if __name__ == "__main__":
    with SessionLocal() as session:
        seed_demo_data(session)

