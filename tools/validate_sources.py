from __future__ import annotations

import argparse
import json
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--tool-result", required=False, help="Path to JSON tool output to validate")
    args = parser.parse_args()

    if not args.tool_result:
        print(json.dumps({
            "ok": True,
            "note": "Validation is normally handled by the Answer + Validation Agent. Provide --tool-result to validate a saved JSON output."
        }, indent=2))
        return

    path = Path(args.tool_result)
    data = json.loads(path.read_text(encoding="utf-8"))
    has_source = "file" in json.dumps(data).lower() and "sheet" in json.dumps(data).lower()
    print(json.dumps({"ok": True, "has_source_references": has_source}, indent=2))


if __name__ == "__main__":
    main()
