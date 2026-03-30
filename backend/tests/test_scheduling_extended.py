"""Additional unit tests for scheduling helpers: energy caps, constraints, empty plans."""

from datetime import datetime, time, timedelta, timezone

from app.models.constraint import ConstraintType, ScheduleConstraint
from app.models.daily_energy import EnergyLevel
from app.models.subject import Subject, SubjectDifficulty, SubjectPriority
from app.models.task import Task, TaskPriority
from app.models.user import User
from app.schemas.schedule import DailyPlan
from app.services.scheduling import (
    _energy_cap,
    apply_constraints,
    build_weekly_plan,
    calculate_weights,
)


def test_energy_cap_high_exceeds_medium():
    user_max = 180
    assert _energy_cap(EnergyLevel.HIGH, user_max) == 120
    assert _energy_cap(EnergyLevel.MEDIUM, user_max) == 90
    assert _energy_cap(EnergyLevel.LOW, user_max) == 45


def test_energy_cap_respects_user_max_when_lower_than_energy_default():
    """User max_session_length below ENERGY_SESSION_CAP should win."""
    assert _energy_cap(EnergyLevel.HIGH, 30) == 30


def test_apply_constraints_splits_block_around_busy_window():
    """Blocked local-time window removes overlap from a study window."""
    from zoneinfo import ZoneInfo

    user_tz = ZoneInfo("UTC")
    # One block: 10:00–14:00 UTC (naive UTC storage as in scheduler)
    block_start = datetime(2026, 3, 2, 10, 0, 0)
    block_end = datetime(2026, 3, 2, 14, 0, 0)
    blocks = [(block_start, block_end)]

    c = ScheduleConstraint(
        user_id=1,
        name="Busy",
        type=ConstraintType.BUSY,
        is_recurring=True,
        days_of_week=[0],  # Monday — 2026-03-02 is Monday
        start_time=time(11, 0),
        end_time=time(13, 0),
    )
    out = apply_constraints(blocks, [c], user_tz)
    assert len(out) == 2
    assert out[0] == (block_start, datetime(2026, 3, 2, 11, 0, 0))
    assert out[1] == (datetime(2026, 3, 2, 13, 0, 0), block_end)


def test_apply_constraints_empty_when_no_overlap():
    assert apply_constraints([], [], None) == []


def _sample_user() -> User:
    u = User(
        id=1,
        email="u@example.com",
        timezone="UTC",
        weekly_study_hours=10,
        preferred_study_windows=["evening"],
        max_session_length=90,
        break_duration=15,
    )
    hp = next(c for c in User.__table__.columns if c.name.startswith("hashed_"))
    setattr(u, hp.key, "x")
    return u


def test_build_weekly_plan_no_tasks_yields_empty_sessions():
    user = _sample_user()
    ref = datetime(2026, 3, 2, 12, 0, 0, tzinfo=timezone.utc)
    plan = build_weekly_plan(user, [], [], {}, ref)
    assert len(plan.days) == 7
    assert all(isinstance(d, DailyPlan) for d in plan.days)
    assert all(len(d.sessions) == 0 for d in plan.days)


def test_calculate_weights_skips_completed_and_templates():
    sub = Subject(
        id=1,
        user_id=1,
        name="S",
        priority=SubjectPriority.MEDIUM,
        difficulty=SubjectDifficulty.MEDIUM,
        workload=3,
        color="#000",
    )
    t_done = Task(
        id=1,
        user_id=1,
        subject_id=1,
        title="Done",
        estimated_minutes=60,
        priority=TaskPriority.MEDIUM,
        is_completed=True,
        is_recurring_template=False,
    )
    t_tpl = Task(
        id=2,
        user_id=1,
        subject_id=1,
        title="Template",
        estimated_minutes=60,
        priority=TaskPriority.MEDIUM,
        is_completed=False,
        is_recurring_template=True,
    )
    t_open = Task(
        id=3,
        user_id=1,
        subject_id=1,
        title="Open",
        estimated_minutes=60,
        priority=TaskPriority.MEDIUM,
        is_completed=False,
        is_recurring_template=False,
    )
    ref = datetime(2026, 3, 2, 12, 0, 0, tzinfo=timezone.utc)
    weighted = calculate_weights([t_done, t_tpl, t_open], [sub], ref, None)
    assert len(weighted) == 1
    assert weighted[0].task.id == 3


