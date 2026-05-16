"""Logging configuration with sensitive-field redaction."""

from __future__ import annotations

import logging
import re
from collections.abc import Mapping
from typing import Any

REDACTED = "***REDACTED***"

# Sensitive field names; case-insensitive match.
SENSITIVE_FIELDS: tuple[str, ...] = (
    "secret_key",
    "private_key",
    "api_secret",
    "passphrase",
    "signer_private_key",
    "password",
)


def _build_pattern() -> re.Pattern[str]:
    """Build a regex that finds 'name<sep>value' style sensitive pairs in strings.

    Matches things like:
        private_key=0xabc
        "api_secret": "abcd"
        passphrase: hunter2
    """
    names = "|".join(re.escape(n) for n in SENSITIVE_FIELDS)
    # Capture either quoted value, or unquoted token until whitespace/comma/}/)/'/"
    return re.compile(
        rf"(?i)(['\"]?(?:{names})['\"]?\s*[:=]\s*)" r"(\"[^\"]*\"|'[^']*'|[^\s,}\)]+)"
    )


_PATTERN = _build_pattern()


def _redact_string(value: str) -> str:
    return _PATTERN.sub(lambda m: f"{m.group(1)}{REDACTED}", value)


def _is_sensitive_key(key: Any) -> bool:
    if not isinstance(key, str):
        return False
    lowered = key.lower()
    return any(field in lowered for field in SENSITIVE_FIELDS)


def _redact_value(value: Any) -> Any:
    if isinstance(value, Mapping):
        return _redact_mapping(value)
    if isinstance(value, list):
        return [_redact_value(v) for v in value]
    if isinstance(value, tuple):
        return tuple(_redact_value(v) for v in value)
    if isinstance(value, str):
        return _redact_string(value)
    return value


def _redact_mapping(mapping: Mapping[str, Any]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for k, v in mapping.items():
        if _is_sensitive_key(k):
            result[k] = REDACTED
        else:
            result[k] = _redact_value(v)
    return result


class RedactingFilter(logging.Filter):
    """Logging filter that redacts sensitive credential values in messages and args."""

    def filter(self, record: logging.LogRecord) -> bool:
        # Redact args first so that record.getMessage() doesn't reintroduce raw values
        # via %-style formatting.
        if record.args:
            if isinstance(record.args, Mapping):
                record.args = _redact_mapping(record.args)
            elif isinstance(record.args, tuple):
                record.args = tuple(_redact_value(a) for a in record.args)
            else:
                # Any other iterable / single positional arg
                record.args = _redact_value(record.args)

        if isinstance(record.msg, str):
            record.msg = _redact_string(record.msg)

        return True


def configure_logging(level: int | str = logging.INFO) -> logging.Logger:
    """Configure root logging with a redaction filter; return the package logger."""
    root = logging.getLogger()
    root.setLevel(level)

    # Avoid duplicate handlers if called multiple times.
    if not any(isinstance(h, logging.StreamHandler) for h in root.handlers):
        stream_handler = logging.StreamHandler()
        stream_handler.setFormatter(
            logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s")
        )
        root.addHandler(stream_handler)

    redactor = RedactingFilter()
    for h in root.handlers:
        # Only attach the filter once per handler.
        if not any(isinstance(f, RedactingFilter) for f in h.filters):
            h.addFilter(redactor)

    return logging.getLogger("dex_ai_trader")
