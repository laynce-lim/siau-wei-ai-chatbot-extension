"""Executes a model-authored query plan deterministically. No expression evaluation."""
from __future__ import annotations

import json
from typing import Any, Dict, List, Tuple

import pandas as pd

from common import (
    blank_mask,
    coerce_datetime,
    error_json,
    norm_text,
    parse_args,
    print_json,
    read_tables,
    records,
    resolve_column,
    skip_sheet,
)

DEFAULT_LIMIT = 25
MAX_LIMIT = 200

TEXT_OPS = {"contains", "not_contains", "starts_with", "ends_with"}
SET_OPS = {"in", "not_in"}
COMPARE_OPS = {"gt", "gte", "lt", "lte"}


def as_list(value: Any) -> List[Any]:
    if value is None:
        return []
    return value if isinstance(value, list) else [value]


def numeric_series(series: pd.Series) -> pd.Series:
    return pd.to_numeric(series, errors="coerce")


def comparable(series: pd.Series, value: Any) -> Tuple[pd.Series, Any]:
    """Coerces both sides to numbers or dates so comparisons mean something."""
    numeric_value = pd.to_numeric(pd.Series([value]), errors="coerce").iloc[0]
    if pd.notna(numeric_value):
        return numeric_series(series), numeric_value

    parsed_value = coerce_datetime(pd.Series([value])).iloc[0]
    if pd.notna(parsed_value):
        return coerce_datetime(series), parsed_value

    return series.astype(str).map(norm_text), norm_text(value)


def build_mask(df: pd.DataFrame, column: str, op: str, value: Any) -> pd.Series:
    series = df[column]
    text = series.astype(str).map(norm_text)
    blank = text.isin(["", "nan", "none", "nat"]) | series.isna()

    if op == "is_blank":
        return blank
    if op == "not_blank":
        return ~blank

    if op in TEXT_OPS:
        needle = norm_text(value)
        if op == "contains":
            return text.str.contains(needle, regex=False, na=False)
        if op == "not_contains":
            return ~text.str.contains(needle, regex=False, na=False)
        if op == "starts_with":
            return text.str.startswith(needle, na=False)
        return text.str.endswith(needle, na=False)

    if op in SET_OPS:
        wanted = {norm_text(item) for item in as_list(value)}
        matched = text.isin(wanted)
        return matched if op == "in" else ~matched

    if op == "between":
        bounds = as_list(value)
        if len(bounds) != 2:
            raise ValueError("'between' needs a two-item list value")
        left, low = comparable(series, bounds[0])
        _, high = comparable(series, bounds[1])
        return (left >= low) & (left <= high)

    if op in COMPARE_OPS:
        left, right = comparable(series, value)
        if op == "gt":
            return left > right
        if op == "gte":
            return left >= right
        if op == "lt":
            return left < right
        return left <= right

    if op in {"eq", "ne"}:
        numeric_value = pd.to_numeric(pd.Series([value]), errors="coerce").iloc[0]
        if pd.notna(numeric_value):
            matched = numeric_series(series) == numeric_value
        else:
            matched = text == norm_text(value)
        return matched if op == "eq" else ~matched

    raise ValueError(f"Unsupported operator: {op}")


def pick_table(tables: List[Dict[str, Any]], plan: Dict[str, Any]) -> Dict[str, Any] | None:
    wanted = plan.get("table")

    if wanted:
        target = norm_text(wanted)
        for table in tables:
            haystack = f"{table['file']} {table.get('sheet') or ''}"
            if target in norm_text(haystack):
                return table

    # Otherwise prefer the table that actually holds every referenced column.
    referenced = [
        f.get("column") for f in plan.get("filters") or [] if isinstance(f, dict) and f.get("column")
    ]
    referenced += as_list(plan.get("group_by"))
    referenced += as_list(plan.get("columns"))
    metric = plan.get("metric") or {}
    if isinstance(metric, dict) and metric.get("column"):
        referenced.append(metric["column"])

    best: Tuple[Dict[str, Any], int] | None = None

    for table in tables:
        columns = table["data"].columns
        hits = sum(1 for name in referenced if resolve_column(columns, name))
        score = hits * 1000 + len(table["data"])
        if referenced and hits == 0:
            continue
        if best is None or score > best[1]:
            best = (table, score)

    if best:
        return best[0]

    return tables[0] if tables else None


def aggregate(df: pd.DataFrame, group_cols: List[str], metric: Dict[str, Any]) -> pd.DataFrame:
    op = norm_text(metric.get("op") or "count") or "count"
    column = metric.get("column")

    # Otherwise a stray non-breaking space becomes its own category.
    df = df.copy()
    for group_column in group_cols:
        df[group_column] = df[group_column].mask(blank_mask(df[group_column]), other=None)

    if op in {"count", "row_count"} or not column:
        result = df.groupby(group_cols, dropna=False).size().reset_index(name="value")
        result.attrs["measure"] = "row count"
        return result

    target = numeric_series(df[column])
    working = df.assign(__value=target)

    if op in {"sum", "total"}:
        result = working.groupby(group_cols, dropna=False)["__value"].sum().reset_index(name="value")
    elif op in {"avg", "average", "mean"}:
        result = working.groupby(group_cols, dropna=False)["__value"].mean().round(3).reset_index(name="value")
    elif op == "min":
        result = working.groupby(group_cols, dropna=False)["__value"].min().reset_index(name="value")
    elif op == "max":
        result = working.groupby(group_cols, dropna=False)["__value"].max().reset_index(name="value")
    elif op in {"distinct_count", "nunique"}:
        result = df.groupby(group_cols, dropna=False)[column].nunique().reset_index(name="value")
    else:
        raise ValueError(f"Unsupported metric op: {op}")

    result.attrs["measure"] = f"{op} of {column}"
    return result


