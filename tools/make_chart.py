"""Renders a PNG chart from the current CSV/Excel data."""
from __future__ import annotations

import hashlib
import time
from pathlib import Path
from typing import Any, Dict, List, Tuple

import pandas as pd

from common import (
    choose_group_column,
    coerce_datetime,
    detect_date_column,
    error_json,
    norm_text,
    numeric_columns,
    parse_args,
    print_json,
    read_tables,
    resolve_column,
    resolve_freq,
    skip_sheet,
)

MAX_CATEGORIES = 15


def pick_chart_type(requested: str | None, question: str) -> str:
    if requested:
        wanted = norm_text(requested)
        if wanted in {"bar", "line", "pie", "barh"}:
            return wanted

    q = norm_text(question)
    if any(word in q for word in ["trend", "over time", "by month", "monthly", "timeline", "growth"]):
        return "line"
    if any(word in q for word in ["share", "proportion", "percentage", "percent", "breakdown", "pie"]):
        return "pie"
    return "bar"


def build_series(df: pd.DataFrame, args: Any, chart_type: str) -> Tuple[pd.Series, str, str]:
    """Returns the plottable series plus its axis labels."""
    value_col = resolve_column(df.columns, args.value_column)
    numeric = numeric_columns(df)

    if chart_type == "line":
        date_col = resolve_column(df.columns, args.date_column) or detect_date_column(df)
        if not date_col:
            raise ValueError("No date-like column found for a line chart.")

        working = df.copy()
        working[date_col] = coerce_datetime(working[date_col])
        working = working.dropna(subset=[date_col]).set_index(date_col)

        if working.empty:
            raise ValueError(f"Column '{date_col}' produced no usable dates.")

        freq = resolve_freq(args.freq, args.question)
        if value_col and value_col in numeric:
            return working[value_col].resample(freq).sum(), str(date_col), f"sum of {value_col}"
        return working.resample(freq).size(), str(date_col), "row count"

    group_col = resolve_column(df.columns, args.group_by) or choose_group_column(df, args.question)
    if not group_col:
        raise ValueError("No suitable category column found to group by.")

    if value_col and value_col in numeric:
        series = df.groupby(group_col, dropna=False)[value_col].sum()
        measure = f"sum of {value_col}"
    else:
        series = df.groupby(group_col, dropna=False).size()
        measure = "row count"

    series = series.sort_values(ascending=False).head(MAX_CATEGORIES)
    series.index = [("(blank)" if pd.isna(i) else str(i)) for i in series.index]
    return series, str(group_col), measure


def render(series: pd.Series, chart_type: str, title: str, x_label: str, y_label: str, out_path: Path) -> None:
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    fig, ax = plt.subplots(figsize=(9, 5), dpi=140)

    if chart_type == "pie":
        ax.pie([float(v) for v in series.values], labels=[str(i) for i in series.index], autopct="%1.1f%%")
        ax.axis("equal")
    elif chart_type == "line":
        ax.plot([str(i.date()) if hasattr(i, "date") else str(i) for i in series.index],
                [float(v) for v in series.values], marker="o")
        ax.set_xlabel(x_label)
        ax.set_ylabel(y_label)
        ax.grid(True, alpha=0.3)
        fig.autofmt_xdate(rotation=45)
    else:
        ax.bar([str(i) for i in series.index], [float(v) for v in series.values])
        ax.set_xlabel(x_label)
        ax.set_ylabel(y_label)
        ax.grid(True, axis="y", alpha=0.3)
        fig.autofmt_xdate(rotation=45)

    ax.set_title(title)
    fig.tight_layout()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(out_path)
    plt.close(fig)


def main() -> None:
    args = parse_args(
        include_question=True,
        extra_options=["out", "chart-type", "group-by", "value-column", "date-column", "freq", "title"],
    )
    args.chart_type = getattr(args, "chart_type", None)
    args.group_by = getattr(args, "group_by", None)
    args.value_column = getattr(args, "value_column", None)
    args.date_column = getattr(args, "date_column", None)

    try:
        import matplotlib  # noqa: F401
    except ImportError:
        error_json("matplotlib is not installed. Run: pip install -r requirements.txt")
        return

    out_dir = Path(args.out) if args.out else Path(args.data).parent / "charts"
    chart_type = pick_chart_type(args.chart_type, args.question)

    tables = [
        t for t in read_tables(args.data)
        if t.get("data") is not None and not t["data"].empty and not skip_sheet(t.get("sheet"))
    ]

    attempts: List[Dict[str, Any]] = []

    for table in tables:
        try:
            series, x_label, measure = build_series(table["data"], args, chart_type)
        except ValueError as exc:
            attempts.append({"file": table["file"], "sheet": table["sheet"], "skipped": str(exc)})
            continue

        if series.empty:
            attempts.append({"file": table["file"], "sheet": table["sheet"], "skipped": "No data to plot."})
            continue

        title = args.title or f"{measure} by {x_label}"
        stamp = f"{int(time.time())}-{hashlib.sha256(str(table['file']).encode()).hexdigest()[:8]}"
        out_path = out_dir / f"chart-{stamp}.png"

        render(series, chart_type, title, x_label, measure, out_path)

        print_json({
            "ok": True,
            "question": args.question,
            "results": [{
                "analysis": "chart",
                "file": table["file"],
                "sheet": table["sheet"],
                "chart_type": chart_type,
                "chart_path": str(out_path),
                "title": title,
                "category_column": x_label,
                "measure": measure,
                "data": [
                    {"label": str(i.date()) if hasattr(i, "date") else str(i), "value": float(v)}
                    for i, v in series.items()
                ],
            }],
            "skipped": attempts,
        })
        return

    error_json("Could not build a chart from the current data.", attempts=attempts)


if __name__ == "__main__":
    main()