def test_allocate_sessions_respects_energy_cap_via_build_weekly_plan():
    """HIGH energy uses longer session cap than LOW when tasks exist."""
    from zoneinfo import ZoneInfo

    user = _sample_user()
    user.max_session_length = 120
    sub = Subject(
        id=1,
        user_id=1,
        name="Math",
        priority=SubjectPriority.HIGH,
        difficulty=SubjectDifficulty.MEDIUM,
        workload=3,
        color="#000",
    )
    ref = datetime(2026, 3, 2, 18, 0, 0, tzinfo=timezone.utc)  # Monday evening window
    day_local = ref.astimezone(ZoneInfo("UTC")).date()
    energy_high = {day_local: EnergyLevel.HIGH}
    energy_low = {day_local: EnergyLevel.LOW}

    def make_task(tid: int) -> Task:
        return Task(
            id=tid,
            user_id=1,
            subject_id=1,
            title="Big",
            estimated_minutes=500,
            priority=TaskPriority.MEDIUM,
            is_completed=False,
            is_recurring_template=False,
        )

    wt_high = calculate_weights([make_task(10)], [sub], ref, ZoneInfo("UTC"))
    wt_low = calculate_weights([make_task(11)], [sub], ref, ZoneInfo("UTC"))
    assert wt_high and wt_low

    plan_high = build_weekly_plan(user, wt_high, [], energy_high, ref)
    plan_low = build_weekly_plan(user, wt_low, [], energy_low, ref)

    def first_session_minutes(plan) -> int:
        for d in plan.days:
            if d.sessions:
                s = d.sessions[0]
                return int((s.end_time - s.start_time).total_seconds() // 60)
        return 0

    hi = first_session_minutes(plan_high)
    lo = first_session_minutes(plan_low)
    assert hi > 0 and lo > 0
    assert hi > lo


def test_build_weekly_plan_two_subjects_three_open_tasks_allocates_sessions():
    """Smoke: multiple subjects and tasks produce at least one scheduled block."""
    from zoneinfo import ZoneInfo

    user = _sample_user()
    sub_a = Subject(
        id=1,
        user_id=1,
        name="A",
        priority=SubjectPriority.HIGH,
        difficulty=SubjectDifficulty.MEDIUM,
        workload=3,
        color="#000",
    )
    sub_b = Subject(
        id=2,
        user_id=1,
        name="B",
        priority=SubjectPriority.MEDIUM,
        difficulty=SubjectDifficulty.MEDIUM,
        workload=3,
        color="#111",
    )
    ref = datetime(2026, 3, 2, 18, 0, 0, tzinfo=timezone.utc)
    tasks = [
        Task(
            id=i,
            user_id=1,
            subject_id=1 if i <= 2 else 2,
            title=f"T{i}",
            estimated_minutes=90,
            priority=TaskPriority.MEDIUM,
            is_completed=False,
            is_recurring_template=False,
        )
        for i in (1, 2, 3)
    ]
    wt = calculate_weights(tasks, [sub_a, sub_b], ref, ZoneInfo("UTC"))
    assert len(wt) == 3
    day_local = ref.astimezone(ZoneInfo("UTC")).date()
    plan = build_weekly_plan(user, wt, [], {day_local: EnergyLevel.MEDIUM}, ref)
    all_sessions = [s for d in plan.days for s in d.sessions]
    assert len(all_sessions) >= 1
    subjects_seen = {s.subject_id for s in all_sessions if s.subject_id is not None}
    assert len(subjects_seen) >= 1
