"""Tests for the AuditLog."""

from __future__ import annotations

import json
import os
from pathlib import Path

from dex_ai_trader.audit import AuditLog


def test_append_writes_jsonl(tmp_path: Path) -> None:
    path = tmp_path / "audit.jsonl"
    log = AuditLog(path=path)
    log.append("decision", {"trade_id": "abc", "action": "approve"})

    text = path.read_text(encoding="utf-8")
    # Single newline-terminated JSON line.
    assert text.endswith("\n")
    lines = text.splitlines()
    assert len(lines) == 1

    record = json.loads(lines[0])
    assert record["event"] == "decision"
    assert record["payload"] == {"trade_id": "abc", "action": "approve"}
    assert "ts" in record


def test_audit_file_mode_0600(tmp_path: Path) -> None:
    path = tmp_path / "audit.jsonl"
    log = AuditLog(path=path)
    log.append("test", {})
    mode = os.stat(path).st_mode & 0o777
    assert mode == 0o600


def test_append_multiple(tmp_path: Path) -> None:
    path = tmp_path / "audit.jsonl"
    log = AuditLog(path=path)
    log.append("a", {"i": 1})
    log.append("b", {"i": 2})

    lines = path.read_text(encoding="utf-8").splitlines()
    assert len(lines) == 2
    assert json.loads(lines[0])["event"] == "a"
    assert json.loads(lines[1])["event"] == "b"
