from __future__ import annotations

from datetime import datetime, timezone


class SessionFilter:
    """Allows London+NY overlap style windows in UTC."""

    def __init__(self, allowed_hours: tuple[int, int] = (7, 20)) -> None:
        self.start_hour, self.end_hour = allowed_hours

    def is_allowed(self, ts: datetime | None = None) -> bool:
        now = ts or datetime.now(timezone.utc)
        return self.start_hour <= now.hour <= self.end_hour
