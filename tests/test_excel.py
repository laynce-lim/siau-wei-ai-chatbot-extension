"""Excel-specific coverage: multi-sheet reads, lookup-sheet skipping, and caching."""
import json
import subprocess
import sys
from pathlib import Path

import pandas as pd
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))

import common  # noqa: E402

TOOLS = Path(__file__).resolve().parents[1] / "tools"

openpyxl = pytest.importorskip("openpyxl", reason="openpyxl is required to read .xlsx")


@pytest.fixture
def workbook_folder(tmp_path: Path) -> Path:
    folder = tmp_path / "data"
    folder.mkdir()

    systems = pd.DataFrame([
        {"Host": "SC-001", "Owner": "Alice", "Config": "1S", "Hours": 100.0},
        {"Host": "SC-002", "Owner": "Bob", "Config": "2S", "Hours": 20.0},
        {"Host": "SC-003", "Owner": "Alice", "Config": "2S", "Hours": 30.0},
    ])
    contacts = pd.DataFrame([
        {"Host": "SC-001", "Contact": "alice@example.com"},
        {"Host": "SC-002", "Contact": "bob@example.com"},
    ])
    lookups = pd.DataFrame([{"Code": "1S", "Meaning": "One socket"}])
    empty = pd.DataFrame()

    with pd.ExcelWriter(folder / "platform.xlsx", engine="openpyxl") as writer:
        systems.to_excel(writer, sheet_name="Systems", index=False)
        contacts.to_excel(writer, sheet_name="Contacts", index=False)
        lookups.to_excel(writer, sheet_name="Lookup", index=False)
        empty.to_excel(writer, sheet_name="Blank", index=False)

    return folder


def run_tool(tool: str, *args: str) -> dict:
    proc = subprocess.run(
        [sys.executable, str(TOOLS / tool), *args],
        capture_output=True, text=True,
    )
    assert proc.stdout.strip(), f"{tool} produced no stdout. stderr={proc.stderr}"
    return json.loads(proc.stdout)


def test_each_sheet_becomes_a_table(workbook_folder, monkeypatch, tmp_path):
    monkeypatch.setenv("SIAU_CHAT_CACHE", str(tmp_path / "cache"))
    tables = common.read_tables(workbook_folder)
    sheets = {t["sheet"] for t in tables}

    assert {"Systems", "Contacts", "Lookup"} <= sheets
    assert "Blank" not in sheets, "empty sheets should be dropped"


def test_lookup_sheets_are_marked(workbook_folder):
    assert common.skip_sheet("Lookup") is True
    assert common.skip_sheet("Systems") is False


def test_query_selects_the_named_sheet(workbook_folder):
    result = run_tool(
        "query_data.py", "--data", str(workbook_folder), "--question", "x",
        "--plan", json.dumps({"table": "Contacts", "metric": {"op": "count"}}),
    )

    assert result["sheet"] == "Contacts"
    assert result["result"]["value"] == 2


def test_query_infers_sheet_from_referenced_columns(workbook_folder):
    result = run_tool(
        "query_data.py", "--data", str(workbook_folder), "--question", "x",
        "--plan", json.dumps({"group_by": "Config", "metric": {"op": "count"}}),
    )

    assert result["sheet"] == "Systems"
    assert {row["Config"] for row in result["groups"]} == {"1S", "2S"}


def test_lookup_sheet_is_excluded_from_queries(workbook_folder):
    result = run_tool(
        "query_data.py", "--data", str(workbook_folder), "--question", "x",
        "--plan", json.dumps({"table": "Lookup", "metric": {"op": "count"}}),
    )

    assert result["sheet"] != "Lookup"


def test_profile_covers_every_usable_sheet(workbook_folder):
    payload = run_tool("profile_data.py", "--data", str(workbook_folder))
    sheets = {t["sheet"] for t in payload["tables"]}

    assert {"Systems", "Contacts"} <= sheets
    assert payload["ok"] is True


def test_join_links_two_sheets(workbook_folder):
    payload = run_tool(
        "join_data.py", "--data", str(workbook_folder), "--question", "link hosts", "--key", "Host",
    )

    assert payload["ok"] is True
    assert payload["results"][0]["matched_key_count"] == 2


def test_excel_cache_invalidates_on_change(workbook_folder, monkeypatch, tmp_path):
    monkeypatch.setenv("SIAU_CHAT_CACHE", str(tmp_path / "cache"))

    first = {t["sheet"]: t["data"] for t in common.read_tables(workbook_folder)}
    assert len(first["Systems"]) == 3

    path = workbook_folder / "platform.xlsx"
    systems = pd.read_excel(path, sheet_name="Systems")
    systems.loc[len(systems)] = ["SC-004", "Cara", "1S", 55.0]

    with pd.ExcelWriter(path, engine="openpyxl") as writer:
        systems.to_excel(writer, sheet_name="Systems", index=False)

    second = {t["sheet"]: t["data"] for t in common.read_tables(workbook_folder)}
    assert len(second["Systems"]) == 4


def test_excel_output_is_strict_json(workbook_folder):
    proc = subprocess.run(
        [sys.executable, str(TOOLS / "profile_data.py"), "--data", str(workbook_folder)],
        capture_output=True, text=True,
    )

    assert "NaN" not in proc.stdout
    json.loads(proc.stdout)
