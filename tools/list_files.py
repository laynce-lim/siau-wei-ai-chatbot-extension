from __future__ import annotations

from common import list_data_files, parse_args, print_json
import pandas as pd


def main() -> None:
    args = parse_args()
    files = []
    for path in list_data_files(args.data):
        item = {
            "path": str(path),
            "name": path.name,
            "extension": path.suffix.lower(),
            "size_bytes": path.stat().st_size,
            "sheets": []
        }
        if path.suffix.lower() == ".csv":
            item["sheets"] = ["CSV"]
        else:
            try:
                item["sheets"] = pd.ExcelFile(path).sheet_names
            except Exception as exc:
                item["error"] = str(exc)
        files.append(item)
    print_json({"ok": True, "data_folder": args.data, "file_count": len(files), "files": files})


if __name__ == "__main__":
    main()
