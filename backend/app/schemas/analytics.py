from datetime import date

from pydantic import BaseModel

from app.schemas.session import StudySessionPublic
from app.schemas.task import TaskPublic


class StudyingNowResponse(BaseModel):
    count: int


class TrendPoint(BaseModel):
    day: date
    completed_minutes: int
    scheduled_minutes: int


class AnalyticsOverview(BaseModel):
    adherence_rate: float
    completion_rate: float
    streak: int
    time_distribution: dict[str, int]
    productivity_trend: list[TrendPoint]
    upcoming_tasks: list[TaskPublic]
    today_plan: list[StudySessionPublic]
    weekly_hours_completed: float | None = None  # Hours completed this week
    weekly_hours_target: int | None = None  # User's weekly target


class DashboardInsight(BaseModel):
    type: str  # "celebration", "warning", "recommendation", "observation"
    title: str
    message: str
    action: str | None = None  # Optional actionable step


class DashboardInsightsResponse(BaseModel):
    insights: list[DashboardInsight]
    motivational_message: str
    overall_tone: str  # "positive", "neutral", "needs_attention"


class SubjectPerformance(BaseModel):
    subject_name: str
    time_spent_minutes: int
    tasks_total: int
    tasks_completed: int
    completion_rate: float
    sessions_total: int
    sessions_completed: int
    adherence_rate: float


class EnergyProductivity(BaseModel):
    energy_level: str  # "low", "medium", "high"
    sessions_count: int
    completed_count: int
    completion_rate: float
    average_duration_minutes: float


class DayAdherence(BaseModel):
    day_name: str  # "Monday", "Tuesday", etc.
    sessions_scheduled: int
    sessions_completed: int
    adherence_rate: float


class DetailedAnalytics(BaseModel):
    time_range_start: date
    time_range_end: date
    total_sessions: int
    completed_sessions: int
    overall_adherence: float
    total_time_minutes: int
    subject_performance: list[SubjectPerformance]
    energy_productivity: list[EnergyProductivity]
    day_adherence: list[DayAdherence]
    productivity_trend: list[TrendPoint]
    time_distribution: dict[str, int]

