from datetime import date, datetime

from pydantic import BaseModel

from app.models.daily_energy import EnergyLevel


class DailyEnergyBase(BaseModel):
    day: date
    level: EnergyLevel


class DailyEnergyCreate(DailyEnergyBase):
    pass


class DailyEnergyPublic(DailyEnergyBase):
    id: int
    user_id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

