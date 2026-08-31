"""Profiles every column so the model can map business language onto real values."""
from __future__ import annotations

import json
from typing import Any, Dict, List

import pandas as pd

from common import (
    coerce_datetime,
    json_safe,
    norm_text,
    parse_args,
    print_json,
    read_tables,
    skip_sheet,
    truthy,
)

# Below this many distinct values a column is treated as a category and listed in full.
CATEGORY_LIMIT = 25
TOP_VALUES = 10
MAX_TEXT_SAMPLE = 60

# Hiding a sheet makes it unanswerable, so trim detail before dropping tables.
MAX_PROFILE_CHARS = 45000
MAX_TABLES = 40
MAX_COLUMNS = 40

# 2 = values with counts, 1 = a few values, 0 = stats only, -1 = column names only.
DETAIL_FULL = 2
DETAIL_COMPACT = 1
DETAIL_MINIMAL = 0
DETAIL_NAMES = -1


def looks_like_date(name: str) -> bool:
    hints = ["date", "day", "week", "month", "quarter", "year", "time", "timestamp", "period"]
    lowered = norm_text(name)
    return any(hint in lowered for hint in hints)


def shorten(value: Any) -> Any:
    text = str(value)
    return text[:MAX_TEXT_SAMPLE] + "..." if len(text) > MAX_TEXT_SAMPLE else value


def profile_column(df: pd.DataFrame, column: Any, include_values: bool, detail: int) -> Dict[str, Any]:
    series = df[column]
    non_null = series.dropna()
    blank_mask = non_null.astype(str).str.strip() == ""
    usable = non_null[~blank_mask]

    info: Dict[str, Any] = {
        "name": str(column),
        "non_null_count": int(len(usable)),
        "blank_count": int(len(df) - len(usable)),
        "distinct_count": int(usable.nunique()),
    }

    if pd.api.types.is_numeric_dtype(series) and len(usable):
        numeric = pd.to_numeric(usable, errors="coerce").dropna()
        if len(numeric):
            info["type"] = "number"
            info["min"] = float(numeric.min())
            info["max"] = float(numeric.max())
            info["mean"] = round(float(numeric.mean()), 3)
            return add_values(info, usable, include_values, detail)

    if len(usable) and (pd.api.types.is_datetime64_any_dtype(series) or looks_like_date(column)):
        parsed = coerce_datetime(usable).dropna()
        if len(parsed) and len(parsed) / len(usable) >= 0.6:
            info["type"] = "date"
            info["earliest"] = str(parsed.min())
            info["latest"] = str(parsed.max())
            return info

    info["type"] = "text"
    return add_values(info, usable, include_values, detail)


def add_values(info: Dict[str, Any], usable: pd.Series, include_values: bool, detail: int) -> Dict[str, Any]:
    if not len(usable):
        return info

    info["is_category"] = info["distinct_count"] <= CATEGORY_LIMIT

    if not include_values:
        info["values_hidden"] = True
        return info

    if detail <= DETAIL_MINIMAL:
        return info

    counts = usable.astype(str).str.strip().value_counts()

    if info["is_category"]:
        if detail >= DETAIL_FULL:
            info["values"] = [
                {"value": shorten(value), "count": int(count)} for value, count in counts.items()
            ]
        else:
            info["values"] = [shorten(value) for value in counts.head(8).index]
    elif detail >= DETAIL_FULL:
        info["example_values"] = [shorten(value) for value in counts.head(TOP_VALUES).index]
    else:
        info["example_values"] = [shorten(value) for value in counts.head(3).index]

    return info


def column_type(series: pd.Series, name: Any) -> str:
    if pd.api.types.is_numeric_dtype(series):
        return "number"
    if pd.api.types.is_datetime64_any_dtype(series) or looks_like_date(name):
        return "date"
    return "text"


def compact_columns(df: pd.DataFrame) -> List[str]:
    """Cheap fallback that keeps every column visible without per-value work."""
    return [f"{column} ({column_type(df[column], column)})" for column in df.columns[:MAX_COLUMNS]]


def build_payload(all_tables: List[Dict[str, Any]], include_values: bool, detail: int) -> Dict[str, Any]:
    tables: List[Dict[str, Any]] = []

    for table in all_tables[:MAX_TABLES]:
        df = table.get("data")

        if df is None or df.empty:
            tables.append({
                "file": table.get("file"),
                "sheet": table.get("sheet"),
                "error": table.get("error") or "No rows found",
            })
            continue

        columns = list(df.columns)
        entry: Dict[str, Any] = {
            "file": table["file"],
            "sheet": table["sheet"],
            "is_lookup_sheet": skip_sheet(table.get("sheet")),
            "row_count": int(len(df)),
            "column_count": len(columns),
            "columns": compact_columns(df) if detail <= DETAIL_NAMES else [
                profile_column(df, column, include_values, detail) for column in columns[:MAX_COLUMNS]
            ],
        }

        if len(columns) > MAX_COLUMNS:
            entry["columns_truncated"] = True
            entry["columns_not_shown"] = [str(c) for c in columns[MAX_COLUMNS:MAX_COLUMNS + 10]]
            entry["columns_not_shown_count"] = len(columns) - MAX_COLUMNS

        tables.append(entry)

    payload: Dict[str, Any] = {
        "ok": True,
        "values_included": include_values,
        "detail_level": detail,
        "table_count": len(all_tables),
        "tables": tables,
    }

    if len(all_tables) > MAX_TABLES:
        payload["tables_truncated"] = True

    return payload


def main() -> None:
    args = parse_args(extra_options=["no-values"])
    include_values = not truthy(getattr(args, "no_values", None))

    all_tables = read_tables(args.data)

    # Every sheet must stay visible, so shed per-column detail before anything else.
    for detail in (DETAIL_FULL, DETAIL_COMPACT, DETAIL_MINIMAL, DETAIL_NAMES):
        payload = build_payload(all_tables, include_values, detail)
        if len(json.dumps(json_safe(payload), default=str)) <= MAX_PROFILE_CHARS:
            break

    if payload["detail_level"] <= DETAIL_NAMES:
        payload["note"] = (
            "This dataset is large, so only column names and types are listed. "
            "Use exact column names from this profile; run a query to inspect values."
        )

    print_json(payload)


if __name__ == "__main__":
    main()
