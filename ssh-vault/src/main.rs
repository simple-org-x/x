mod cli;
mod crypto;
mod error;
mod vault;

use std::fs;
use std::path::{Path, PathBuf};
use std::process;

use clap::Parser;

use cli::{Cli, Command};
use error::VaultError;
use vault::{Entry, Secret, Vault};

fn main() {
    let cli = Cli::parse();

    if let Err(e) = run(cli) {
        eprintln!("error: {e}");
        process::exit(1);
    }
}

fn run(cli: Cli) -> error::Result<()> {
    let vault_path = cli.vault_file.unwrap_or_else(Vault::default_path);

    match cli.command {
        Command::Init => cmd_init(&vault_path),
        Command::Add {
            name,
            host,
            user,
            port,
            key_file,
            password,
            notes,
        } => cmd_add(&vault_path, &name, &host, &user, port, key_file, password, notes),
        Command::List => cmd_list(&vault_path),
        Command::Get { name, show_secret } => cmd_get(&vault_path, &name, show_secret),
        Command::Remove { name } => cmd_remove(&vault_path, &name),
        Command::ChangePassword => cmd_change_password(&vault_path),
    }
}

// ─── Commands ────────────────────────────────────────────────────────────────

fn cmd_init(path: &Path) -> error::Result<()> {
    let password = prompt_new_password("Enter new master password")?;
    Vault::init(path, &password)?;
    eprintln!("Vault created at {}", path.display());
    Ok(())
}

#[allow(clippy::too_many_arguments)]
fn cmd_add(
    path: &Path,
    name: &str,
    host: &str,
    user: &str,
    port: u16,
    key_file: Option<PathBuf>,
    is_password: bool,
    notes: Option<String>,
) -> error::Result<()> {
    let master = prompt_password("Master password: ")?;
    let mut vault = Vault::open(path, &master)?;

    let secret = if let Some(kf) = key_file {
        let contents = fs::read_to_string(&kf).map_err(|e| {
            VaultError::Io(std::io::Error::new(
                e.kind(),
                format!("reading key file {}: {e}", kf.display()),
            ))
        })?;
        Secret::PrivateKey { contents }
    } else if is_password {
        let pw = prompt_new_password("Enter SSH password")?;
        Secret::Password { password: pw }
    } else {
        eprintln!("error: supply --key-file or --password");
        process::exit(1);
    };

    let entry = Entry {
        host: host.to_owned(),
        user: user.to_owned(),
        port: if port == 22 { None } else { Some(port) },
        secret,
        notes,
    };

    vault.add(name.to_owned(), entry)?;
    eprintln!("Entry '{name}' added.");
    Ok(())
}

fn cmd_list(path: &Path) -> error::Result<()> {
    let master = prompt_password("Master password: ")?;
    let vault = Vault::open(path, &master)?;
    let entries = vault.list();

    if entries.is_empty() {
        eprintln!("Vault is empty.");
        return Ok(());
    }

    println!("{:<20} {:<30} {:<15} TYPE", "NAME", "HOST", "USER");
    println!("{}", "-".repeat(70));
    for (name, entry) in &entries {
        let kind = match &entry.secret {
            Secret::PrivateKey { .. } => "private_key",
            Secret::Password { .. } => "password",
        };
        let port_str = entry.port.map(|p| format!(":{p}")).unwrap_or_default();
        println!(
            "{:<20} {:<30} {:<15} {}",
            name,
            format!("{}{}", entry.host, port_str),
            entry.user,
            kind
        );
    }
    Ok(())
}

fn cmd_get(path: &Path, name: &str, show_secret: bool) -> error::Result<()> {
    let master = prompt_password("Master password: ")?;
    let vault = Vault::open(path, &master)?;
    let entry = vault.get(name)?;

    println!("Name : {name}");
    println!("Host : {}", entry.host);
    println!("User : {}", entry.user);
    println!("Port : {}", entry.port.unwrap_or(22));
    match &entry.secret {
        Secret::PrivateKey { contents } => {
            println!("Type : private_key");
            if show_secret {
                println!("--- BEGIN KEY ---");
                println!("{contents}");
                println!("--- END KEY ---");
            } else {
                println!("Key  : (hidden, use --show-secret to reveal)");
            }
        }
        Secret::Password { password } => {
            println!("Type : password");
            if show_secret {
                println!("Pass : {password}");
            } else {
                println!("Pass : (hidden, use --show-secret to reveal)");
            }
        }
    }
    if let Some(notes) = &entry.notes {
        println!("Notes: {notes}");
    }
    Ok(())
}

fn cmd_remove(path: &Path, name: &str) -> error::Result<()> {
    let master = prompt_password("Master password: ")?;
    let mut vault = Vault::open(path, &master)?;
    vault.remove(name)?;
    eprintln!("Entry '{name}' removed.");
    Ok(())
}

fn cmd_change_password(path: &Path) -> error::Result<()> {
    let old = prompt_password("Current master password: ")?;
    let vault_data = {
        let vault = Vault::open(path, &old)?;
        vault
            .list()
            .into_iter()
            .map(|(n, e)| (n.clone(), e.clone()))
            .collect::<Vec<_>>()
    };

    let new_password = prompt_new_password("Enter new master password")?;

    // Remove old vault and recreate with new password
    std::fs::remove_file(path)?;
    let mut new_vault = Vault::init(path, &new_password)?;
    for (name, entry) in vault_data {
        new_vault.add(name, entry)?;
    }
    eprintln!("Master password changed successfully.");
    Ok(())
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

fn prompt_password(prompt: &str) -> error::Result<String> {
    rpassword::prompt_password(prompt).map_err(VaultError::Io)
}

fn prompt_new_password(label: &str) -> error::Result<String> {
    let p1 = rpassword::prompt_password(format!("{label}: "))?;
    if p1.len() < 8 {
        return Err(VaultError::Crypto(
            "password must be at least 8 characters".into(),
        ));
    }
    let p2 = rpassword::prompt_password(format!("{label} (confirm): "))?;
    if p1 != p2 {
        return Err(VaultError::Crypto("passwords do not match".into()));
    }
    Ok(p1)
}
