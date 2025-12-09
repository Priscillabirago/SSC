from functools import lru_cache

from app.coach.adapter import CoachAdapter
from app.coach.gemini_adapter import GeminiCoachAdapter
from app.coach.openai_adapter import OpenAICoachAdapter
from app.core.config import get_settings


@lru_cache
def get_coach_adapter() -> CoachAdapter:
    settings = get_settings()
    if settings.ai_provider == "gemini":
        return GeminiCoachAdapter(api_key=settings.gemini_api_key)
    return OpenAICoachAdapter(api_key=settings.openai_api_key)

