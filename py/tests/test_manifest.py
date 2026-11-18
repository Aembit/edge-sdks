# Copyright 2024-present Aembit, Inc.
# SPDX-License-Identifier: Apache-2.0

"""Test Python package manifest metadata and cross-SDK parity."""

from __future__ import annotations

import io
import json
import subprocess
import sys
import tarfile
import tomllib
import zipfile
from pathlib import Path
from typing import Any, cast
from urllib.parse import urlparse

import pytest


def _find_repo_root() -> Path:
    current = Path(__file__).resolve().parent
    while current.parent != current:
        if (current / ".git").exists() or (current / "NOTICE.md").exists():
            return current
        current = current.parent
    return Path(__file__).resolve().parent.parent.parent


REPO_ROOT = _find_repo_root()
PYPROJECT_PATH = REPO_ROOT / "py" / "pyproject.toml"
TS_PACKAGE_JSON_PATH = REPO_ROOT / "ts" / "package.json"
VERIFY_SCRIPT_PATH = REPO_ROOT / "py" / "scripts" / "verify_package_artifact.py"

CANONICAL_KEYWORDS: list[str] = [
    "aembit",
    "ai-agents",
    "authentication",
    "aws-imds",
    "aws-sts",
    "azure-imds",
    "credentials",
    "gcp",
    "github-actions",
    "gitlab-ci",
    "iam",
    "kubernetes",
    "mcp",
    "model-context-protocol",
    "non-human-identity",
    "oauth2",
    "oidc",
    "secretless",
    "secrets-management",
    "security",
    "terraform-cloud",
    "token-management",
    "workload-identity",
    "zero-trust",
]


def _load_pyproject_project() -> dict[str, Any]:
    data = tomllib.loads(PYPROJECT_PATH.read_text(encoding="utf-8"))
    project = data["project"]
    assert isinstance(project, dict)
    return cast(dict[str, Any], project)


def _load_ts_package() -> dict[str, Any]:
    raw = json.loads(TS_PACKAGE_JSON_PATH.read_text(encoding="utf-8"))
    assert isinstance(raw, dict)
    return cast(dict[str, Any], raw)


def test_pyproject_core_metadata() -> None:
    """Verify core [project] metadata in py/pyproject.toml."""
    project = _load_pyproject_project()

    assert project["name"] == "aembit-edge-sdk"
    assert project["description"] == (
        "Official Python SDK for the Aembit Edge API: "
        "workload identity authentication and secretless credential retrieval"
    )
    assert project["authors"] == [{"name": "Aembit, Inc.", "email": "support@aembit.io"}]
    assert project["license"] == {"text": "Apache-2.0"}
    assert project["license-files"] == ["LICENSE"]


@pytest.mark.parametrize(
    ("key", "expected_url"),
    [
        ("Homepage", "https://docs.aembit.io/dev-guide/api/edge/"),
        ("Documentation", "https://docs.aembit.io/dev-guide/api/edge/"),
        ("Repository", "https://github.com/Aembit/edge-sdks"),
        ("Issues", "https://github.com/Aembit/edge-sdks/issues"),
        ("Changelog", "https://github.com/Aembit/edge-sdks/releases"),
    ],
)
def test_pyproject_project_urls(key: str, expected_url: str) -> None:
    """Verify [project.urls] entries match expected valid HTTPS URLs."""
    project = _load_pyproject_project()
    raw_urls = project["urls"]
    assert isinstance(raw_urls, dict)
    urls = cast(dict[str, str], raw_urls)

    actual_url = urls.get(key)
    assert isinstance(actual_url, str)
    assert actual_url == expected_url

    parsed = urlparse(actual_url)
    assert parsed.scheme == "https"
    assert parsed.netloc != ""


