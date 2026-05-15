//! CLI definitions using `clap` derive API.

use clap::{Parser, Subcommand};
use std::path::PathBuf;

#[derive(Parser)]
#[command(
    name = "ssh-vault",
    version,
    about = "Secure encrypted vault for SSH private keys and passwords",
    long_about = "ssh-vault stores SSH credentials (private keys or passwords) in a local \
                  encrypted vault protected by a master password.\n\n\
                  Encryption: AES-256-GCM\n\
                  Key derivation: Argon2id (64 MiB, 3 iterations, 4 lanes)"
)]
pub struct Cli {
    /// Path to the vault file (default: ~/.config/ssh-vault/vault.json)
    #[arg(long, short = 'f', global = true, env = "SSH_VAULT_FILE")]
    pub vault_file: Option<PathBuf>,

    #[command(subcommand)]
    pub command: Command,
}

#[derive(Subcommand)]
pub enum Command {
    /// Initialize a new empty vault
    Init,

    /// Add a new SSH credential to the vault
    Add {
        /// A unique name for this entry (e.g. "prod-server")
        name: String,

        /// Remote hostname or IP
        #[arg(long, short = 'H')]
        host: String,

        /// SSH username
        #[arg(long, short = 'u')]
        user: String,

        /// SSH port (default: 22)
        #[arg(long, short = 'p', default_value_t = 22)]
        port: u16,

        /// Path to an SSH private key file to import
        #[arg(long, short = 'k', group = "secret_source")]
        key_file: Option<PathBuf>,

        /// Store a password instead of a key (will prompt securely)
        #[arg(long, short = 'P', group = "secret_source")]
        password: bool,

        /// Optional notes
        #[arg(long)]
        notes: Option<String>,
    },

    /// List all stored entries (names + hosts)
    List,

    /// Retrieve and display a stored credential
    Get {
        /// Entry name
        name: String,

        /// Show the secret (key/password) in the terminal
        #[arg(long, short = 's')]
        show_secret: bool,
    },

    /// Remove an entry from the vault
    Remove {
        /// Entry name to remove
        name: String,
    },

    /// Change the vault master password
    ChangePassword,
}
