//! Encrypted vault on-disk format and operations.
//!
//! File layout (JSON):
//! {
//!   "version": 1,
//!   "salt":   "<base64>",   // Argon2id salt, fixed for the vault
//!   "nonce":  "<base64>",   // AES-GCM nonce, re-rolled on every save
//!   "data":   "<base64>"    // ciphertext of encrypted `Inner`
//! }
//!
//! The encrypted `Inner` holds the entry list, so entry names, hosts, and
//! secrets are all confidential at rest.

use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

use base64::{engine::general_purpose::STANDARD as B64, Engine};
use serde::{Deserialize, Serialize};
use zeroize::Zeroize;

use crate::crypto::{
    decrypt, derive_key, encrypt, random_nonce, random_salt, DerivedKey, NONCE_LEN, SALT_LEN,
};
use crate::error::{Result, VaultError};

const VAULT_VERSION: u32 = 1;

#[derive(Serialize, Deserialize)]
struct VaultFile {
    version: u32,
    salt: String,
    nonce: String,
    data: String,
}

/// A single stored credential.
#[derive(Clone, Serialize, Deserialize)]
pub struct Entry {
    pub host: String,
    pub user: String,
    #[serde(default)]
    pub port: Option<u16>,
    pub secret: Secret,
    #[serde(default)]
    pub notes: Option<String>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Secret {
    /// SSH private key contents (PEM/OpenSSH format).
    PrivateKey { contents: String },
    /// Plaintext password (encrypted at rest as part of the vault).
    Password { password: String },
}

impl Drop for Secret {
    fn drop(&mut self) {
        match self {
            Secret::PrivateKey { contents } => contents.zeroize(),
            Secret::Password { password } => password.zeroize(),
        }
    }
}

/// Decrypted vault contents.
#[derive(Default, Serialize, Deserialize)]
struct Inner {
    entries: BTreeMap<String, Entry>,
}

/// In-memory, decrypted vault.
pub struct Vault {
    path: PathBuf,
    salt: [u8; SALT_LEN],
    key: DerivedKey,
    inner: Inner,
}

impl Vault {
    /// Default vault path: `$XDG_CONFIG_HOME/ssh-vault/vault.json` (or platform equivalent).
    pub fn default_path() -> PathBuf {
        dirs::config_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("ssh-vault")
            .join("vault.json")
    }

    /// Create a brand new vault at `path` with the given master password.
    pub fn init(path: &Path, password: &str) -> Result<Self> {
        if path.exists() {
            return Err(VaultError::AlreadyExists(path.display().to_string()));
        }
        let salt = random_salt();
        let key = DerivedKey(derive_key(password.as_bytes(), &salt)?);
        let v = Vault {
            path: path.to_path_buf(),
            salt,
            key,
            inner: Inner::default(),
        };
        v.save()?;
        Ok(v)
    }

    /// Open an existing vault and decrypt it.
    pub fn open(path: &Path, password: &str) -> Result<Self> {
        if !path.exists() {
            return Err(VaultError::NotFound(path.display().to_string()));
        }
        let raw = fs::read(path)?;
        let vf: VaultFile = serde_json::from_slice(&raw)?;
        if vf.version != VAULT_VERSION {
            return Err(VaultError::Crypto(format!(
                "unsupported vault version {}",
                vf.version
            )));
        }
        let salt_vec = B64.decode(vf.salt).map_err(|e| VaultError::Crypto(e.to_string()))?;
        let nonce_vec = B64.decode(vf.nonce).map_err(|e| VaultError::Crypto(e.to_string()))?;
        let data = B64.decode(vf.data).map_err(|e| VaultError::Crypto(e.to_string()))?;

        if salt_vec.len() != SALT_LEN || nonce_vec.len() != NONCE_LEN {
            return Err(VaultError::Crypto("bad salt/nonce length".into()));
        }
        let mut salt = [0u8; SALT_LEN];
        salt.copy_from_slice(&salt_vec);
        let mut nonce = [0u8; NONCE_LEN];
        nonce.copy_from_slice(&nonce_vec);

        let key = DerivedKey(derive_key(password.as_bytes(), &salt)?);
        let plaintext = decrypt(&key.0, &nonce, &data)?;
        let inner: Inner = serde_json::from_slice(&plaintext)?;

        Ok(Vault {
            path: path.to_path_buf(),
            salt,
            key,
            inner,
        })
    }

    /// Persist the vault back to disk, re-encrypting with a fresh nonce.
    pub fn save(&self) -> Result<()> {
        let plaintext = serde_json::to_vec(&self.inner)?;
        let nonce = random_nonce();
        let ciphertext = encrypt(&self.key.0, &nonce, &plaintext)?;

        let vf = VaultFile {
            version: VAULT_VERSION,
            salt: B64.encode(self.salt),
            nonce: B64.encode(nonce),
            data: B64.encode(ciphertext),
        };

        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent)?;
        }
        let json = serde_json::to_vec_pretty(&vf)?;
        fs::write(&self.path, json)?;

        // Best-effort tighten permissions on Unix.
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let perms = fs::Permissions::from_mode(0o600);
            let _ = fs::set_permissions(&self.path, perms);
        }

        // Wipe plaintext.
        let mut p = plaintext;
        p.zeroize();
        Ok(())
    }

    pub fn add(&mut self, name: String, entry: Entry) -> Result<()> {
        if self.inner.entries.contains_key(&name) {
            return Err(VaultError::EntryExists(name));
        }
        self.inner.entries.insert(name, entry);
        self.save()
    }

    pub fn remove(&mut self, name: &str) -> Result<()> {
        if self.inner.entries.remove(name).is_none() {
            return Err(VaultError::EntryNotFound(name.into()));
        }
        self.save()
    }

    pub fn get(&self, name: &str) -> Result<&Entry> {
        self.inner
            .entries
            .get(name)
            .ok_or_else(|| VaultError::EntryNotFound(name.into()))
    }

    pub fn list(&self) -> Vec<(&String, &Entry)> {
        self.inner.entries.iter().collect()
    }
}
