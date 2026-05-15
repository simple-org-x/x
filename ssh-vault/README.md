# ssh-vault

A secure command-line tool for storing and managing SSH credentials (private keys and passwords) in an encrypted local vault.

## Security

| Layer | Algorithm | Details |
|-------|-----------|---------|
| Key Derivation | **Argon2id** | 64 MiB memory, 3 iterations, 4 parallel lanes |
| Encryption | **AES-256-GCM** | Authenticated encryption with 96-bit random nonce |
| Salt | 128-bit | Random, unique per vault |
| Nonce | 96-bit | Re-rolled on every save (never reused) |
| Memory | **zeroize** | Keys and passwords are wiped from RAM on drop |
| File Permissions | `0600` | Vault file is readable only by the owner (Unix) |

All entry metadata (hostnames, usernames, notes) is encrypted alongside the secrets — nothing leaks at rest.

## Installation

```bash
# From source
cargo install --path .

# Or build manually
cargo build --release
# Binary: target/release/ssh-vault
```

## Quick Start

```bash
# 1. Create a new vault (prompts for master password)
ssh-vault init

# 2. Add an SSH key
ssh-vault add prod-web \
  --host web.example.com \
  --user deploy \
  --key-file ~/.ssh/id_ed25519

# 3. Add a password-based credential
ssh-vault add staging-db \
  --host db.staging.internal \
  --user admin \
  --port 2222 \
  --password

# 4. List entries
ssh-vault list

# 5. Retrieve a credential
ssh-vault get prod-web --show-secret

# 6. Remove an entry
ssh-vault remove staging-db

# 7. Change master password
ssh-vault change-password
```

## Commands

| Command | Description |
|---------|-------------|
| `init` | Create a new empty vault |
| `add` | Store an SSH private key or password |
| `list` | List all entry names with host/user info |
| `get` | Display entry details (use `--show-secret` to reveal key/password) |
| `remove` | Delete an entry from the vault |
| `change-password` | Re-encrypt vault with a new master password |

## Options

| Flag | Description |
|------|-------------|
| `-f, --vault-file <PATH>` | Custom vault file path (default: `~/.config/ssh-vault/vault.json`) |

The vault path can also be set via the `SSH_VAULT_FILE` environment variable.

## Vault File Format

The vault is a single JSON file:

```json
{
  "version": 1,
  "salt": "<base64 encoded 16-byte salt>",
  "nonce": "<base64 encoded 12-byte nonce>",
  "data": "<base64 encoded AES-256-GCM ciphertext>"
}
```

The `data` field, once decrypted, contains all entries including names, hosts, users, and secrets.

## Requirements

- Rust 1.70+ (2021 edition)
- Master password must be at least 8 characters

## License

MIT
