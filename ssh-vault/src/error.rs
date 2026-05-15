use thiserror::Error;

#[derive(Debug, Error)]
pub enum VaultError {
    #[error("vault file not found at {0}; run `init` first")]
    NotFound(String),

    #[error("vault already exists at {0}")]
    AlreadyExists(String),

    #[error("invalid master password or corrupted vault")]
    BadPassword,

    #[error("entry `{0}` not found")]
    EntryNotFound(String),

    #[error("entry `{0}` already exists")]
    EntryExists(String),

    #[error("io error: {0}")]
    Io(#[from] std::io::Error),

    #[error("serialization error: {0}")]
    Serde(#[from] serde_json::Error),

    #[error("crypto error: {0}")]
    Crypto(String),
}

pub type Result<T> = std::result::Result<T, VaultError>;
