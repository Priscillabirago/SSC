from datetime import datetime, time
from typing import Literal, Union

from pydantic import BaseModel, EmailStr, Field, validator


StudyWindowPreset = Literal["morning", "afternoon", "evening", "night"]


class CustomTimeRange(BaseModel):
    """Custom time range for study windows."""
    start: str = Field(..., description="Start time in HH:MM format (24-hour)")
    end: str = Field(..., description="End time in HH:MM format (24-hour)")
    
    @validator("start", "end")
    def validate_time_format(cls, v):
        """Validate time is in HH:MM format."""
        try:
            parts = v.split(":")
            if len(parts) != 2:
                raise ValueError("Time must be in HH:MM format")
            hour = int(parts[0])
            minute = int(parts[1])
            if not (0 <= hour <= 23 and 0 <= minute <= 59):
                raise ValueError("Invalid time values")
            return v
        except (ValueError, AttributeError) as e:
            raise ValueError(f"Invalid time format: {v}. Must be HH:MM") from e
    
    def to_time_tuple(self) -> tuple[time, time]:
        """Convert string times to time objects."""
        start_parts = self.start.split(":")
        end_parts = self.end.split(":")
        return (
            time(hour=int(start_parts[0]), minute=int(start_parts[1])),
            time(hour=int(end_parts[0]), minute=int(end_parts[1]))
        )


class StudyWindowConfig(BaseModel):
    """Study window configuration - supports both preset and custom ranges."""
    type: Literal["preset", "custom"]
    value: Union[StudyWindowPreset, CustomTimeRange]
    
    class Config:
        # Allow both dict and object creation
        extra = "forbid"


# For backward compatibility, also accept simple strings
PreferredStudyWindows = Union[
    list[StudyWindowPreset],  # Old format: ["morning", "evening"]
    list[StudyWindowConfig],   # New format: [{"type": "preset", "value": "morning"}, ...]
    list[dict],                # Raw dict format from frontend
]


class UserBase(BaseModel):
    email: EmailStr
    full_name: str | None = None
    timezone: str = "UTC"
    weekly_study_hours: int = Field(default=10, ge=0)
    preferred_study_windows: PreferredStudyWindows = Field(default_factory=list)
    max_session_length: int = Field(default=120, ge=15)
    break_duration: int = Field(default=15, ge=5)
    energy_tagging_enabled: bool = True


class UserCreate(UserBase):
    password: str


class UserUpdate(BaseModel):
    full_name: str | None = None
    timezone: str | None = None
    weekly_study_hours: int | None = Field(default=None, ge=0)
    preferred_study_windows: PreferredStudyWindows | None = None
    max_session_length: int | None = Field(default=None, ge=15)
    break_duration: int | None = Field(default=None, ge=5)
    energy_tagging_enabled: bool | None = None
    email: EmailStr | None = None  # Email change requires separate endpoint with password


class UserInDBBase(UserBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class UserPublic(UserInDBBase):
    pass

