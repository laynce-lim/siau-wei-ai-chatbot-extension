"""Time-series trend analysis over the current CSV/Excel data."""
from __future__ import annotations

from typing import Any, Dict, List

import pandas as pd

from common import (
    coerce_datetime,
    detect_date_column,
    norm_text,
    numeric_columns,
    parse_args,
    print_json,
    read_tables,
    resolve_column,
    resolve_freq,
    skip_sheet,
)

MAX_POINTS = 60


def direction(first: float, last: float) -> str:
    if last > first:
        return "increasing"
    if last < first:
        return "decreasing"
    return "flat"


def summarize_series(series: pd.Series) -> Dict[str, Any]:
    points = [
        {"period": str(period.date()) if hasattr(period, "date") else str(period), "value": float(value)}
        for period, value in series.items()
    ]
    trimmed = points[-MAX_POINTS:]

    summary: Dict[str, Any] = {
        "points": trimmed,
        "period_count": len(points),
        "truncated": len(points) > len(trimmed),
    }

    if len(points) >= 2:
        first_value = points[0]["value"]
        last_value = points[-1]["value"]
        change = last_value - first_value
        summary.update({
            "first_period": points[0]["period"],
            "last_period": points[-1]["period"],
            "first_value": first_value,
            "last_value": last_value,
            "absolute_change": change,
            "percent_change": (change / first_value * 100.0) if first_value else None,
            "direction": direction(first_value, last_value),
            "peak": max(points, key=lambda p: p["value"]),
            "trough": min(points, key=lambda p: p["value"]),
        })

    return summary


def analyze_table(table: Dict[str, Any], args: Any) -> Dict[str, Any] | None:
    df = table.get("data")
    if df is None or df.empty or skip_sheet(table.get("sheet")):
        return None

    date_col = resolve_column(df.columns, args.date_column) or detect_date_column(df)
    if not date_col:
        return {
            "file": table["file"],
            "sheet": table["sheet"],
            "analysis": "trend",
            "error": "No date-like column found",
            "columns": [str(c) for c in df.columns],
        }

    working = df.copy()
    working[date_col] = coerce_datetime(working[date_col])
    working = working.dropna(subset=[date_col])

    if working.empty:
        return {
            "file": table["file"],
            "sheet": table["sheet"],
            "analysis": "trend",
            "error": f"Column '{date_col}' produced no usable dates",
        }

    freq = resolve_freq(args.freq, args.question)
    value_col = resolve_column(df.columns, args.value_column)

    if value_col and value_col in numeric_columns(working):
        measure = f"sum of {value_col}"
        resampled = working.set_index(date_col)[value_col].resample(freq).sum()
    else:
        measure = "row count"
        value_col = None
        resampled = working.set_index(date_col).resample(freq).size()

    result: Dict[str, Any] = {
        "file": table["file"],
        "sheet": table["sheet"],
        "analysis": "trend",
        "date_column": date_col,
        "value_column": value_col,
        "measure": measure,
        "frequency": freq,
        "row_count": int(len(working)),
        "overall": summarize_series(resampled),
    }

    group_col = resolve_column(df.columns, args.group_by)
    if group_col:
        by_group: List[Dict[str, Any]] = []
        for key, chunk in working.groupby(group_col, dropna=False):
            indexed = chunk.set_index(date_col)
            series = indexed[value_col].resample(freq).sum() if value_col else indexed.resample(freq).size()
            by_group.append({"group": None if pd.isna(key) else str(key), **summarize_series(series)})

        by_group.sort(key=lambda item: item.get("last_value") or 0, reverse=True)
        result["group_column"] = group_col
        result["by_group"] = by_group[:10]

    return result


def main() -> None:
    args = parse_args(include_question=True, extra_options=["date-column", "value-column", "group-by", "freq"])

    # argparse turns --date-column into date_column; keep attribute access uniform.
    args.date_column = getattr(args, "date_column", None)
    args.value_column = getattr(args, "value_column", None)
    args.group_by = getattr(args, "group_by", None)

    results = [r for r in (analyze_table(t, args) for t in read_tables(args.data)) if r]

    print_json({
        "ok": True,
        "question": args.question,
        "normalized_question": norm_text(args.question),
        "results": results,
    })


if __name__ == "__main__":
    main()
