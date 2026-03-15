from datetime import datetime, timezone


class SessionFilter:
    """
    Sessions (Asia / Europe / US / weekend) are FILTERS, not primary signals.
    Weekend trading is blocked by default but can be enabled per profile.
    """

    def __init__(self, active_sessions: tuple[str, ...] = ("london", "newyork")) -> None:
        self.active_sessions = active_sessions

    def is_weekend(self, timestamp: datetime) -> bool:
        """Saturday (5) and Sunday (6)."""
        return timestamp.astimezone(timezone.utc).weekday() >= 5

    def session_name(self, timestamp: datetime, session_cfg=None) -> str:
        hour = timestamp.astimezone(timezone.utc).hour
        if session_cfg is not None:
            if session_cfg.asia_start <= hour <= session_cfg.asia_end:
                return "asia"
            if session_cfg.london_start <= hour <= session_cfg.london_end:
                return "london"
            if session_cfg.newyork_start <= hour <= session_cfg.newyork_end:
                return "newyork"
        else:
            if 0 <= hour <= 6:
                return "asia"
            if 7 <= hour <= 12:
                return "london"
            if 13 <= hour <= 20:
                return "newyork"
        return "off-session"

    def is_tradeable(self, timestamp: datetime, session_cfg=None, allow_weekend: bool = False) -> tuple[bool, str]:
        """
        Returns (tradeable: bool, reason: str).
        Weekend blocked by default; can be overridden per profile with allow_weekend=True.
        Off-session is blocked unless all sessions are in active list.
        """
        if self.is_weekend(timestamp) and not allow_weekend:
            day = timestamp.astimezone(timezone.utc).strftime("%A")
            return False, f"Week-end ({day}) — activez « Trading week-end » dans le profil sélectionné"

        hour = timestamp.astimezone(timezone.utc).hour
        sess = self.session_name(timestamp, session_cfg)

        if session_cfg is not None:
            active = session_cfg.active_sessions
            in_london  = session_cfg.london_start  <= hour <= session_cfg.london_end  and "london"  in active
            in_newyork = session_cfg.newyork_start <= hour <= session_cfg.newyork_end and "newyork" in active
            in_asia    = session_cfg.asia_start    <= hour <= session_cfg.asia_end    and "asia"    in active
            if in_london or in_newyork or in_asia:
                return True, f"Session active: {sess}"
            if sess == "off-session":
                return False, "Hors session — pas de trading"
            return False, f"Session {sess} désactivée dans la config"
        else:
            in_london  = 7  <= hour <= 11 and "london"  in self.active_sessions
            in_newyork = 13 <= hour <= 17 and "newyork" in self.active_sessions
            in_asia    = False
            if in_london or in_newyork or in_asia:
                return True, f"Session active: {sess}"
            return False, f"Session {sess} inactive ou hors session"