def scalar_metric(df: pd.DataFrame, metric: Dict[str, Any]) -> Dict[str, Any]:
    op = norm_text(metric.get("op") or "count") or "count"
    column = metric.get("column")

    if op in {"count", "row_count"} or not column:
        return {"measure": "row count", "value": int(len(df))}

    values = numeric_series(df[column]).dropna()

    if op in {"distinct_count", "nunique"}:
        return {"measure": f"distinct {column}", "value": int(df[column].nunique())}
    if not len(values):
        return {"measure": f"{op} of {column}", "value": None, "note": "No numeric values available."}

    computed = {
        "sum": values.sum(),
        "total": values.sum(),
        "avg": values.mean(),
        "average": values.mean(),
        "mean": values.mean(),
        "min": values.min(),
        "max": values.max(),
    }.get(op)

    if computed is None:
        raise ValueError(f"Unsupported metric op: {op}")

    return {"measure": f"{op} of {column}", "value": round(float(computed), 3)}


def main() -> None:
    args = parse_args(extra_options=["plan", "question"])

    if not args.plan:
        error_json("No --plan was supplied.")
        return

    try:
        plan: Dict[str, Any] = json.loads(args.plan)
    except json.JSONDecodeError as exc:
        error_json(f"Query plan is not valid JSON: {exc}")
        return

    tables = [
        t for t in read_tables(args.data)
        if t.get("data") is not None and not t["data"].empty and not skip_sheet(t.get("sheet"))
    ]

    if not tables:
        error_json("No readable data tables were found.", data_folder=args.data)
        return

    table = pick_table(tables, plan)
    if table is None:
        error_json("Could not choose a table for this plan.")
        return

    df = table["data"]
    original_count = int(len(df))
    applied: List[Dict[str, Any]] = []
    per_filter_counts: List[Dict[str, Any]] = []
    working = df

    for raw in plan.get("filters") or []:
        if not isinstance(raw, dict):
            continue

        column = resolve_column(df.columns, raw.get("column"))
        if not column:
            error_json(
                f"Column '{raw.get('column')}' does not exist in the selected table.",
                table=table["file"],
                sheet=table["sheet"],
                available_columns=[str(c) for c in df.columns],
            )
            return

        op = norm_text(raw.get("op") or "eq") or "eq"
        try:
            mask = build_mask(df, column, op, raw.get("value"))
        except ValueError as exc:
            error_json(str(exc), column=column, op=op)
            return

        per_filter_counts.append({
            "column": column,
            "op": op,
            "value": raw.get("value"),
            "rows_matching_alone": int(mask.sum()),
        })
        applied.append({"column": column, "op": op, "value": raw.get("value")})
        working = working[mask.reindex(working.index, fill_value=False)]

    limit = min(int(plan.get("limit") or DEFAULT_LIMIT), MAX_LIMIT)
    metric = plan.get("metric") if isinstance(plan.get("metric"), dict) else {"op": "count"}
    group_by = [resolve_column(df.columns, name) for name in as_list(plan.get("group_by"))]
    group_by = [name for name in group_by if name]

    result: Dict[str, Any] = {
        "ok": True,
        "question": args.question,
        "table": table["file"],
        "sheet": table["sheet"],
        "row_count_before_filters": original_count,
        "row_count_after_filters": int(len(working)),
        "filters_applied": applied,
        "filter_diagnostics": per_filter_counts,
    }

    if not len(working):
        result["note"] = (
            "No rows matched. 'filter_diagnostics' shows how many rows each filter would match "
            "on its own, which identifies the filter that is too narrow."
        )
        print_json(result)
        return

    if group_by:
        try:
            grouped = aggregate(working, group_by, metric)
        except ValueError as exc:
            error_json(str(exc))
            return

        ascending = norm_text((plan.get("sort") or {}).get("direction") or "desc") == "asc"
        grouped = grouped.sort_values("value", ascending=ascending)

        result["group_by"] = group_by
        result["measure"] = grouped.attrs.get("measure", "row count")
        result["group_count"] = int(len(grouped))
        result["groups"] = records(grouped, limit)
        print_json(result)
        return

    if metric.get("op") and norm_text(metric["op"]) not in {"none", "list", "rows"}:
        try:
            result["result"] = scalar_metric(working, metric)
        except ValueError as exc:
            error_json(str(exc))
            return

    projection = [resolve_column(df.columns, name) for name in as_list(plan.get("columns"))]
    projection = [name for name in projection if name]
    listed = working[projection] if projection else working

    sort_by = resolve_column(df.columns, (plan.get("sort") or {}).get("by"))
    if sort_by and sort_by in listed.columns:
        ascending = norm_text((plan.get("sort") or {}).get("direction") or "asc") != "desc"
        listed = listed.sort_values(sort_by, ascending=ascending)

    result["returned_row_count"] = min(limit, int(len(listed)))
    result["rows"] = records(listed, limit)
    print_json(result)


if __name__ == "__main__":
    main()
