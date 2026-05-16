"""Append-only JSONL audit log."""

from __future__ import annotations

import json
import os
from datetime import UTC, datetime
from pathlib import Path
from typing import Any


def _default_audit_path() -> Path:
    return Path.home() / ".dex-ai-trader" / "audit.jsonl"


def _json_default(value: Any) -> Any:
    if isinstance(value, datetime):
        return value.isoformat()
    if hasattr(value, "model_dump"):
        return value.model_dump(mode="json")
    if hasattr(value, "__str__"):
        return str(value)
    raise TypeError(f"Object of type {type(value).__name__} is not JSON serializable")


class AuditLog:
    """Writes JSON lines with timestamp + event + payload to disk (mode 0600)."""

    def __init__(self, path: Path | None = None) -> None:
        self.path: Path = path if path is not None else _default_audit_path()

    def append(self, event: str, payload: dict[str, Any]) -> None:
        record = {
            "ts": datetime.now(UTC).isoformat(),
            "event": event,
            "payload": payload,
        }
        line = json.dumps(record, default=_json_default, sort_keys=True) + "\n"

        self.path.parent.mkdir(parents=True, exist_ok=True)
        # Create with 0o600 if missing; otherwise open in append mode.
        if not self.path.exists():
            fd = os.open(self.path, os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o600)
            with os.fdopen(fd, "a", encoding="utf-8") as fh:
                fh.write(line)
        else:
            with self.path.open("a", encoding="utf-8") as fh:
                fh.write(line)
            os.chmod(self.path, 0o600)


__all__ = ["AuditLog"]
