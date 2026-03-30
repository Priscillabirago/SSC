"""Shared fixtures: SQLite file DB (shared across connections), dependency overrides, JWT test user."""

import os

# File-based SQLite so SQLAlchemy connection pooling shares one DB (unlike :memory:).
_TEST_DB_PATH = os.path.join(os.path.dirname(__file__), ".pytest_ssc.sqlite")
os.environ["JWT_SECRET_KEY"] = "pytest-jwt-secret-key-minimum-32-characters"
os.environ["DATABASE_URL"] = f"sqlite:///{_TEST_DB_PATH}"

import pytest  # pyright: ignore[reportMissingImports]
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.config import get_settings  # noqa: E402
from app.db.base import Base  # noqa: E402
import app.models  # noqa: F401, E402
from app.core.security import create_access_token, get_password_hash  # noqa: E402
from app.db.session import get_db  # noqa: E402
from app.main import create_app  # noqa: E402
from app.models.user import User  # noqa: E402


def pytest_sessionstart(session):
    """Create tables on the process-global engine used by un-overridden TestClient."""
    get_settings.cache_clear()
    if os.path.isfile(_TEST_DB_PATH):
        os.remove(_TEST_DB_PATH)
    from app.db.base import Base
    from app.db.session import engine

    import app.models  # noqa: F401

    Base.metadata.create_all(bind=engine)


@pytest.fixture
def test_engine():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    yield engine
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def db_session(test_engine):
    SessionLocal = sessionmaker(bind=test_engine)
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def client(db_session):
    get_settings.cache_clear()

    def override_get_db():
        yield db_session

    app = create_app()
    app.dependency_overrides[get_db] = override_get_db
    yield TestClient(app)
    app.dependency_overrides.clear()
    get_settings.cache_clear()


@pytest.fixture
def test_user(db_session) -> User:
    user = User(
        email="pytest@example.com",
        full_name="Py Test",
        hashed_password=get_password_hash("testpass123"),
        timezone="UTC",
        weekly_study_hours=10,
        preferred_study_windows=["morning"],
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture
def auth_headers(test_user) -> dict[str, str]:
    token = create_access_token(test_user.id)
    return {"Authorization": f"Bearer {token}"}
