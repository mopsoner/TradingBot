from __future__ import annotations

RESET = "\033[0m"
BOLD = "\033[1m"
DIM = "\033[2m"
RED = "\033[91m"
GREEN = "\033[92m"
YELLOW = "\033[93m"
BLUE = "\033[94m"
MAGENTA = "\033[95m"
CYAN = "\033[96m"
WHITE = "\033[97m"


def colorize(text: str, color: str) -> str:
    return f"{color}{text}{RESET}"


def success(text: str) -> str:
    return colorize(text, GREEN)


def error(text: str) -> str:
    return colorize(text, RED)


def warning(text: str) -> str:
    return colorize(text, YELLOW)


def info(text: str) -> str:
    return colorize(text, CYAN)


def headline(text: str) -> str:
    return f"{BOLD}{BLUE}{text}{RESET}"


def muted(text: str) -> str:
    return f"{DIM}{WHITE}{text}{RESET}"


def signal_line(line: str, *, trigger: str = "", bias: str = "", blocked: bool = False, tp_zone: bool = False, score: int | None = None) -> str:
    out = line
    if blocked:
        return warning(out)
    if "ERROR" in line:
        return error(out)
    if trigger in {"break_up_confirm", "break_up_confirm_soft"} or bias == "bull_confirm":
        return success(out)
    if trigger in {"break_down_confirm", "break_down_confirm_soft"} or bias == "bear_confirm":
        return colorize(out, MAGENTA)
    if "watch" in bias or trigger == "wait":
        return warning(out)
    if tp_zone:
        return colorize(out, BLUE)
    if score is not None and score >= 6:
        return info(out)
    return muted(out)
