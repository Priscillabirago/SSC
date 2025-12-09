from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api import deps
from app.db.session import get_db
from app.models.daily_energy import DailyEnergy, EnergyLevel
from app.models.user import User
from app.schemas.energy import DailyEnergyCreate, DailyEnergyPublic

router = APIRouter()


@router.get("/", response_model=list[DailyEnergyPublic])
def list_energy_logs(
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> list[DailyEnergyPublic]:
    return (
        db.query(DailyEnergy)
        .filter(DailyEnergy.user_id == current_user.id)
        .order_by(DailyEnergy.day.desc())
        .limit(30)
        .all()
    )


@router.get("/today", response_model=DailyEnergyPublic | None)
def get_today_energy(
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> DailyEnergyPublic | None:
    """Get today's energy log in the user's timezone."""
    from zoneinfo import ZoneInfo
    from datetime import datetime
    
    # Get today in user's timezone
    try:
        tz = ZoneInfo(current_user.timezone)
    except Exception:
        tz = ZoneInfo("UTC")
    today = datetime.now(tz).date()
    
    return (
        db.query(DailyEnergy)
        .filter(DailyEnergy.user_id == current_user.id, DailyEnergy.day == today)
        .first()
    )


@router.post("/", response_model=DailyEnergyPublic, status_code=status.HTTP_201_CREATED)
def upsert_energy(
    payload: DailyEnergyCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> DailyEnergyPublic:
    record = (
        db.query(DailyEnergy)
        .filter(DailyEnergy.user_id == current_user.id, DailyEnergy.day == payload.day)
        .first()
    )
    if record:
        record.level = payload.level
    else:
        record = DailyEnergy(
            user_id=current_user.id,
            day=payload.day,
            level=payload.level,
        )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record

