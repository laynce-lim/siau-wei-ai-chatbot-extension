"""Covers the query plan executor, which the model now drives directly."""
import json
import subprocess
import sys
from pathlib import Path

import pytest

TOOLS = Path(__file__).resolve().parents[1] / "tools"


def run_plan(data_folder: Path, plan: dict, question: str = "test") -> dict:
    proc = subprocess.run(
        [sys.executable, str(TOOLS / "query_data.py"),
         "--data", str(data_folder), "--question", question, "--plan", json.dumps(plan)],
        capture_output=True, text=True,
    )
    assert proc.stdout.strip(), f"no stdout. stderr={proc.stderr}"
    return json.loads(proc.stdout)


def test_count_with_numeric_filter(data_folder):
    result = run_plan(data_folder, {
        "filters": [{"column": "Hours", "op": "lt", "value": 50}],
        "metric": {"op": "count"},
    })

    assert result["ok"] is True
    assert result["row_count_after_filters"] == 2
    assert result["result"]["value"] == 2


def test_is_blank_matches_empty_and_missing(data_folder):
    result = run_plan(data_folder, {
        "filters": [{"column": "Owner", "op": "is_blank"}],
        "metric": {"op": "count"},
    })

    assert result["row_count_after_filters"] == 1


def test_group_by_ranks_descending(data_folder):
    result = run_plan(data_folder, {"group_by": "Owner", "metric": {"op": "count"}})

    assert result["measure"] == "row count"
    assert result["groups"][0]["value"] == 2
    assert result["groups"][0]["Owner"] == "Alice"


def test_average_metric(data_folder):
    result = run_plan(data_folder, {
        "filters": [{"column": "Config", "op": "eq", "value": "2S"}],
        "metric": {"op": "avg", "column": "Hours"},
    })

    assert result["result"]["value"] == pytest.approx(27.75)


def test_empty_result_reports_per_filter_diagnostics(data_folder):
    result = run_plan(data_folder, {
        "filters": [{"column": "Owner", "op": "eq", "value": "Nobody"}],
        "metric": {"op": "count"},
    })

    assert result["row_count_after_filters"] == 0
    assert result["filter_diagnostics"][0]["rows_matching_alone"] == 0
    assert "note" in result


def test_unknown_column_is_rejected_with_available_columns(data_folder):
    result = run_plan(data_folder, {"filters": [{"column": "Nonsense", "op": "eq", "value": 1}]})

    assert result["ok"] is False
    assert "Nonsense" in result["error"]
    assert "Owner" in result["available_columns"]


def test_projection_sort_and_limit(data_folder):
    result = run_plan(data_folder, {
        "metric": {"op": "none"},
        "columns": ["Host", "Hours"],
        "sort": {"by": "Hours", "direction": "desc"},
        "limit": 2,
    })

    assert result["returned_row_count"] == 2
    assert result["rows"][0]["Host"] == "SC-001"
    assert set(result["rows"][0]) == {"Host", "Hours"}


def test_between_and_in_operators(data_folder):
    between = run_plan(data_folder, {
        "filters": [{"column": "Hours", "op": "between", "value": [10, 50]}],
        "metric": {"op": "count"},
    })
    assert between["result"]["value"] == 2

    inside = run_plan(data_folder, {
        "filters": [{"column": "Priority", "op": "in", "value": [1, 3]}],
        "metric": {"op": "count"},
    })
    assert inside["result"]["value"] == 3


def test_contains_is_case_insensitive(data_folder):
    result = run_plan(data_folder, {
        "filters": [{"column": "Owner", "op": "contains", "value": "ALI"}],
        "metric": {"op": "count"},
    })

    assert result["result"]["value"] == 2


def test_output_never_contains_nan(data_folder):
    proc = subprocess.run(
        [sys.executable, str(TOOLS / "query_data.py"),
         "--data", str(data_folder), "--question", "x",
         "--plan", json.dumps({"group_by": "Owner"})],
        capture_output=True, text=True,
    )

    assert "NaN" not in proc.stdout
    json.loads(proc.stdout)


def test_invalid_plan_json_is_reported(data_folder):
    proc = subprocess.run(
        [sys.executable, str(TOOLS / "query_data.py"),
         "--data", str(data_folder), "--question", "x", "--plan", "{not json"],
        capture_output=True, text=True,
    )

    assert json.loads(proc.stdout)["ok"] is False


def test_profile_hides_values_when_asked(data_folder):
    proc = subprocess.run(
        [sys.executable, str(TOOLS / "profile_data.py"),
         "--data", str(data_folder), "--no-values", "true"],
        capture_output=True, text=True,
    )
    payload = json.loads(proc.stdout)
    columns = payload["tables"][0]["columns"]

    assert payload["values_included"] is False
    assert all("values" not in c and "example_values" not in c for c in columns)
    assert "Alice" not in proc.stdout


def test_profile_includes_values_by_default(data_folder):
    proc = subprocess.run(
        [sys.executable, str(TOOLS / "profile_data.py"), "--data", str(data_folder)],
        capture_output=True, text=True,
    )
    payload = json.loads(proc.stdout)
    owner = next(c for c in payload["tables"][0]["columns"] if c["name"] == "Owner")

    assert payload["values_included"] is True
    assert any(v["value"] == "Alice" for v in owner["values"])
