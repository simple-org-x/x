"""Command-line entry point for tidy."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from . import __version__
from .core import apply_moves, plan_moves


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="tidy",
        description="Organize a messy folder by file type (and optionally by date).",
    )
    parser.add_argument(
        "path",
        nargs="?",
        default=".",
        help="Directory to organize (default: current directory).",
    )
    parser.add_argument(
        "--by-date",
        action="store_true",
        help="Also group files into YYYY-MM subfolders by modification time.",
    )
    parser.add_argument(
        "-r", "--recursive",
        action="store_true",
        help="Descend into subdirectories.",
    )
    parser.add_argument(
        "-n", "--dry-run",
        action="store_true",
        help="Show what would happen without moving any files.",
    )
    parser.add_argument(
        "-y", "--yes",
        action="store_true",
        help="Skip the confirmation prompt.",
    )
    parser.add_argument(
        "--version",
        action="version",
        version=f"%(prog)s {__version__}",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    source = Path(args.path).expanduser().resolve()

    try:
        moves = plan_moves(source, by_date=args.by_date, recursive=args.recursive)
    except NotADirectoryError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2

    if not moves:
        print(f"Nothing to do. {source} is already tidy.")
        return 0

    print(f"Planned {len(moves)} move(s) in {source}:")
    for move in moves:
        rel_src = move.src.relative_to(source)
        rel_dst = move.dst.relative_to(source)
        print(f"  {rel_src}  ->  {rel_dst}")

    if args.dry_run:
        print("\nDry run: no files were moved.")
        return 0

    if not args.yes:
        answer = input("\nProceed? [y/N] ").strip().lower()
        if answer not in {"y", "yes"}:
            print("Aborted.")
            return 1

    apply_moves(moves)
    print(f"Done. Moved {len(moves)} file(s).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
