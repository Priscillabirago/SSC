from datetime import datetime

from pydantic import BaseModel


class ShareSessionPublic(BaseModel):
    start_time: datetime
    end_time: datetime
    focus: str | None
    status: str


class ShareDayPublic(BaseModel):
    date: str  # YYYY-MM-DD in user's timezone
    day_name: str  # e.g. "Monday"
    sessions: list[ShareSessionPublic]


class SharePlanPublic(BaseModel):
    display_name: str
    timezone: str
    week_start: str  # YYYY-MM-DD
    week_end: str
    days: list[ShareDayPublic]


class ShareTokenResponse(BaseModel):
    url: str
    expires_at: datetime | None
