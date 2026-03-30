"""GET /analytics/badges returns progress and earned flags."""


def test_badges_endpoint_structure_and_unearned_when_no_activity(
    client, auth_headers, test_user
):
    r = client.get("/analytics/badges", headers=auth_headers)
    assert r.status_code == 200
    body = r.json()
    assert "badges" in body
    assert "earned_count" in body
    assert "total_count" in body
    assert isinstance(body["badges"], list)
    assert body["earned_count"] == 0
    for b in body["badges"]:
        assert "id" in b
        assert "earned" in b
        assert "progress" in b
        assert "threshold" in b
        assert b["earned"] is False
