# tidy

A tiny, zero-dependency CLI that organizes a messy folder (like `~/Downloads`) by file type — and optionally by date.

```text
Downloads/                       Downloads/
├── photo.jpg                    ├── Images/
├── invoice.pdf          →       │   └── photo.jpg
├── song.mp3                     ├── Documents/
├── archive.zip                  │   └── invoice.pdf
└── notes.txt                    ├── Audio/
                                 │   └── song.mp3
                                 ├── Archives/
                                 │   └── archive.zip
                                 └── Documents/
                                     └── notes.txt
```

## Install

```bash
pip install tidy-cli
```

Or run it without installing:

```bash
python -m tidy ~/Downloads --dry-run
```

## Usage

```bash
tidy [PATH] [options]
```

### Options

| Flag | Description |
| --- | --- |
| `PATH` | Directory to organize (default: current directory). |
| `--by-date` | Also group files into `YYYY-MM` subfolders by modification time. |
| `-r`, `--recursive` | Descend into subdirectories. |
| `-n`, `--dry-run` | Print the plan without moving any files. |
| `-y`, `--yes` | Skip the confirmation prompt. |
| `--version` | Show version and exit. |

### Examples

Preview what would happen:

```bash
tidy ~/Downloads --dry-run
```

Organize Downloads, also splitting by month:

```bash
tidy ~/Downloads --by-date -y
```

## Why?

Because your Downloads folder is a war zone, and a 30-second tool shouldn't cost a subscription.

## Sponsor

If `tidy` saved you a few minutes of cleanup, please consider [sponsoring on GitHub](https://github.com/sponsors/YOUR_USERNAME) — even $1 goes a long way toward keeping small open-source utilities like this maintained.

## License

MIT
