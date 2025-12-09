from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api import deps
from app.db.session import get_db
from app.models.constraint import ScheduleConstraint
from app.models.user import User
from app.schemas.constraint import (
    ConstraintCreate,
    ConstraintPublic,
    ConstraintUpdate,
)

router = APIRouter()


def _get_constraint_or_404(
    db: Session, constraint_id: int, user: User
) -> ScheduleConstraint:
    constraint = (
        db.query(ScheduleConstraint)
        .filter(ScheduleConstraint.id == constraint_id, ScheduleConstraint.user_id == user.id)
        .first()
    )
    if not constraint:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Constraint not found"
        )
    return constraint


@router.get("/", response_model=list[ConstraintPublic])
def list_constraints(
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> list[ConstraintPublic]:
    return (
        db.query(ScheduleConstraint)
        .filter(ScheduleConstraint.user_id == current_user.id)
        .order_by(ScheduleConstraint.created_at.desc())
        .all()
    )


@router.post("/", response_model=ConstraintPublic, status_code=status.HTTP_201_CREATED)
def create_constraint(
    payload: ConstraintCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> ConstraintPublic:
    constraint = ScheduleConstraint(user_id=current_user.id, **payload.dict())
    db.add(constraint)
    db.commit()
    db.refresh(constraint)
    return constraint


@router.patch("/{constraint_id}", response_model=ConstraintPublic)
def update_constraint(
    constraint_id: int,
    payload: ConstraintUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> ConstraintPublic:
    constraint = _get_constraint_or_404(db, constraint_id, current_user)
    data = payload.dict(exclude_unset=True)
    for key, value in data.items():
        setattr(constraint, key, value)
    db.add(constraint)
    db.commit()
    db.refresh(constraint)
    return constraint


@router.delete("/{constraint_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_constraint(
    constraint_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> None:
    constraint = _get_constraint_or_404(db, constraint_id, current_user)
    db.delete(constraint)
    db.commit()

