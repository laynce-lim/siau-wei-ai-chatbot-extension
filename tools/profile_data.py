"""Profiles every column so the model can map business language onto real values."""
from __future__ import annotations

from typing import Any, Dict, List

import pandas as pd

from common import (
    coerce_datetime,
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

# Keeps the planning prompt small enough for wide workbooks.
MAX_TABLES = 12
MAX_COLUMNS = 40


def looks_like_date(name: str) -> bool:
    hints = ["date", "day", "week", "month", "quarter", "year", "time", "timestamp", "period"]
    lowered = norm_text(name)
    return any(hint in lowered for hint in hints)


def shorten(value: Any) -> Any:
    text = str(value)
    return text[:MAX_TEXT_SAMPLE] + "..." if len(text) > MAX_TEXT_SAMPLE else value


def profile_column(df: pd.DataFrame, column: Any, include_values: bool) -> Dict[str, Any]:
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
            info["median"] = float(numeric.median())
            return add_values(info, usable, include_values)

    if len(usable) and (pd.api.types.is_datetime64_any_dtype(series) or looks_like_date(column)):
        parsed = coerce_datetime(usable).dropna()
        if len(parsed) and len(parsed) / len(usable) >= 0.6:
            info["type"] = "date"
            info["earliest"] = str(parsed.min())
            info["latest"] = str(parsed.max())
            return info

    info["type"] = "text"
    return add_values(info, usable, include_values)


def add_values(info: Dict[str, Any], usable: pd.Series, include_values: bool) -> Dict[str, Any]:
    if not len(usable):
        return info

    info["is_category"] = info["distinct_count"] <= CATEGORY_LIMIT

    if not include_values:
        info["values_hidden"] = True
        return info

    counts = usable.astype(str).str.strip().value_counts()

    if info["is_category"]:
        info["values"] = [
            {"value": shorten(value), "count": int(count)} for value, count in counts.items()
        ]
    else:
        info["example_values"] = [shorten(value) for value in counts.head(TOP_VALUES).index]

    return info


def main() -> None:
    args = parse_args(extra_options=["no-values"])
    include_values = not truthy(getattr(args, "no_values", None))

    all_tables = read_tables(args.data)
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
            "columns": [profile_column(df, column, include_values) for column in columns[:MAX_COLUMNS]],
        }

        if len(columns) > MAX_COLUMNS:
            entry["columns_truncated"] = True
            entry["columns_not_shown"] = [str(c) for c in columns[MAX_COLUMNS:]]

        tables.append(entry)

    payload: Dict[str, Any] = {"ok": True, "values_included": include_values, "tables": tables}

    if len(all_tables) > MAX_TABLES:
        payload["tables_truncated"] = True
        payload["table_count"] = len(all_tables)

    print_json(payload)


if __name__ == "__main__":
    main()
