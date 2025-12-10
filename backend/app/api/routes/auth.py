from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api import deps
from app.core.config import get_settings
from app.core.security import (
    create_access_token,
    create_refresh_token,
    create_password_reset_token,
    decode_token,
    get_password_hash,
    verify_password,
)
from app.db.session import get_db
from app.models.user import User
from app.schemas import auth as auth_schema
from app.schemas.user import UserPublic

router = APIRouter()


@router.post("/register", response_model=auth_schema.TokenPair)
def register_user(
    payload: auth_schema.RegisterRequest,
    db: Session = Depends(get_db),
) -> auth_schema.TokenPair:
    existing = db.query(User).filter(User.email == payload.email).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered"
        )
    user = User(
        email=payload.email,
        full_name=payload.full_name,
        hashed_password=get_password_hash(payload.password),
        timezone=payload.timezone,
        preferred_study_windows=["evening"],
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return auth_schema.TokenPair(
        access_token=create_access_token(user.id),
        refresh_token=create_refresh_token(user.id),
    )


@router.post("/login", response_model=auth_schema.TokenPair)
def login_user(
    payload: auth_schema.LoginRequest,
    db: Session = Depends(get_db),
) -> auth_schema.TokenPair:
    user = db.query(User).filter(User.email == payload.email).first()
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )
    return auth_schema.TokenPair(
        access_token=create_access_token(user.id),
        refresh_token=create_refresh_token(user.id),
    )


@router.post("/refresh", response_model=auth_schema.TokenPair)
def refresh_token(
    payload: auth_schema.RefreshRequest,
    db: Session = Depends(get_db),
) -> auth_schema.TokenPair:
    try:
        data = decode_token(payload.refresh_token)
        if data.get("type") != "refresh":
            raise ValueError("Invalid refresh token")
        user_id = int(data["sub"])
    except (ValueError, KeyError) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
        ) from exc
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )
    return auth_schema.TokenPair(
        access_token=create_access_token(user.id),
        refresh_token=create_refresh_token(user.id),
    )


@router.post("/forgot-password")
def forgot_password(
    payload: auth_schema.ForgotPasswordRequest,
    db: Session = Depends(get_db),  # noqa: B008
) -> dict[str, str]:
    """Request password reset - generates a reset token and sends email.
    
    Note: In production, this should send an email with the reset link.
    For now, it returns a success message. The token can be retrieved
    from logs in development or via email in production.
    """
    user = db.query(User).filter(User.email == payload.email).first()
    if not user:
        # Don't reveal if email exists for security
        return {"message": "If that email exists, we've sent a password reset link."}
    
    # Generate reset token
    reset_token = create_password_reset_token(user.id)
    
    # Note: Email sending can be added here for production
    # In production, send email with link like: {frontend_url}/reset-password?token={reset_token}
    # For local development, log the token to console
    if get_settings().environment == "development":
        print(f"Password reset token for {user.email}: {reset_token}")
        print(f"Reset link: http://localhost:3000/reset-password?token={reset_token}")
    
    return {"message": "If that email exists, we've sent a password reset link."}


@router.post("/reset-password-with-token")
def reset_password_with_token(
    payload: auth_schema.ResetPasswordWithTokenRequest,
    db: Session = Depends(get_db),  # noqa: B008
) -> dict[str, str]:
    """Reset password using a token from email (when user is not logged in)."""
    try:
        data = decode_token(payload.token)
        if data.get("type") != "password_reset":
            raise ValueError("Invalid reset token")
        user_id = int(data["sub"])
    except (ValueError, KeyError) as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset token",
        ) from exc
    
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )
    
    user.hashed_password = get_password_hash(payload.new_password)
    db.add(user)
    db.commit()
    
    return {"message": "Password reset successfully"}


@router.get("/me", response_model=UserPublic)
def read_current_user(
    current_user: User = Depends(deps.get_current_user),  # noqa: B008  # NOSONAR - FastAPI dependency injection pattern
) -> UserPublic:
    return current_user


@router.post("/change-password")
def change_password(
    payload: auth_schema.ChangePasswordRequest,
    current_user: User = Depends(deps.get_current_user),  # noqa: B008  # NOSONAR - FastAPI dependency injection pattern
    db: Session = Depends(get_db),  # noqa: B008  # NOSONAR - FastAPI dependency injection pattern
) -> dict[str, str]:
    """Change password - requires current password."""
    if not verify_password(payload.current_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect",
        )
    
    current_user.hashed_password = get_password_hash(payload.new_password)
    db.add(current_user)
    db.commit()
    
    return {"message": "Password changed successfully"}


@router.post("/reset-password")
def reset_password(
    payload: auth_schema.ResetPasswordRequest,
    current_user: User = Depends(deps.get_current_user),  # noqa: B008  # NOSONAR - FastAPI dependency injection pattern
    db: Session = Depends(get_db),  # noqa: B008  # NOSONAR - FastAPI dependency injection pattern
) -> dict[str, str]:
    """Reset password when logged in - no email verification needed since user is authenticated.
    
    This is useful when user forgot their password but is still logged in.
    Note: Previous password cannot be recovered as passwords are hashed for security.
    """
    current_user.hashed_password = get_password_hash(payload.new_password)
    db.add(current_user)
    db.commit()
    
    return {"message": "Password reset successfully"}


@router.post("/change-email")
def change_email(
    payload: auth_schema.ChangeEmailRequest,
    current_user: User = Depends(deps.get_current_user),  # noqa: B008  # NOSONAR - FastAPI dependency injection pattern
    db: Session = Depends(get_db),  # noqa: B008  # NOSONAR - FastAPI dependency injection pattern
) -> UserPublic:
    """Change email - requires password confirmation for security."""
    if not verify_password(payload.password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password is incorrect",
        )
    
    # Check if new email is already taken
    existing = db.query(User).filter(User.email == payload.new_email, User.id != current_user.id).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered",
        )
    
    current_user.email = payload.new_email
    db.add(current_user)
    db.commit()
    db.refresh(current_user)
    
    return current_user

