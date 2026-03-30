from datetime import datetime, timedelta, timezone

from app.models.subject import Subject, SubjectDifficulty, SubjectPriority
from app.models.task import Task, TaskPriority
from app.models.user import User
from app.schemas.schedule import StudyBlock
from app.services.scheduling import calculate_weights, interleave_subjects


def _build_user() -> User:
    return User(
        id=1,
        email="test@example.com",
        hashed_password="hashed",
        timezone="UTC",
        weekly_study_hours=15,
        preferred_study_windows=["morning", "evening"],
        max_session_length=90,
        break_duration=15,
    )


def test_calculate_weights_prioritizes_deadlines():
    user = _build_user()
    reference = datetime.now(timezone.utc)
    calculus = Subject(
        id=1,
        user_id=user.id,
        name="Calculus",
        priority=SubjectPriority.HIGH,
        difficulty=SubjectDifficulty.HARD,
        workload=4,
    )
    history = Subject(
        id=2,
        user_id=user.id,
        name="History",
        priority=SubjectPriority.MEDIUM,
        difficulty=SubjectDifficulty.MEDIUM,
        workload=2,
    )
    urgent_task = Task(
        id=1,
        user_id=user.id,
        subject_id=calculus.id,
        title="Integration problem set",
        estimated_minutes=180,
        deadline=reference + timedelta(days=1),
        priority=TaskPriority.CRITICAL,
    )
    relaxed_task = Task(
        id=2,
        user_id=user.id,
        subject_id=history.id,
        title="Read chapter",
        estimated_minutes=60,
        deadline=reference + timedelta(days=6),
        priority=TaskPriority.MEDIUM,
    )

    weighted = calculate_weights(
        tasks=[urgent_task, relaxed_task],
        subjects=[calculus, history],
        reference=reference,
    )

    assert weighted[0].task.id == urgent_task.id
    assert weighted[0].weight > weighted[1].weight


def test_interleave_subjects_alternates_focus():
    """With task_priorities, swaps a later block to break same-subject adjacency."""
    reference = datetime.now(timezone.utc)
    sessions = [
        StudyBlock(
            start_time=reference,
            end_time=reference,
            subject_id=1,
            task_id=1,
            focus="A",
            energy_level="medium",
        ),
        StudyBlock(
            start_time=reference,
            end_time=reference,
            subject_id=1,
            task_id=2,
            focus="B",
            energy_level="medium",
        ),
        StudyBlock(
            start_time=reference,
            end_time=reference,
            subject_id=2,
            task_id=3,
            focus="C",
            energy_level="medium",
        ),
    ]
    priorities = {1: "MEDIUM", 2: "MEDIUM", 3: "MEDIUM"}
    reordered = interleave_subjects(sessions.copy(), priorities)
    assert reordered[0].subject_id == 1
    assert reordered[1].subject_id == 2


def test_interleave_subjects_no_priorities_returns_unchanged():
    reference = datetime.now(timezone.utc)
    sessions = [
        StudyBlock(
            start_time=reference,
            end_time=reference,
            subject_id=1,
            task_id=None,
            focus="A",
            energy_level="medium",
        ),
        StudyBlock(
            start_time=reference,
            end_time=reference,
            subject_id=2,
            task_id=None,
            focus="B",
            energy_level="medium",
        ),
    ]
    out = interleave_subjects(sessions.copy(), None)
    assert out == sessions

