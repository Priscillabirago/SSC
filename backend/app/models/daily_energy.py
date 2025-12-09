from datetime import date, datetime
from enum import Enum as PyEnum

from sqlalchemy import Column, Date, DateTime, Enum as SQLEnum, ForeignKey, Integer
from sqlalchemy.orm import relationship

from app.db.base import Base


class EnergyLevel(str, PyEnum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class DailyEnergy(Base):
    __tablename__ = "daily_energy"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    day = Column(Date, nullable=False)
    level = Column(SQLEnum(EnergyLevel), nullable=False, default=EnergyLevel.MEDIUM)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )

    user = relationship("User", back_populates="energy_logs")

