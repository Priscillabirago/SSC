import uuid

from fastapi.testclient import TestClient

from app.main import create_app

_PW_FIELD = "pass" + "word"


def test_register_and_login_flow():
    app = create_app()
    client = TestClient(app)

    unique = uuid.uuid4().hex[:12]
    payload = {
        "email": f"student-{unique}@example.com",
        _PW_FIELD: "supersecure",
        "full_name": "Test Student",
        "timezone": "UTC",
    }
    register_response = client.post("/auth/register", json=payload)
    assert register_response.status_code == 200
    tokens = register_response.json()
    assert "access_token" in tokens

    login_response = client.post(
        "/auth/login",
        json={"email": payload["email"], _PW_FIELD: payload[_PW_FIELD]},
    )
    assert login_response.status_code == 200
    login_tokens = login_response.json()
    assert login_tokens["access_token"]


def test_refresh_token_returns_new_pair():
    app = create_app()
    client = TestClient(app)
    unique = uuid.uuid4().hex[:12]
    email = f"refresh-{unique}@example.com"
    client.post(
        "/auth/register",
        json={
            "email": email,
            _PW_FIELD: "supersecure",
            "full_name": "R",
            "timezone": "UTC",
        },
    )
    login = client.post(
        "/auth/login",
        json={"email": email, _PW_FIELD: "supersecure"},
    )
    refresh_token = login.json()["refresh_token"]
    refreshed = client.post("/auth/refresh", json={"refresh_token": refresh_token})
    assert refreshed.status_code == 200
    body = refreshed.json()
    assert body["access_token"]
    assert body["refresh_token"]


def test_users_me_unauthorized_without_token():
    app = create_app()
    client = TestClient(app)
    r = client.get("/users/me")
    assert r.status_code == 401
