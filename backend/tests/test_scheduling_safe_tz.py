"""Unit tests for scheduling timezone helper."""

from zoneinfo import ZoneInfo

from app.services.scheduling import _safe_tz


def test_safe_tz_valid_returns_zoneinfo():
    tz = _safe_tz("America/New_York")
    assert tz == ZoneInfo("America/New_York")


def test_safe_tz_invalid_falls_back_to_utc():
    tz = _safe_tz("Not/A/Timezone")
    assert tz == ZoneInfo("UTC")


def test_safe_tz_none_falls_back_to_utc():
    assert _safe_tz(None) == ZoneInfo("UTC")


def test_safe_tz_empty_string_falls_back_to_utc():
    assert _safe_tz("") == ZoneInfo("UTC")
