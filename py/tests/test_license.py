# Copyright 2024-present Aembit, Inc.
# SPDX-License-Identifier: Apache-2.0

"""Test repository licensing, NOTICE, and header compliance for Python SDK."""

from __future__ import annotations

import os
from pathlib import Path


def _find_repo_root() -> Path:
    current = Path(__file__).resolve().parent
    while current.parent != current:
        if (current / ".git").exists() or (current / "NOTICE.md").exists():
            return current
        current = current.parent
    return Path(__file__).resolve().parent.parent.parent


REPO_ROOT = _find_repo_root()
PY_ROOT = REPO_ROOT / "py"


def test_root_license_exists_and_valid() -> None:
    """Verify that root LICENSE file exists and contains Apache 2.0 with Aembit notice."""
    license_file = REPO_ROOT / "LICENSE"
    assert license_file.is_file(), "Root LICENSE file must exist"

    content = license_file.read_text(encoding="utf-8")
    assert "Copyright 2024-present Aembit, Inc." in content
    assert "Apache License" in content
    assert "Version 2.0, January 2004" in content


def test_root_notice_exists_and_valid() -> None:
    """Verify that root NOTICE.md exists and contains Aembit copyright."""
    notice_file = REPO_ROOT / "NOTICE.md"
    assert notice_file.is_file(), "Root NOTICE.md file must exist"

    content = notice_file.read_text(encoding="utf-8")
    assert "Aembit Edge SDKs" in content
    assert "Copyright 2024-present Aembit, Inc." in content


def test_py_license_file_exists() -> None:
    """Verify that py/LICENSE exists for packaging."""
    py_license = PY_ROOT / "LICENSE"
    assert py_license.is_file(), "py/LICENSE file must exist"


def test_python_source_files_have_copyright_headers() -> None:
    """Verify all python source and test files have the required copyright header."""
    expected_header = "# Copyright 2024-present Aembit, Inc.\n# SPDX-License-Identifier: Apache-2.0"

    ignored_dirs = [
        ".venv",
        ".pkg-venv",
        "__pycache__",
        "dist",
        "build",
        "mutants",
        ".mutmut-cache",
    ]
    py_files: list[Path] = []
    for dirpath, _, filenames in os.walk(PY_ROOT):
        if any(ignored in dirpath for ignored in ignored_dirs):
            continue
        for filename in filenames:
            if filename.endswith(".py"):
                py_files.append(Path(dirpath) / filename)

    assert len(py_files) > 0, "Expected to find python files in py/"

    missing_headers: list[str] = []
    for file_path in py_files:
        content = file_path.read_text(encoding="utf-8")
        if not content.startswith(expected_header):
            missing_headers.append(str(file_path.relative_to(REPO_ROOT)))

    assert not missing_headers, f"Files missing copyright header: {missing_headers}"
