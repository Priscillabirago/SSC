"""generate_next_instance_on_completion creates the following instance after completion."""

from datetime import datetime, timedelta, timezone

from app.models.subject import Subject, SubjectDifficulty, SubjectPriority
from app.models.task import Task, TaskPriority
from app.services.recurring_tasks import generate_next_instance_on_completion


def test_generate_next_instance_on_daily_completion(db_session, test_user):
    sub = Subject(
        user_id=test_user.id,
        name="RSub",
        priority=SubjectPriority.HIGH,
        difficulty=SubjectDifficulty.MEDIUM,
        workload=2,
        color="#000",
    )
    db_session.add(sub)
    db_session.flush()

    template = Task(
        user_id=test_user.id,
        subject_id=sub.id,
        title="Daily task",
        estimated_minutes=30,
        priority=TaskPriority.MEDIUM,
        is_recurring_template=True,
        recurrence_pattern={"frequency": "daily", "interval": 1},
        is_completed=False,
    )
    db_session.add(template)
    db_session.flush()

    base = datetime(2026, 4, 1, 15, 0, 0, tzinfo=timezone.utc)
    instance = Task(
        user_id=test_user.id,
        subject_id=sub.id,
        title="Daily task",
        estimated_minutes=30,
        priority=TaskPriority.MEDIUM,
        is_recurring_template=False,
        recurring_template_id=template.id,
        deadline=base,
        is_completed=True,
    )
    db_session.add(instance)
    db_session.commit()

    new_inst = generate_next_instance_on_completion(db_session, instance)
    assert new_inst is not None
    assert new_inst.recurring_template_id == template.id
    assert new_inst.deadline is not None
    assert new_inst.deadline.date() == (base + timedelta(days=1)).date()

    db_session.refresh(template)
    assert template.next_occurrence_date is not None


def test_generate_next_instance_returns_none_when_next_day_already_scheduled(
    db_session, test_user
):
    """Duplicate guard: do not create a second instance for the same deadline day."""
    sub = Subject(
        user_id=test_user.id,
        name="DupSub",
        priority=SubjectPriority.MEDIUM,
        difficulty=SubjectDifficulty.MEDIUM,
        workload=2,
        color="#000",
    )
    db_session.add(sub)
    db_session.flush()

    template = Task(
        user_id=test_user.id,
        subject_id=sub.id,
        title="Daily",
        estimated_minutes=20,
        priority=TaskPriority.MEDIUM,
        is_recurring_template=True,
        recurrence_pattern={"frequency": "daily", "interval": 1},
        is_completed=False,
    )
    db_session.add(template)
    db_session.flush()

    day1 = datetime(2026, 7, 1, 9, 0, 0, tzinfo=timezone.utc)
    day2 = datetime(2026, 7, 2, 9, 0, 0, tzinfo=timezone.utc)

    completed = Task(
        user_id=test_user.id,
        subject_id=sub.id,
        title="Daily",
        estimated_minutes=20,
        priority=TaskPriority.MEDIUM,
        is_recurring_template=False,
        recurring_template_id=template.id,
        deadline=day1,
        is_completed=True,
    )
    already_next = Task(
        user_id=test_user.id,
        subject_id=sub.id,
        title="Daily",
        estimated_minutes=20,
        priority=TaskPriority.MEDIUM,
        is_recurring_template=False,
        recurring_template_id=template.id,
        deadline=day2,
        is_completed=False,
    )
    db_session.add_all([completed, already_next])
    db_session.commit()

    assert generate_next_instance_on_completion(db_session, completed) is None


def test_generate_next_instance_returns_none_without_template_link(db_session, test_user):
    orphan = Task(
        user_id=test_user.id,
        subject_id=None,
        title="Solo",
        estimated_minutes=30,
        priority=TaskPriority.MEDIUM,
        is_recurring_template=False,
        deadline=datetime.now(timezone.utc),
        is_completed=True,
    )
    db_session.add(orphan)
    db_session.commit()
    assert generate_next_instance_on_completion(db_session, orphan) is None