@pytest.mark.parametrize(
    "classifier",
    [
        "Development Status :: 5 - Production/Stable",
        "Intended Audience :: Developers",
        "Intended Audience :: System Administrators",
        "License :: OSI Approved :: Apache Software License",
        "Typing :: Typed",
        "Topic :: Security",
        "Topic :: Software Development :: Libraries :: Python Modules",
        "Topic :: System :: Systems Administration :: Authentication/Directory",
    ],
)
def test_pyproject_required_classifiers(classifier: str) -> None:
    """Verify required PyPI trove classifiers are present and Alpha status is absent."""
    project = _load_pyproject_project()
    raw_classifiers = project["classifiers"]
    assert isinstance(raw_classifiers, list)
    classifiers = cast(list[str], raw_classifiers)

    assert classifier in classifiers
    assert "Development Status :: 3 - Alpha" not in classifiers


def test_pyproject_keywords_canonical_and_sorted() -> None:
    """Verify [project].keywords matches the canonical 24-term sorted list without duplicates."""
    project = _load_pyproject_project()
    raw_keywords = project["keywords"]
    assert isinstance(raw_keywords, list)
    keywords = cast(list[str], raw_keywords)

    assert len(keywords) == 24
    assert keywords == CANONICAL_KEYWORDS
    assert len(set(keywords)) == len(keywords)
    assert keywords == sorted(keywords)


def test_manifest_cross_language_parity_with_ts() -> None:
    """Verify metadata parity between py/pyproject.toml and ts/package.json."""
    py_project = _load_pyproject_project()
    ts_package = _load_ts_package()

    assert py_project["keywords"] == ts_package["keywords"]

    raw_authors = py_project["authors"]
    assert isinstance(raw_authors, list)
    authors = cast(list[dict[str, str]], raw_authors)
    primary_author = authors[0]
    assert isinstance(primary_author, dict)
    assert ts_package["author"] == f"{primary_author['name']} <{primary_author['email']}>"
    assert "funding" not in ts_package

    raw_py_urls = py_project["urls"]
    assert isinstance(raw_py_urls, dict)
    py_urls = cast(dict[str, str], raw_py_urls)
    raw_ts_bugs = ts_package["bugs"]
    assert isinstance(raw_ts_bugs, dict)
    ts_bugs = cast(dict[str, str], raw_ts_bugs)

    assert py_urls["Homepage"] == ts_package["homepage"]
    assert py_urls["Documentation"] == ts_package["homepage"]
    assert py_urls["Issues"] == ts_bugs["url"]


