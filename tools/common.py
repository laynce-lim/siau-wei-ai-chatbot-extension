from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import re
import tempfile
from pathlib import Path
from typing import Any, Dict, Iterable, List, Tuple

import pandas as pd

SUPPORTED_EXTENSIONS = {".csv", ".xlsx", ".xlsm", ".xls"}


def parse_args(include_question: bool = False, extra_options: Iterable[str] = ()) -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", default="data", help="Folder containing Excel/CSV files")
    if include_question:
        parser.add_argument("--question", required=True, help="User question")
    for option in extra_options:
        parser.add_argument(f"--{option}", default=None)
    return parser.parse_args()


def json_safe(value: Any) -> Any:
    """NaN/NaT are valid Python JSON but crash JSON.parse in the extension."""
    if isinstance(value, dict):
        return {str(k): json_safe(v) for k, v in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [json_safe(v) for v in value]
    if isinstance(value, float):
        return None if math.isnan(value) or math.isinf(value) else value
    if value is None or isinstance(value, (str, bool, int)):
        return value

    try:
        if pd.isna(value):
            return None
    except (TypeError, ValueError):
        pass

    return value


def print_json(payload: Any) -> None:
    print(json.dumps(json_safe(payload), indent=2, default=str))


def error_json(message: str, **extra: Any) -> None:
    print_json({"ok": False, "error": message, **extra})


def list_data_files(data_folder: str | Path) -> List[Path]:
    root = Path(data_folder)
    if not root.exists():
        return []
    return sorted([p for p in root.rglob("*") if p.is_file() and p.suffix.lower() in SUPPORTED_EXTENSIONS])


def truthy(value: Any) -> bool:
    return norm_text(value) in {"1", "true", "yes", "y", "on"}


def cache_root() -> Path:
    override = os.environ.get("SIAU_CHAT_CACHE")
    root = Path(override) if override else Path(tempfile.gettempdir()) / "siau-chat-table-cache"
    root.mkdir(parents=True, exist_ok=True)
    return root


def cache_path(file_path: Path, sheet: str) -> Path:
    stat = file_path.stat()
    key = f"{file_path.resolve()}|{sheet}|{stat.st_mtime_ns}|{stat.st_size}"
    digest = hashlib.sha256(key.encode("utf-8")).hexdigest()[:24]
    return cache_root() / f"{digest}.parquet"


def read_cached(target: Path) -> pd.DataFrame | None:
    if not target.exists():
        return None
    try:
        return pd.read_parquet(target)
    except Exception:
        return None


def write_cached(target: Path, df: pd.DataFrame) -> None:
    # Parquet chokes on mixed-type object columns; a cache miss is harmless.
    try:
        df.to_parquet(target, index=False)
    except Exception:
        pass


def read_tables(data_folder: str | Path) -> List[Dict[str, Any]]:
    tables: List[Dict[str, Any]] = []
    use_cache = not truthy(os.environ.get("SIAU_CHAT_NO_CACHE"))

    for file_path in list_data_files(data_folder):
        try:
            if file_path.suffix.lower() == ".csv":
                tables.append({
                    "file": str(file_path),
                    "sheet": "CSV",
                    "data": load_frame(file_path, "CSV", use_cache),
                })
            else:
                excel = pd.ExcelFile(file_path)
                for sheet in excel.sheet_names:
                    df = load_frame(file_path, sheet, use_cache)
                    if not df.empty:
                        tables.append({"file": str(file_path), "sheet": sheet, "data": df})
        except Exception as exc:  # keep going if one file is bad
            tables.append({"file": str(file_path), "sheet": None, "error": str(exc), "data": pd.DataFrame()})
    return tables


def load_frame(file_path: Path, sheet: str, use_cache: bool) -> pd.DataFrame:
    target = cache_path(file_path, sheet) if use_cache else None

    if target is not None:
        cached = read_cached(target)
        if cached is not None:
            return cached

    if sheet == "CSV":
        df = normalize_columns(pd.read_csv(file_path))
    else:
        df = normalize_columns(pd.read_excel(file_path, sheet_name=sheet))

    if target is not None:
        write_cached(target, df)

    return df


def normalize_columns(df: pd.DataFrame) -> pd.DataFrame:
    clean = df.copy()
    clean.columns = [str(c).strip() for c in clean.columns]
    return clean


def norm_text(value: Any) -> str:
    if pd.isna(value):
        return ""
    return re.sub(r"\s+", " ", str(value).strip().lower())


def extract_terms(question: str) -> List[str]:
    raw_terms = re.findall(r"[A-Za-z0-9_\-]+", question.lower())
    stop = {
        "what", "which", "who", "where", "when", "why", "how", "is", "are", "the", "a", "an",
        "of", "for", "to", "in", "on", "by", "with", "and", "or", "has", "have", "most", "least",
        "many", "much", "all", "me", "show", "find", "give", "tell", "about", "status"
    }
    terms = [t for t in raw_terms if t not in stop and len(t) > 1]
    # keep obvious IDs/numbers even if short
    terms += re.findall(r"\b\d+\b", question)
    return sorted(set(terms), key=len, reverse=True)


def find_column(columns: Iterable[str], candidates: Iterable[str]) -> str | None:
    normalized = [(col, norm_text(col)) for col in columns]
    # Exact matches first.
    for candidate in candidates:
        c = norm_text(candidate)
        for original, n in normalized:
            if n == c:
                return original
    # Then allow candidate phrase inside a longer column name.
    # Avoid matching a generic column like "Project" to the candidate "Project Manager".
    for candidate in candidates:
        c = norm_text(candidate)
        for original, n in normalized:
            if len(c) >= 3 and c in n:
                return original
    return None


def likely_pm_column(columns: Iterable[str]) -> str | None:
    return find_column(columns, ["pm", "project manager", "program manager", "owner", "responsible", "assignee"])


def likely_status_column(columns: Iterable[str]) -> str | None:
    return find_column(columns, ["status", "state", "current status", "order status"])


def likely_reason_column(columns: Iterable[str]) -> str | None:
    return find_column(columns, ["reason", "delay reason", "issue", "blocker", "notes", "comment", "comments"])


def likely_id_column(columns: Iterable[str]) -> str | None:
    return find_column(columns, ["order id", "order", "id", "po", "purchase order", "project id", "ticket"])


def is_delay_value(value: Any) -> bool:
    text = norm_text(value)
    return any(term in text for term in ["delay", "late", "past due", "behind", "blocked", "at risk"])


def dataframe_preview(df: pd.DataFrame, rows: int = 5) -> List[Dict[str, Any]]:
    return df.head(rows).where(pd.notnull(df), None).to_dict(orient="records")


def clean_row_dict(row: pd.Series) -> Dict[str, Any]:
    return {str(k): (None if pd.isna(v) else v) for k, v in row.to_dict().items()}


def records(df: pd.DataFrame, rows: int | None = None) -> List[Dict[str, Any]]:
    subset = df if rows is None else df.head(rows)
    return subset.where(pd.notnull(subset), None).to_dict(orient="records")


def resolve_column(columns: Iterable[str], requested: str | None) -> str | None:
    """Maps a caller-supplied column name onto a real column, tolerating case/spacing."""
    if not requested:
        return None
    return find_column(columns, [requested])


def coerce_datetime(series: pd.Series) -> pd.Series:
    if pd.api.types.is_datetime64_any_dtype(series):
        return series
    try:
        return pd.to_datetime(series, errors="coerce", format="mixed", dayfirst=False)
    except (ValueError, TypeError):
        return pd.to_datetime(series, errors="coerce")


def detect_date_column(df: pd.DataFrame, min_parse_ratio: float = 0.6) -> str | None:
    """Picks the column that best behaves like a date, preferring date-sounding names."""
    hints = ["date", "day", "week", "month", "quarter", "year", "time", "timestamp", "period"]
    best: Tuple[str, float] | None = None

    for column in df.columns:
        series = df[column]
        if series.dropna().empty:
            continue

        if pd.api.types.is_datetime64_any_dtype(series):
            parsed_ratio = 1.0
        elif pd.api.types.is_numeric_dtype(series):
            # to_datetime happily reads plain integers as epoch nanoseconds.
            continue
        else:
            try:
                parsed = coerce_datetime(series)
            except Exception:
                continue
            parsed_ratio = float(parsed.notna().mean())

        if parsed_ratio < min_parse_ratio:
            continue

        name = norm_text(column)
        score = parsed_ratio + (0.5 if any(hint in name for hint in hints) else 0.0)

        if best is None or score > best[1]:
            best = (str(column), score)

    return best[0] if best else None


def numeric_columns(df: pd.DataFrame) -> List[str]:
    return [str(c) for c in df.columns if pd.api.types.is_numeric_dtype(df[c])]


def choose_group_column(df: pd.DataFrame, question: str) -> str | None:
    """Prefers a column the user actually named, then falls back to owner/status."""
    q = norm_text(question)

    named = [
        (str(column), len(norm_text(column)))
        for column in df.columns
        if len(norm_text(column)) >= 3 and norm_text(column) in q
    ]
    if named:
        return max(named, key=lambda item: item[1])[0]

    for finder in (likely_pm_column, likely_status_column):
        found = finder(df.columns)
        if found:
            return found

    return None


# pandas 2.2 renamed the month/quarter/year offset aliases.
FREQ_ALIASES = {"d": "D", "w": "W", "m": "ME", "q": "QE", "y": "YE", "a": "YE"}


def resolve_freq(freq: str | None, question: str = "") -> str:
    if freq:
        return FREQ_ALIASES.get(freq.strip().lower()[0], "ME")

    q = norm_text(question)
    if "daily" in q or "per day" in q or "by day" in q:
        return "D"
    if "weekly" in q or "per week" in q or "by week" in q:
        return "W"
    if "quarter" in q:
        return "QE"
    if "year" in q or "annual" in q or "yoy" in q:
        return "YE"
    return "ME"


def skip_sheet(sheet: Any) -> bool:
    return str(sheet or "").lower() in {"categories", "lookup", "lookups", "lists"}

