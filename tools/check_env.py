"""Reports whether this interpreter can run the data tools.

Deliberately imports nothing at module level so it still works when the
dependencies are missing, which is exactly when it is needed.
"""
from __future__ import annotations

import importlib
import json
import platform
import sys

# import name -> pip name
REQUIRED = {
    "pandas": "pandas",
    "openpyxl": "openpyxl",
    "dateutil": "python-dateutil",
    "matplotlib": "matplotlib",
}

OPTIONAL_NOTES = {
    "matplotlib": "Only needed for chart questions.",
}


def check(module_name: str) -> dict:
    try:
        module = importlib.import_module(module_name)
    except Exception as exc:
        return {"installed": False, "error": str(exc)}

    return {"installed": True, "version": getattr(module, "__version__", "unknown")}


def main() -> None:
    packages = {name: check(name) for name in REQUIRED}
    missing = [REQUIRED[name] for name, info in packages.items() if not info["installed"]]

    report = {
        "ok": not missing,
        "python_version": platform.python_version(),
        "executable": sys.executable,
        "platform": platform.platform(),
        "packages": {
            name: {**info, **({"note": OPTIONAL_NOTES[name]} if name in OPTIONAL_NOTES else {})}
            for name, info in packages.items()
        },
        "missing": missing,
    }

    if missing:
        report["install_command"] = f"{sys.executable} -m pip install " + " ".join(missing)

    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
