from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class CoachMessageBase(BaseModel):
    role: Literal["user", "assistant", "system"]
    content: str


class CoachMessageCreate(CoachMessageBase):
    pass


class CoachMessageDB(CoachMessageBase):
    id: int
    user_id: int
    created_at: datetime

    class Config:
        from_attributes = True
        json_encoders = {
            datetime: lambda v: v.isoformat() if v else None
        }


class CoachMessagePublic(CoachMessageDB):
    pass


class CoachChatRequest(BaseModel):
    message: str


class CoachChatResponse(BaseModel):
    reply: str
    follow_up: str | None = None
    plan_adjusted: bool = False


class CoachPlanSuggestion(BaseModel):
    summary: str
    highlights: list[str]
    action_items: list[str]


class CoachMicroPlanRequest(BaseModel):
    minutes: int


class CoachMicroPlanResponse(BaseModel):
    slots: list[str]
    rationale: str


class CoachReflectionRequest(BaseModel):
    worked: str
    challenging: str


class CoachReflectionResponse(BaseModel):
    summary: str
    blockers: list[str]
    suggestion: str


class SessionPreparationRequest(BaseModel):
    session_id: int


class SessionPreparationResponse(BaseModel):
    tips: list[str] = Field(..., description="3-5 actionable, research-backed study tips")
    strategy: str = Field(..., description="Recommended study strategy (e.g., 'Active Recall', 'Spaced Repetition')")
    rationale: str = Field(..., description="Brief explanation of why this approach is effective")


class DailySummaryResponse(BaseModel):
    summary: str
    tomorrow_tip: str
    tone: Literal["positive", "neutral", "encouraging"]
    last_session_end: str | None = None  # ISO datetime when last session ended
    first_session_start: str | None = None  # ISO datetime when first session starts today
    has_remaining_sessions: bool = False  # True if there are more PLANNED sessions today
    user_timezone: str = "UTC"  # User's timezone for frontend comparisons


class SessionEncouragementRequest(BaseModel):
    elapsed_minutes: int
    remaining_minutes: int
    progress_percent: float
    task_title: str | None = None
    is_paused: bool = False
    pomodoro_count: int = 0


class SessionEncouragementResponse(BaseModel):
    message: str
    tone: Literal["motivational", "celebratory", "supportive"]

