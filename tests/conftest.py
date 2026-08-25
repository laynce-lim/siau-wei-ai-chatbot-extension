import sys
from pathlib import Path

import pandas as pd
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))


@pytest.fixture
def sample_frame() -> pd.DataFrame:
    return pd.DataFrame([
        {"Host": "SC-001", "Owner": "Alice", "Priority": 1, "Config": "1S",
         "Install Date": "2025-01-15", "Hours": 120.5},
        {"Host": "SC-002", "Owner": "Bob", "Priority": 2, "Config": "2S",
         "Install Date": "2025-02-20", "Hours": 40.0},
        {"Host": "SC-003", "Owner": "", "Priority": 1, "Config": "2S",
         "Install Date": "2025-03-25", "Hours": 15.5},
        {"Host": "SC-004", "Owner": "Alice", "Priority": 3, "Config": "1S",
         "Install Date": "2025-04-30", "Hours": None},
    ])


@pytest.fixture
def data_folder(tmp_path: Path, sample_frame: pd.DataFrame) -> Path:
    folder = tmp_path / "data"
    folder.mkdir()
    sample_frame.to_csv(folder / "systems.csv", index=False)
    return folder
