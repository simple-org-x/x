"""Tests for the encrypted CredentialStore."""

from __future__ import annotations

import os
from pathlib import Path

import pytest

from dex_ai_trader.credentials import (
    CredentialRecord,
    CredentialStore,
    InvalidPassphrase,
)


def _make_record() -> CredentialRecord:
    return CredentialRecord(
        venue="hyperliquid",
        wallet_address="0xABC0000000000000000000000000000000000000",
        private_key="0xDEADBEEFC0FFEE0000000000000000000000000000000000000000000000DEAD",
        extra={"testnet": "true"},
    )


def test_put_then_get_round_trip(tmp_path: Path) -> None:
    store_path = tmp_path / "creds.enc"
    store = CredentialStore(store_path=store_path)

    record = _make_record()
    store.put(record, passphrase="hunter2-correct")

    # Lock and re-open with a fresh instance to prove disk persistence.
    store.lock()
    fresh = CredentialStore(store_path=store_path)
    fresh.unlock("hunter2-correct")

    out = fresh.get("hyperliquid")
    assert out == record
    assert fresh.list_venues() == ["hyperliquid"]


def test_wrong_passphrase_raises(tmp_path: Path) -> None:
    store_path = tmp_path / "creds.enc"
    store = CredentialStore(store_path=store_path)
    store.put(_make_record(), passphrase="correct-pass")

    other = CredentialStore(store_path=store_path)
    with pytest.raises(InvalidPassphrase):
        other.unlock("wrong-pass")


def test_file_mode_is_0600(tmp_path: Path) -> None:
    store_path = tmp_path / "creds.enc"
    store = CredentialStore(store_path=store_path)
    store.put(_make_record(), passphrase="pass")

    mode = os.stat(store_path).st_mode & 0o777
    assert mode == 0o600


def test_ciphertext_does_not_contain_plaintext(tmp_path: Path) -> None:
    store_path = tmp_path / "creds.enc"
    store = CredentialStore(store_path=store_path)
    record = _make_record()
    store.put(record, passphrase="pass")

    raw = store_path.read_bytes()
    assert record.private_key is not None
    assert record.private_key.encode("ascii") not in raw
    assert b"DEADBEEF" not in raw  # belt + suspenders
    assert record.wallet_address is not None
    assert record.wallet_address.encode("ascii") not in raw


def test_get_without_unlock_raises(tmp_path: Path) -> None:
    from dex_ai_trader.credentials import CredentialStoreLocked

    store_path = tmp_path / "creds.enc"
    store = CredentialStore(store_path=store_path)
    # Create a populated file first.
    store.put(_make_record(), passphrase="pass")
    store.lock()

    with pytest.raises(CredentialStoreLocked):
        store.get("hyperliquid")


def test_multiple_venues(tmp_path: Path) -> None:
    store_path = tmp_path / "creds.enc"
    store = CredentialStore(store_path=store_path)

    a = CredentialRecord(venue="paper")
    b = CredentialRecord(venue="asterdex", api_key="k", api_secret="s")
    store.put(a, passphrase="p")
    store.put(b, passphrase="p")

    fresh = CredentialStore(store_path=store_path)
    fresh.unlock("p")
    assert set(fresh.list_venues()) == {"paper", "asterdex"}
    assert fresh.get("asterdex") == b
