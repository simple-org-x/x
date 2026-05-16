"""Core logic for organizing a directory."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from .categories import category_for


@dataclass(frozen=True)
class Move:
    """A single planned or executed move from ``src`` to ``dst``."""

    src: Path
    dst: Path


def _unique_destination(dst: Path) -> Path:
    """If ``dst`` already exists, append ``(1)``, ``(2)``, ... before the suffix."""
    if not dst.exists():
        return dst
    stem, suffix, parent = dst.stem, dst.suffix, dst.parent
    counter = 1
    while True:
        candidate = parent / f"{stem} ({counter}){suffix}"
        if not candidate.exists():
            return candidate
        counter += 1


def plan_moves(
    source: Path,
    *,
    by_date: bool = False,
    recursive: bool = False,
) -> list[Move]:
    """Compute the moves required to organize ``source``.

    Args:
        source: The directory to organize.
        by_date: If True, files are further grouped into ``YYYY-MM`` subfolders
            based on their modification time.
        recursive: If True, descend into subdirectories. Already-organized
            category folders at the top level are skipped to avoid re-shuffling.

    Returns:
        A list of :class:`Move` objects describing the planned operations.
    """
    if not source.exists() or not source.is_dir():
        raise NotADirectoryError(f"{source} is not a directory")

    iterator = source.rglob("*") if recursive else source.iterdir()
    moves: list[Move] = []

    for entry in iterator:
        if not entry.is_file():
            continue
        # Skip files that already live under a top-level category folder.
        try:
            relative = entry.relative_to(source)
        except ValueError:
            continue
        if len(relative.parts) > 1 and relative.parts[0] in _known_top_level():
            continue

        category = category_for(entry.suffix)
        target_dir = source / category
        if by_date:
            mtime = datetime.fromtimestamp(entry.stat().st_mtime)
            target_dir = target_dir / mtime.strftime("%Y-%m")
        dst = _unique_destination(target_dir / entry.name)
        moves.append(Move(src=entry, dst=dst))

    return moves


def _known_top_level() -> set[str]:
    from .categories import CATEGORIES

    return set(CATEGORIES.keys()) | {"Other"}


def apply_moves(moves: list[Move]) -> None:
    """Execute the given moves, creating destination directories as needed."""
    for move in moves:
        move.dst.parent.mkdir(parents=True, exist_ok=True)
        move.src.rename(move.dst)
