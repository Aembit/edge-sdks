from pathlib import Path


def test_py_typed_marker_exists() -> None:
    marker = Path(__file__).resolve().parents[1] / "src" / "aembit_edge" / "py.typed"
    assert marker.is_file()
