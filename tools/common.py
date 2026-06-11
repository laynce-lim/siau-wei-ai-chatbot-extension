from __future__ import annotations

import argparse
import json
import os
import re
from pathlib import Path
from typing import Any, Dict, Iterable, List, Tuple

import pandas as pd

SUPPORTED_EXTENSIONS = {".csv", ".xlsx", ".xlsm", ".xls"}


def parse_args(include_question: bool = False) -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", default="data", help="Folder containing Excel/CSV files")
    if include_question:
        parser.add_argument("--question", required=True, help="User question")
    return parser.parse_args()


def print_json(payload: Any) -> None:
    print(json.dumps(payload, indent=2, default=str))


def error_json(message: str, **extra: Any) -> None:
    print_json({"ok": False, "error": message, **extra})


def list_data_files(data_folder: str | Path) -> List[Path]:
    root = Path(data_folder)
    if not root.exists():
        return []
    return sorted([p for p in root.rglob("*") if p.is_file() and p.suffix.lower() in SUPPORTED_EXTENSIONS])


def read_tables(data_folder: str | Path) -> List[Dict[str, Any]]:
    tables: List[Dict[str, Any]] = []
    for file_path in list_data_files(data_folder):
        try:
            if file_path.suffix.lower() == ".csv":
                df = pd.read_csv(file_path)
                tables.append({"file": str(file_path), "sheet": "CSV", "data": normalize_columns(df)})
            else:
                excel = pd.ExcelFile(file_path)
                for sheet in excel.sheet_names:
                    df = pd.read_excel(file_path, sheet_name=sheet)
                    if not df.empty:
                        tables.append({"file": str(file_path), "sheet": sheet, "data": normalize_columns(df)})
        except Exception as exc:  # keep going if one file is bad
            tables.append({"file": str(file_path), "sheet": None, "error": str(exc), "data": pd.DataFrame()})
    return tables


def normalize_columns(df: pd.DataFrame) -> pd.DataFrame:
    clean = df.copy()
    clean.columns = [str(c).strip() for c in clean.columns]
    return clean


def norm_text(value: Any) -> str:
    if pd.isna(value):
        return ""
    return re.sub(r"\s+", " ", str(value).strip().lower())


def extract_terms(question: str) -> List[str]:
    raw_terms = re.findall(r"[A-Za-z0-9_\-]+", question.lower())
    stop = {
        "what", "which", "who", "where", "when", "why", "how", "is", "are", "the", "a", "an",
        "of", "for", "to", "in", "on", "by", "with", "and", "or", "has", "have", "most", "least",
        "many", "much", "all", "me", "show", "find", "give", "tell", "about", "status"
    }
    terms = [t for t in raw_terms if t not in stop and len(t) > 1]
    # keep obvious IDs/numbers even if short
    terms += re.findall(r"\b\d+\b", question)
    return sorted(set(terms), key=len, reverse=True)


def find_column(columns: Iterable[str], candidates: Iterable[str]) -> str | None:
    normalized = [(col, norm_text(col)) for col in columns]
    # Exact matches first.
    for candidate in candidates:
        c = norm_text(candidate)
        for original, n in normalized:
            if n == c:
                return original
    # Then allow candidate phrase inside a longer column name.
    # Avoid matching a generic column like "Project" to the candidate "Project Manager".
    for candidate in candidates:
        c = norm_text(candidate)
        for original, n in normalized:
            if len(c) >= 3 and c in n:
                return original
    return None


def likely_pm_column(columns: Iterable[str]) -> str | None:
    return find_column(columns, ["pm", "project manager", "program manager", "owner", "responsible", "assignee"])


def likely_status_column(columns: Iterable[str]) -> str | None:
    return find_column(columns, ["status", "state", "current status", "order status"])


def likely_reason_column(columns: Iterable[str]) -> str | None:
    return find_column(columns, ["reason", "delay reason", "issue", "blocker", "notes", "comment", "comments"])


def likely_id_column(columns: Iterable[str]) -> str | None:
    return find_column(columns, ["order id", "order", "id", "po", "purchase order", "project id", "ticket"])


def is_delay_value(value: Any) -> bool:
    text = norm_text(value)
    return any(term in text for term in ["delay", "late", "past due", "behind", "blocked", "at risk"])


def dataframe_preview(df: pd.DataFrame, rows: int = 5) -> List[Dict[str, Any]]:
    return df.head(rows).where(pd.notnull(df), None).to_dict(orient="records")


def clean_row_dict(row: pd.Series) -> Dict[str, Any]:
    return {str(k): (None if pd.isna(v) else v) for k, v in row.to_dict().items()}
