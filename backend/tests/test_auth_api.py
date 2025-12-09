import os

import pytest
from fastapi.testclient import TestClient

from app.main import create_app


pytestmark = pytest.mark.skipif(
    not os.getenv("DATABASE_URL"),
    reason="Integration tests require DATABASE_URL to be configured.",
)


def test_register_and_login_flow():
    app = create_app()
    client = TestClient(app)

    payload = {
        "email": "student@example.com",
        "password": "supersecure",
        "full_name": "Test Student",
        "timezone": "UTC",
    }
    register_response = client.post("/auth/register", json=payload)
    assert register_response.status_code == 200
    tokens = register_response.json()
    assert "access_token" in tokens

    login_response = client.post(
        "/auth/login",
        json={"email": payload["email"], "password": payload["password"]},
    )
    assert login_response.status_code == 200
    login_tokens = login_response.json()
    assert login_tokens["access_token"]

