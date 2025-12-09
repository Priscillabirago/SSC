from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api import deps
from app.db.session import get_db
from app.models.subject import Subject
from app.models.user import User
from app.schemas.subject import SubjectCreate, SubjectPublic, SubjectUpdate

router = APIRouter()


def _get_subject_or_404(db: Session, subject_id: int, user: User) -> Subject:
    subject = (
        db.query(Subject)
        .filter(Subject.id == subject_id, Subject.user_id == user.id)
        .first()
    )
    if not subject:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Subject not found"
        )
    return subject


@router.get("/", response_model=list[SubjectPublic])
def list_subjects(
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> list[SubjectPublic]:
    return (
        db.query(Subject)
        .filter(Subject.user_id == current_user.id)
        .order_by(Subject.priority.desc())
        .all()
    )


@router.post("/", response_model=SubjectPublic, status_code=status.HTTP_201_CREATED)
def create_subject(
    payload: SubjectCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> SubjectPublic:
    subject = Subject(user_id=current_user.id, **payload.dict())
    db.add(subject)
    db.commit()
    db.refresh(subject)
    return subject


@router.put("/{subject_id}", response_model=SubjectPublic)
def update_subject(
    subject_id: int,
    payload: SubjectUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> SubjectPublic:
    subject = _get_subject_or_404(db, subject_id, current_user)
    data = payload.dict(exclude_unset=True)
    for key, value in data.items():
        setattr(subject, key, value)
    db.add(subject)
    db.commit()
    db.refresh(subject)
    return subject


@router.delete("/{subject_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_subject(
    subject_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> None:
    subject = _get_subject_or_404(db, subject_id, current_user)
    db.delete(subject)
    db.commit()

