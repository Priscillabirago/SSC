import secrets
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, status

from sqlalchemy.orm import Session

from app.api import deps
from app.db.session import get_db
from app.models.study_session import StudySession
from app.models.user import User
from app.schemas.share import ShareDayPublic, SharePlanPublic, ShareSessionPublic, ShareTokenResponse

router = APIRouter()

TOKEN_EXPIRY_DAYS = 7


def _session_focus(session: StudySession) -> str | None:
    if session.task and session.task.title:
        return session.task.title
    if session.subject and session.subject.name:
        return session.subject.name
    if session.notes:
        return session.notes
    return None


def _get_week_boundaries(user_tz: ZoneInfo) -> tuple[datetime, datetime]:
    """Return (week_start_utc, week_end_utc) for the current week (Mon–Sun) in user's timezone."""
    now_local = datetime.now(user_tz)
    today = now_local.date()
    days_since_monday = today.weekday()
    monday = today - timedelta(days=days_since_monday)
    # Week: Monday 00:00 to next Monday 00:00 (exclusive) in user tz
    week_start_local = datetime.combine(monday, datetime.min.time()).replace(tzinfo=user_tz)
    week_end_local = week_start_local + timedelta(days=7)
    week_start_utc = week_start_local.astimezone(timezone.utc)
    week_end_utc = week_end_local.astimezone(timezone.utc)
    return week_start_utc, week_end_utc


def _get_base_url_for_share() -> str:
    """Return the frontend base URL for constructing share links."""
    import os
    return os.environ.get("FRONTEND_URL", "http://localhost:3000")


@router.post("", response_model=ShareTokenResponse)
def create_share_token(
    db: Session = Depends(get_db),  # noqa: B008 # NOSONAR
    current_user: User = Depends(deps.get_current_user),  # noqa: B008 # NOSONAR
) -> ShareTokenResponse:
    """Create or regenerate a shareable link for the user's weekly plan."""
    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(days=TOKEN_EXPIRY_DAYS)

    current_user.plan_share_token = token
    current_user.plan_share_expires_at = expires_at
    db.add(current_user)
    db.commit()

    base_url = _get_base_url_for_share()
    url = f"{base_url.rstrip('/')}/share/{token}"
    return ShareTokenResponse(url=url, expires_at=expires_at)


@router.delete("")
def revoke_share_token(
    db: Session = Depends(get_db),  # noqa: B008 # NOSONAR
    current_user: User = Depends(deps.get_current_user),  # noqa: B008 # NOSONAR
) -> None:
    """Revoke the share link. The token will no longer work."""
    current_user.plan_share_token = None
    current_user.plan_share_expires_at = None
    db.add(current_user)
    db.commit()


@router.get("/{token}", response_model=SharePlanPublic)
def get_shared_plan(
    token: str,
    db: Session = Depends(get_db),  # noqa: B008 # NOSONAR
) -> SharePlanPublic:
    """Public endpoint: return the weekly plan for the given share token."""
    user = db.query(User).filter(User.plan_share_token == token).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Link not found or expired")

    now = datetime.now(timezone.utc)
    if user.plan_share_expires_at and user.plan_share_expires_at < now:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Link has expired")

    try:
        tz = ZoneInfo(user.timezone)
    except Exception:
        tz = ZoneInfo("UTC")

    week_start_utc, week_end_utc = _get_week_boundaries(tz)
    monday_local = datetime.now(tz).date()
    days_since_monday = monday_local.weekday()
    monday_local = monday_local - timedelta(days=days_since_monday)

    from sqlalchemy.orm import joinedload

    sessions_with_relations = (
        db.query(StudySession)
        .options(
            joinedload(StudySession.task),
            joinedload(StudySession.subject),
        )
        .filter(
            StudySession.user_id == user.id,
            StudySession.start_time >= week_start_utc,
            StudySession.start_time < week_end_utc,
        )
        .order_by(StudySession.start_time)
        .all()
    )

    day_names = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    days_out: list[ShareDayPublic] = []

    for i in range(7):
        day_date = monday_local + timedelta(days=i)
        day_start_local = datetime.combine(day_date, datetime.min.time()).replace(tzinfo=tz)
        day_end_local = day_start_local + timedelta(days=1)
        day_start_utc = day_start_local.astimezone(timezone.utc)
        day_end_utc = day_end_local.astimezone(timezone.utc)

        def _utc(dt: datetime):
            if dt.tzinfo is None:
                return dt.replace(tzinfo=timezone.utc)
            return dt.astimezone(timezone.utc)

        day_sessions = [
            s
            for s in sessions_with_relations
            if day_start_utc <= _utc(s.start_time) < day_end_utc
        ]

        share_sessions = [
            ShareSessionPublic(
                start_time=s.start_time,
                end_time=s.end_time,
                focus=_session_focus(s),
                status=s.status.value,
            )
            for s in day_sessions
        ]

        days_out.append(
            ShareDayPublic(
                date=day_date.isoformat(),
                day_name=day_names[i],
                sessions=share_sessions,
            )
        )

    display_name = (user.full_name or "").strip().split()[0] if user.full_name else "A student"

    return SharePlanPublic(
        display_name=display_name,
        timezone=user.timezone,
        week_start=monday_local.isoformat(),
        week_end=(monday_local + timedelta(days=6)).isoformat(),
        days=days_out,
    )
