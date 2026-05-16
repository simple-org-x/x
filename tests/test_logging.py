"""Tests for the RedactingFilter."""

from __future__ import annotations

import logging

from dex_ai_trader.logging_setup import REDACTED, RedactingFilter, configure_logging


def _make_record(msg: str, args: object = ()) -> logging.LogRecord:
    return logging.LogRecord(
        name="t",
        level=logging.INFO,
        pathname=__file__,
        lineno=1,
        msg=msg,
        args=args,
        exc_info=None,
    )


def test_redacts_dict_args() -> None:
    rec = _make_record("creds=%s", ({"private_key": "0xabc", "user": "alice"},))
    RedactingFilter().filter(rec)
    rendered = rec.getMessage()
    assert "0xabc" not in rendered
    assert REDACTED in rendered
    assert "alice" in rendered


def test_redacts_string_messages() -> None:
    rec = _make_record('connecting with private_key="0xabc123" and user=alice')
    RedactingFilter().filter(rec)
    msg = rec.getMessage()
    assert "0xabc123" not in msg
    assert REDACTED in msg
    assert "alice" in msg


def test_redacts_api_secret_case_insensitive() -> None:
    rec = _make_record("API_SECRET=topsecret123 stays hidden")
    RedactingFilter().filter(rec)
    rendered = rec.getMessage()
    assert "topsecret123" not in rendered
    assert REDACTED in rendered


def test_redacts_passphrase_in_dict_arg_list() -> None:
    rec = _make_record(
        "%s",
        ([{"passphrase": "hunter2"}, {"signer_private_key": "0xfeed"}],),
    )
    RedactingFilter().filter(rec)
    rendered = rec.getMessage()
    assert "hunter2" not in rendered
    assert "0xfeed" not in rendered
    assert rendered.count(REDACTED) >= 2


def test_configure_logging_installs_filter() -> None:
    logger = configure_logging(logging.INFO)
    root = logging.getLogger()
    assert any(any(isinstance(f, RedactingFilter) for f in h.filters) for h in root.handlers)
    assert logger.name == "dex_ai_trader"


def test_redacts_password_field() -> None:
    rec = _make_record("user logged in with password=letmein")
    RedactingFilter().filter(rec)
    rendered = rec.getMessage()
    assert "letmein" not in rendered
    assert REDACTED in rendered
