from __future__ import annotations

from common import dataframe_preview, parse_args, print_json, read_tables


def main() -> None:
    args = parse_args()
    tables = []
    for table in read_tables(args.data):
        df = table.get("data")
        if df is None or df.empty:
            tables.append({
                "file": table.get("file"),
                "sheet": table.get("sheet"),
                "error": table.get("error") or "No rows found"
            })
            continue
        tables.append({
            "file": table["file"],
            "sheet": table["sheet"],
            "row_count": int(len(df)),
            "column_count": int(len(df.columns)),
            "columns": list(map(str, df.columns)),
            "sample_rows": dataframe_preview(df, 3)
        })
    print_json({"ok": True, "tables": tables})


if __name__ == "__main__":
    main()
