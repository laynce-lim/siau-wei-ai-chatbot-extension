from __future__ import annotations

from collections import Counter
from typing import Any, Dict, List

import pandas as pd

from common import (
    clean_row_dict,
    is_delay_value,
    likely_pm_column,
    likely_reason_column,
    likely_status_column,
    norm_text,
    parse_args,
    print_json,
    read_tables,
)


def main() -> None:
    args = parse_args(include_question=True)
    q = norm_text(args.question)
    results: List[Dict[str, Any]] = []

    for table in read_tables(args.data):
        df = table.get("data")
        if df is None or df.empty:
            continue
        if str(table.get("sheet", "")).lower() in {"categories", "lookup", "lookups", "lists"}:
            continue

        columns = list(df.columns)
        status_col = likely_status_column(columns)
        pm_col = likely_pm_column(columns)
        reason_col = likely_reason_column(columns)

        if "delayed" in q or "delay" in q or "late" in q or "past due" in q or "risk" in q:
            if not status_col:
                results.append({
                    "file": table["file"],
                    "sheet": table["sheet"],
                    "analysis": "delay_analysis",
                    "error": "No clear status column found",
                    "columns": columns
                })
                continue
            filtered = df[df[status_col].apply(is_delay_value)]
        else:
            filtered = df

        if any(word in q for word in ["most", "least", "count", "how many", "group", "by pm", "by owner"]):
            if pm_col:
                grouped = (
                    filtered.groupby(pm_col, dropna=False)
                    .size()
                    .sort_values(ascending=False)
                    .reset_index(name="count")
                )
                top = grouped.head(10).where(pd.notnull(grouped), None).to_dict(orient="records")
                sample_rows = filtered.head(10).where(pd.notnull(filtered), None).to_dict(orient="records")
                result: Dict[str, Any] = {
                    "file": table["file"],
                    "sheet": table["sheet"],
                    "analysis": "count_by_pm_or_owner",
                    "filter": f"{status_col} is delay-related" if status_col and len(filtered) != len(df) else "no filter",
                    "group_column": pm_col,
                    "row_count_after_filter": int(len(filtered)),
                    "top_counts": top,
                    "sample_rows": sample_rows
                }
                if reason_col and len(filtered):
                    reason_counts = Counter(filtered[reason_col].dropna().astype(str).str.strip())
                    result["top_reasons"] = [
                        {"reason": reason, "count": count}
                        for reason, count in reason_counts.most_common(10)
                    ]
                results.append(result)
            else:
                results.append({
                    "file": table["file"],
                    "sheet": table["sheet"],
                    "analysis": "count_by_pm_or_owner",
                    "error": "No clear PM/Owner column found",
                    "columns": columns
                })
        elif any(word in q for word in ["summary", "summarize", "overview"]):
            results.append({
                "file": table["file"],
                "sheet": table["sheet"],
                "analysis": "summary",
                "row_count": int(len(df)),
                "columns": columns,
                "status_counts": df[status_col].value_counts(dropna=False).head(20).to_dict() if status_col else None
            })
        else:
            # General fallback: return status counts and possible PM counts.
            summary: Dict[str, Any] = {
                "file": table["file"],
                "sheet": table["sheet"],
                "analysis": "general",
                "row_count": int(len(df)),
                "columns": columns,
            }
            if status_col:
                summary["status_counts"] = df[status_col].value_counts(dropna=False).head(20).to_dict()
            if pm_col:
                summary["pm_counts"] = df[pm_col].value_counts(dropna=False).head(20).to_dict()
            results.append(summary)

    print_json({"ok": True, "question": args.question, "results": results})


if __name__ == "__main__":
    main()
