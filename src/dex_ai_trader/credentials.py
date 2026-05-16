"""Encrypted credential store using PBKDF2 + Fernet."""

from __future__ import annotations

import base64
import json
import os
import secrets
from pathlib import Path
from typing import Any

from cryptography.fernet import Fernet, InvalidToken
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from pydantic import BaseModel, ConfigDict, Field

PBKDF2_ITERATIONS = 200_000
SALT_BYTES = 16


class CredentialRecord(BaseModel):
    model_config = ConfigDict(extra="forbid")

    venue: str
    api_key: str | None = None
    api_secret: str | None = None
    wallet_address: str | None = None
    private_key: str | None = None
    extra: dict[str, str] = Field(default_factory=dict)


def _default_store_path() -> Path:
    return Path.home() / ".dex-ai-trader" / "credentials.enc"


def _derive_key(passphrase: str, salt: bytes) -> bytes:
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=PBKDF2_ITERATIONS,
    )
    raw_key = kdf.derive(passphrase.encode("utf-8"))
    return base64.urlsafe_b64encode(raw_key)


class CredentialStoreError(Exception):
    """Base error for the credential store."""


class CredentialStoreLocked(CredentialStoreError):
    """Raised when the store is accessed while locked."""


class InvalidPassphrase(CredentialStoreError):
    """Raised when the supplied passphrase cannot decrypt the store."""


class CredentialStore:
    """Encrypted, on-disk credential store keyed by venue name.

    File layout (JSON):
        {"salt": "<hex>", "ciphertext": "<base64 fernet token>"}

    The plaintext payload (decrypted with Fernet) is a JSON object mapping
    venue name -> CredentialRecord dict.
    """

    def __init__(self, store_path: Path | None = None) -> None:
        self.store_path: Path = store_path if store_path is not None else _default_store_path()
        self._records: dict[str, CredentialRecord] | None = None

    # -- state --------------------------------------------------------------

    def exists(self) -> bool:
        return self.store_path.exists()

    def is_unlocked(self) -> bool:
        return self._records is not None

    def lock(self) -> None:
        self._records = None

    # -- core ---------------------------------------------------------------

    def unlock(self, passphrase: str) -> None:
        """Load and decrypt the store using ``passphrase``.

        If the store does not exist on disk, initializes an empty in-memory store.
        """
        if not self.exists():
            self._records = {}
            return

        with self.store_path.open("rb") as fh:
            envelope = json.loads(fh.read().decode("utf-8"))

        try:
            salt = bytes.fromhex(envelope["salt"])
            ciphertext = envelope["ciphertext"].encode("ascii")
        except (KeyError, ValueError) as exc:
            raise CredentialStoreError(f"Corrupt credential store: {exc}") from exc

        key = _derive_key(passphrase, salt)
        try:
            plaintext = Fernet(key).decrypt(ciphertext)
        except InvalidToken as exc:
            raise InvalidPassphrase("Invalid passphrase or corrupt store") from exc

        data: dict[str, Any] = json.loads(plaintext.decode("utf-8"))
        self._records = {venue: CredentialRecord.model_validate(rec) for venue, rec in data.items()}

    def _require_unlocked(self) -> dict[str, CredentialRecord]:
        if self._records is None:
            raise CredentialStoreLocked("Credential store is locked; call unlock() first")
        return self._records

    def get(self, venue: str) -> CredentialRecord | None:
        return self._require_unlocked().get(venue)

    def list_venues(self) -> list[str]:
        return sorted(self._require_unlocked().keys())

    def put(self, record: CredentialRecord, passphrase: str) -> None:
        """Insert/replace ``record`` and persist the store encrypted with ``passphrase``."""
        if self._records is None:
            # Auto-load (or initialize empty) so callers don't have to unlock first.
            self.unlock(passphrase)

        records = self._require_unlocked()
        records[record.venue] = record
        self._persist(passphrase)

    # -- persistence --------------------------------------------------------

    def _persist(self, passphrase: str) -> None:
        records = self._require_unlocked()
        plaintext = json.dumps(
            {venue: rec.model_dump() for venue, rec in records.items()},
            sort_keys=True,
        ).encode("utf-8")

        salt = secrets.token_bytes(SALT_BYTES)
        key = _derive_key(passphrase, salt)
        ciphertext = Fernet(key).encrypt(plaintext)

        envelope = {
            "salt": salt.hex(),
            "ciphertext": ciphertext.decode("ascii"),
        }

        self.store_path.parent.mkdir(parents=True, exist_ok=True)
        # Write to a temp file with restrictive perms, then atomically rename.
        tmp_path = self.store_path.with_suffix(self.store_path.suffix + ".tmp")
        # os.open with 0o600 ensures the file is created with the right mode
        # regardless of umask.
        fd = os.open(tmp_path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        try:
            with os.fdopen(fd, "wb") as fh:
                fh.write(json.dumps(envelope).encode("utf-8"))
        except Exception:
            tmp_path.unlink(missing_ok=True)
            raise
        os.replace(tmp_path, self.store_path)
        os.chmod(self.store_path, 0o600)


__all__ = [
    "CredentialRecord",
    "CredentialStore",
    "CredentialStoreError",
    "CredentialStoreLocked",
    "InvalidPassphrase",
    "PBKDF2_ITERATIONS",
]
