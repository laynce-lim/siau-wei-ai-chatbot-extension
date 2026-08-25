"""Joins rows across two CSV/Excel tables on a shared key column."""
from __future__ import annotations

from typing import Any, Dict, List, Tuple

import pandas as pd

from common import (
    norm_text,
    parse_args,
    print_json,
    read_tables,
    records,
    resolve_column,
    skip_sheet,
)

MAX_SAMPLE_ROWS = 10
MAX_UNMATCHED = 10
MIN_OVERLAP = 1


def label(table: Dict[str, Any]) -> str:
    sheet = table.get("sheet")
    return f"{table['file']}::{sheet}" if sheet and sheet != "CSV" else str(table["file"])


def key_values(df: pd.DataFrame, column: str) -> set[str]:
    return {v for v in df[column].dropna().astype(str).map(norm_text) if v}


def candidate_pairs(tables: List[Dict[str, Any]]) -> List[Tuple[int, int, str, str, int]]:
    """Ranks table pairs by how many key values two columns actually share."""
    pairs: List[Tuple[int, int, str, str, int]] = []

    for i in range(len(tables)):
        for j in range(i + 1, len(tables)):
            left, right = tables[i]["data"], tables[j]["data"]

            for left_col in left.columns:
                left_values = key_values(left, left_col)
                if len(left_values) < MIN_OVERLAP:
                    continue

                for right_col in right.columns:
                    right_values = key_values(right, right_col)
                    if len(right_values) < MIN_OVERLAP:
                        continue

                    overlap = len(left_values & right_values)
                    if overlap:
                        name_bonus = 5 if norm_text(left_col) == norm_text(right_col) else 0
                        pairs.append((i, j, str(left_col), str(right_col), overlap + name_bonus))

    pairs.sort(key=lambda item: item[4], reverse=True)
    return pairs


def join_tables(
    left_table: Dict[str, Any],
    right_table: Dict[str, Any],
    left_col: str,
    right_col: str,
) -> Dict[str, Any]:
    left = left_table["data"].copy()
    right = right_table["data"].copy()

    left["__key"] = left[left_col].astype(str).map(norm_text)
    right["__key"] = right[right_col].astype(str).map(norm_text)
    left = left[left["__key"] != ""]
    right = right[right["__key"] != ""]

    merged = left.merge(right, on="__key", how="inner", suffixes=("", "_right"))

    left_keys = set(left["__key"])
    right_keys = set(right["__key"])
    matched_keys = left_keys & right_keys

    return {
        "analysis": "cross_file_join",
        "left": {"source": label(left_table), "key_column": left_col, "row_count": int(len(left))},
        "right": {"source": label(right_table), "key_column": right_col, "row_count": int(len(right))},
        "matched_key_count": len(matched_keys),
        "joined_row_count": int(len(merged)),
        "left_only_keys": sorted(left_keys - right_keys)[:MAX_UNMATCHED],
        "right_only_keys": sorted(right_keys - left_keys)[:MAX_UNMATCHED],
        "left_only_count": len(left_keys - right_keys),
        "right_only_count": len(right_keys - left_keys),
        "sample_joined_rows": records(merged.drop(columns=["__key"]), MAX_SAMPLE_ROWS),
    }


def find_table(tables: List[Dict[str, Any]], wanted: str | None) -> Dict[str, Any] | None:
    if not wanted:
        return None
    target = norm_text(wanted)
    for table in tables:
        if target in norm_text(label(table)):
            return table
    return None


def main() -> None:
    args = parse_args(include_question=True, extra_options=["left", "right", "key"])

    tables = [
        t for t in read_tables(args.data)
        if t.get("data") is not None and not t["data"].empty and not skip_sheet(t.get("sheet"))
    ]

    if len(tables) < 2:
        print_json({
            "ok": False,
            "question": args.question,
            "error": "Cross-file join needs at least two readable tables.",
            "tables_found": [label(t) for t in tables],
        })
        return

    left_table = find_table(tables, args.left)
    right_table = find_table(tables, args.right)

    if left_table is not None and right_table is not None:
        left_col = resolve_column(left_table["data"].columns, args.key)
        right_col = resolve_column(right_table["data"].columns, args.key)

        if not left_col or not right_col:
            pairs = candidate_pairs([left_table, right_table])
            if not pairs:
                print_json({
                    "ok": False,
                    "question": args.question,
                    "error": "No shared key values found between the two requested tables.",
                })
                return
            _, _, left_col, right_col, _ = pairs[0]

        print_json({
            "ok": True,
            "question": args.question,
            "results": [join_tables(left_table, right_table, left_col, right_col)],
        })
        return

    pairs = candidate_pairs(tables)

    if not pairs:
        print_json({
            "ok": False,
            "question": args.question,
            "error": "No columns share values across the available tables, so no join is possible.",
            "tables_found": [label(t) for t in tables],
        })
        return

    results = [
        join_tables(tables[i], tables[j], left_col, right_col)
        for i, j, left_col, right_col, _ in pairs[:3]
    ]

    print_json({"ok": True, "question": args.question, "results": results})


if __name__ == "__main__":
    main()
