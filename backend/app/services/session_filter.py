from datetime import datetime, timezone


class SessionFilter:
    def __init__(self, active_sessions: tuple[str, ...] = ("london", "newyork")) -> None:
        self.active_sessions = active_sessions

    def is_tradeable(self, timestamp: datetime) -> bool:
        hour = timestamp.astimezone(timezone.utc).hour
        in_london = 7 <= hour <= 11 and "london" in self.active_sessions
        in_newyork = 13 <= hour <= 17 and "newyork" in self.active_sessions
        return in_london or in_newyork
