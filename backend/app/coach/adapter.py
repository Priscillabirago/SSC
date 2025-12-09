from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, Protocol

from app.models.user import User


class CoachAdapter(ABC):
    """Interface for AI coach providers."""

    @abstractmethod
    def chat(self, user: User, message: str, context: dict[str, Any]) -> dict[str, Any]:
        """Return a structured AI response to a user message."""

    @abstractmethod
    def suggest_plan(self, user: User, context: dict[str, Any]) -> dict[str, Any]:
        """Suggest adjustments to the user's study plan."""

    @abstractmethod
    def reflect_day(
        self, user: User, worked: str, challenging: str, context: dict[str, Any]
    ) -> dict[str, Any]:
        """Summarize daily reflection and propose an action."""

    @abstractmethod
    def micro_plan(
        self, user: User, minutes: int, context: dict[str, Any]
    ) -> dict[str, Any]:
        """Produce a short, time-bound plan."""
    
    @abstractmethod
    def prepare_session(
        self, user: User, session_context: dict[str, Any], context: dict[str, Any]
    ) -> dict[str, Any]:
        """Provide research-backed preparation suggestions for a study session."""
    
    @abstractmethod
    def generate_dashboard_insights(
        self, user: User, analytics_context: dict[str, Any], context: dict[str, Any]
    ) -> dict[str, Any]:
        """Generate personalized insights, feedback, and recommendations for the dashboard."""
    
    @abstractmethod
    def optimize_schedule(
        self, user: User, schedule_context: dict[str, Any], context: dict[str, Any]
    ) -> dict[str, Any]:
        """Review and optimize a generated schedule for better real-world efficiency."""


class MemoryStore(Protocol):
    def add(self, *, user_id: int, topic: str, content: str, source: str) -> None:
        ...

    def recent(self, user_id: int, limit: int = 10) -> list[str]:
        ...

