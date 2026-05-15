//! Crypto primitives: Argon2id KDF + AES-256-GCM authenticated encryption.
//!
//! - Salt: 16 random bytes per vault.
//! - Nonce: 12 random bytes per encryption (re-rolled on every save).
//! - Key: 32 bytes derived via Argon2id (m=64 MiB, t=3, p=4).

use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Key, Nonce,
};
use argon2::{Algorithm, Argon2, Params, Version};
use rand::{rngs::OsRng, RngCore};
use zeroize::Zeroize;

use crate::error::{Result, VaultError};

pub const SALT_LEN: usize = 16;
pub const NONCE_LEN: usize = 12;
pub const KEY_LEN: usize = 32;

/// Argon2id parameters: ~64 MiB memory, 3 iterations, 4 lanes.
fn argon2() -> Argon2<'static> {
    let params = Params::new(64 * 1024, 3, 4, Some(KEY_LEN))
        .expect("valid Argon2 params");
    Argon2::new(Algorithm::Argon2id, Version::V0x13, params)
}

/// Derive a 32-byte key from a password and salt.
pub fn derive_key(password: &[u8], salt: &[u8]) -> Result<[u8; KEY_LEN]> {
    let mut key = [0u8; KEY_LEN];
    argon2()
        .hash_password_into(password, salt, &mut key)
        .map_err(|e| VaultError::Crypto(format!("argon2: {e}")))?;
    Ok(key)
}

pub fn random_salt() -> [u8; SALT_LEN] {
    let mut s = [0u8; SALT_LEN];
    OsRng.fill_bytes(&mut s);
    s
}

pub fn random_nonce() -> [u8; NONCE_LEN] {
    let mut n = [0u8; NONCE_LEN];
    OsRng.fill_bytes(&mut n);
    n
}

/// Encrypt `plaintext` with AES-256-GCM. Returns ciphertext (with appended tag).
pub fn encrypt(key: &[u8; KEY_LEN], nonce: &[u8; NONCE_LEN], plaintext: &[u8]) -> Result<Vec<u8>> {
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));
    cipher
        .encrypt(Nonce::from_slice(nonce), plaintext)
        .map_err(|e| VaultError::Crypto(format!("encrypt: {e}")))
}

/// Decrypt ciphertext. Returns `BadPassword` on auth tag failure.
pub fn decrypt(key: &[u8; KEY_LEN], nonce: &[u8; NONCE_LEN], ciphertext: &[u8]) -> Result<Vec<u8>> {
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));
    cipher
        .decrypt(Nonce::from_slice(nonce), ciphertext)
        .map_err(|_| VaultError::BadPassword)
}

/// Wrapper that zeroes the key on drop.
pub struct DerivedKey(pub [u8; KEY_LEN]);

impl Drop for DerivedKey {
    fn drop(&mut self) {
        self.0.zeroize();
    }
}
