from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings
from pydantic import Field, computed_field

_LOCALHOST_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3001",
]


class Settings(BaseSettings):
    environment: Literal["development", "staging", "production"] = Field(
        default="development"
    )
    database_url: str = Field(..., env="DATABASE_URL")
    jwt_secret_key: str = Field(..., env="JWT_SECRET_KEY")
    jwt_algorithm: str = Field(default="HS256")
    access_token_expire_minutes: int = Field(default=60 * 24)
    refresh_token_expire_minutes: int = Field(default=60 * 24 * 7)

    ai_provider: Literal["openai", "gemini"] = Field(default="openai")
    openai_api_key: str | None = Field(default=None, env="OPENAI_API_KEY")
    gemini_api_key: str | None = Field(default=None, env="GEMINI_API_KEY")

    cors_origins_env: str | None = Field(default=None, env="CORS_ORIGINS")

    @computed_field
    @property
    def cors_origins(self) -> list[str]:
        if self.cors_origins_env:
            origins = [o.strip() for o in self.cors_origins_env.split(",") if o.strip()]
            return list(set(origins + _LOCALHOST_ORIGINS))
        return _LOCALHOST_ORIGINS

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = False


@lru_cache
def get_settings() -> Settings:
    return Settings()

