"""Guards the JSON contract and column heuristics shared by every tool."""
import json
import math

import pandas as pd

import common


def test_json_safe_replaces_nan_and_infinity():
    payload = {"a": float("nan"), "b": float("inf"), "c": [float("-inf"), 1.5], "d": pd.NaT}
    cleaned = common.json_safe(payload)

    assert cleaned == {"a": None, "b": None, "c": [None, 1.5], "d": None}


def test_print_json_output_is_strictly_parseable(capsys):
    common.print_json({"value": float("nan"), "nested": [{"x": pd.NA}]})
    stdout = capsys.readouterr().out

    assert "NaN" not in stdout
    assert json.loads(stdout) == {"value": None, "nested": [{"x": None}]}


def test_detect_date_column_prefers_date_named_column(sample_frame):
    assert common.detect_date_column(sample_frame) == "Install Date"


def test_detect_date_column_returns_none_without_dates():
    frame = pd.DataFrame({"Host": ["a", "b"], "Count": [1, 2]})
    assert common.detect_date_column(frame) is None


def test_resolve_column_is_case_and_space_insensitive(sample_frame):
    assert common.resolve_column(sample_frame.columns, "install date") == "Install Date"
    assert common.resolve_column(sample_frame.columns, "  OWNER ") == "Owner"
    assert common.resolve_column(sample_frame.columns, "nope") is None


def test_resolve_freq_maps_to_pandas_2_2_aliases():
    assert common.resolve_freq(None, "monthly totals") == "ME"
    assert common.resolve_freq(None, "weekly totals") == "W"
    assert common.resolve_freq(None, "by quarter") == "QE"
    assert common.resolve_freq("y", "") == "YE"


def test_choose_group_column_prefers_column_named_in_question(sample_frame):
    assert common.choose_group_column(sample_frame, "break it down by Config") == "Config"


def test_truthy():
    assert common.truthy("true") and common.truthy("YES") and common.truthy(1)
    assert not common.truthy("false") and not common.truthy(None)


def test_read_tables_uses_cache_and_notices_changes(data_folder, monkeypatch, tmp_path):
    monkeypatch.setenv("SIAU_CHAT_CACHE", str(tmp_path / "cache"))

    first = common.read_tables(data_folder)
    assert len(first) == 1
    assert len(first[0]["data"]) == 4

    csv = data_folder / "systems.csv"
    frame = pd.read_csv(csv)
    frame.loc[len(frame)] = ["SC-005", "Cara", 2, "1S", "2025-05-05", 60.0]
    frame.to_csv(csv, index=False)

    second = common.read_tables(data_folder)
    assert len(second[0]["data"]) == 5, "cache must invalidate when the file changes"


def test_json_safe_keeps_ordinary_values():
    assert common.json_safe({"s": "x", "i": 3, "b": True, "n": None, "f": 1.25}) == {
        "s": "x", "i": 3, "b": True, "n": None, "f": 1.25
    }
    assert not math.isnan(common.json_safe(1.0))
