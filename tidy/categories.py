"""File-extension to category mapping used by tidy."""

# Mapping of category name -> set of lowercase extensions (without leading dot).
CATEGORIES: dict[str, set[str]] = {
    "Images": {
        "jpg", "jpeg", "png", "gif", "bmp", "tiff", "webp", "svg", "heic", "ico",
    },
    "Videos": {
        "mp4", "mov", "avi", "mkv", "wmv", "flv", "webm", "m4v",
    },
    "Audio": {
        "mp3", "wav", "flac", "aac", "ogg", "m4a", "wma",
    },
    "Documents": {
        "pdf", "doc", "docx", "odt", "rtf", "tex", "md", "txt",
        "xls", "xlsx", "ods", "csv", "ppt", "pptx", "odp",
    },
    "Archives": {
        "zip", "tar", "gz", "bz2", "xz", "7z", "rar", "iso",
    },
    "Code": {
        "py", "js", "ts", "tsx", "jsx", "java", "c", "cpp", "h", "hpp",
        "cs", "go", "rs", "rb", "php", "swift", "kt", "sh", "html", "css",
        "json", "yaml", "yml", "toml", "xml", "sql",
    },
    "Executables": {
        "exe", "msi", "dmg", "pkg", "deb", "rpm", "appimage",
    },
    "Fonts": {
        "ttf", "otf", "woff", "woff2",
    },
}


def category_for(extension: str) -> str:
    """Return the category name for a given file extension.

    The extension may be passed with or without a leading dot and in any case.
    Files with unknown or missing extensions are placed in ``Other``.
    """
    if not extension:
        return "Other"
    ext = extension.lower().lstrip(".")
    for name, exts in CATEGORIES.items():
        if ext in exts:
            return name
    return "Other"