def _build_synthetic_artifacts(
    dist_dir: Path,
    *,
    include_sdist: bool = True,
    include_sdist_license: bool = True,
    include_wheel: bool = True,
    include_wheel_license: bool = True,
    sdist_version_override: str | None = None,
    metadata_version_override: str | None = None,
    summary: str | None = None,
    author_email: str | None = None,
    keywords: str | None = None,
    project_urls: list[str] | None = None,
    classifiers: list[str] | None = None,
) -> None:
    project = _load_pyproject_project()
    project_version = cast(str, project["version"])
    sdist_version = (
        sdist_version_override if sdist_version_override is not None else project_version
    )
    metadata_version = (
        metadata_version_override if metadata_version_override is not None else project_version
    )

    if include_sdist:
        sdist_path = dist_dir / f"aembit_edge_sdk-{project_version}.tar.gz"
        with tarfile.open(sdist_path, "w:gz") as tf:
            pyproject_bytes = b"[project]\nname = 'aembit-edge-sdk'\n"
            info = tarfile.TarInfo(f"aembit_edge_sdk-{sdist_version}/pyproject.toml")
            info.size = len(pyproject_bytes)
            tf.addfile(info, io.BytesIO(pyproject_bytes))
            if include_sdist_license:
                lic_bytes = b"Apache-2.0\n"
                lic_info = tarfile.TarInfo(f"aembit_edge_sdk-{sdist_version}/LICENSE")
                lic_info.size = len(lic_bytes)
                tf.addfile(lic_info, io.BytesIO(lic_bytes))

    if include_wheel:
        wheel_path = dist_dir / f"aembit_edge_sdk-{project_version}-py3-none-any.whl"
        meta_summary = (
            summary
            if summary is not None
            else "Official Python SDK for the Aembit Edge API: "
            "workload identity authentication and secretless credential retrieval"
        )
        meta_author_email = (
            author_email if author_email is not None else '"Aembit, Inc." <support@aembit.io>'
        )
        meta_keywords = (
            keywords if keywords is not None else ",".join(cast(list[str], project["keywords"]))
        )
        meta_urls = (
            project_urls
            if project_urls is not None
            else [
                "Homepage, https://docs.aembit.io/dev-guide/api/edge/",
                "Documentation, https://docs.aembit.io/dev-guide/api/edge/",
                "Repository, https://github.com/Aembit/edge-sdks",
                "Issues, https://github.com/Aembit/edge-sdks/issues",
                "Changelog, https://github.com/Aembit/edge-sdks/releases",
            ]
        )
        meta_classifiers = (
            classifiers if classifiers is not None else cast(list[str], project["classifiers"])
        )

        lines = [
            "Metadata-Version: 2.4",
            "Name: aembit-edge-sdk",
            f"Version: {metadata_version}",
            f"Summary: {meta_summary}",
            f"Author-email: {meta_author_email}",
            f"Keywords: {meta_keywords}",
            *(f"Project-URL: {url}" for url in meta_urls),
            *(f"Classifier: {cls}" for cls in meta_classifiers),
        ]
        metadata_text = "\n".join(lines) + "\n"

        with zipfile.ZipFile(wheel_path, "w") as zf:
            zf.writestr("aembit_edge/__init__.py", "")
            zf.writestr(f"aembit_edge_sdk-{project_version}.dist-info/METADATA", metadata_text)
            if include_wheel_license:
                zf.writestr(
                    f"aembit_edge_sdk-{project_version}.dist-info/licenses/LICENSE",
                    "Apache-2.0\n",
                )


def test_verify_package_artifact_passes_on_valid_artifacts(tmp_path: Path) -> None:
    """Verify verify_package_artifact.py succeeds on valid synthetic wheel and sdist."""
    _build_synthetic_artifacts(tmp_path)
    result = subprocess.run(
        [sys.executable, str(VERIFY_SCRIPT_PATH), "--dist-dir", str(tmp_path)],
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stderr
    assert "Verified Python package artifacts" in result.stdout


@pytest.mark.parametrize(
    ("overrides", "expected_error"),
    [
        ({"include_wheel": False}, "Expected exactly 1 wheel"),
        ({"include_sdist": False}, "Expected exactly 1 sdist"),
        ({"include_wheel_license": False}, "missing LICENSE"),
        ({"include_sdist_license": False}, "missing LICENSE"),
        ({"sdist_version_override": "0.0.0-drifted"}, "missing LICENSE for expected version"),
        ({"metadata_version_override": "0.0.0-drifted"}, "Unexpected Version"),
        ({"summary": "Drifted summary"}, "Unexpected Summary"),
        ({"author_email": '"Other" <other@example.com>'}, "Unexpected Author-email"),
        ({"keywords": "aembit,mutated"}, "Expected 24 keywords"),
        (
            {"project_urls": ["Homepage, https://docs.aembit.io/dev-guide/api/edge/"]},
            "Missing expected Project-URL entries",
        ),
        (
            {
                "classifiers": [
                    "Development Status :: 3 - Alpha",
                    "Typing :: Typed",
                ]
            },
            "Missing 'Development Status :: 5 - Production/Stable' classifier",
        ),
    ],
)
def test_verify_package_artifact_fails_on_invalid_artifacts(
    tmp_path: Path,
    overrides: dict[str, Any],
    expected_error: str,
) -> None:
    """Verify verify_package_artifact.py exits non-zero when artifacts or metadata drift."""
    _build_synthetic_artifacts(tmp_path, **overrides)
    result = subprocess.run(
        [sys.executable, str(VERIFY_SCRIPT_PATH), "--dist-dir", str(tmp_path)],
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode != 0
    assert expected_error in result.stderr
