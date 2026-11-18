# Copyright 2024-present Aembit, Inc.
# SPDX-License-Identifier: Apache-2.0

"""Verify license files and package metadata inside built Python artifacts."""

from __future__ import annotations

import argparse
import re
import sys
import tarfile
import tomllib
import zipfile
from email.parser import BytesParser
from pathlib import Path
from typing import Any, cast

PY_ROOT = Path(__file__).resolve().parent.parent
EXPECTED_SUMMARY = (
    "Official Python SDK for the Aembit Edge API: "
    "workload identity authentication and secretless credential retrieval"
)
EXPECTED_AUTHOR_EMAIL = '"Aembit, Inc." <support@aembit.io>'
EXPECTED_PROJECT_URLS: set[str] = {
    "Homepage, https://docs.aembit.io/dev-guide/api/edge/",
    "Documentation, https://docs.aembit.io/dev-guide/api/edge/",
    "Repository, https://github.com/Aembit/edge-sdks",
    "Issues, https://github.com/Aembit/edge-sdks/issues",
    "Changelog, https://github.com/Aembit/edge-sdks/releases",
}
SDIST_LICENSE_PATTERN = re.compile(r"^aembit_edge_sdk-[0-9A-Za-z.+-]+/LICENSE$")
WHEEL_LICENSE_PATTERN = re.compile(r"\.dist-info/(licenses/)?LICENSE$")


def _load_pyproject() -> dict[str, Any]:
    pyproject_path = PY_ROOT / "pyproject.toml"
    data = tomllib.loads(pyproject_path.read_text(encoding="utf-8"))
    project = data.get("project")
    if not isinstance(project, dict):
        raise AssertionError("py/pyproject.toml is missing [project] table")
    return cast(dict[str, Any], project)


def _verify_sdist(dist_dir: Path) -> Path:
    sdists = sorted(dist_dir.glob("*.tar.gz"))
    if len(sdists) != 1:
        raise AssertionError(
            f"Expected exactly 1 sdist (*.tar.gz) in {dist_dir}, found {len(sdists)}: "
            f"{[p.name for p in sdists]}"
        )
    sdist_path = sdists[0]
    with tarfile.open(sdist_path, "r:gz") as tf:
        members = [member.name for member in tf.getmembers()]
    if not any(SDIST_LICENSE_PATTERN.match(name) for name in members):
        raise AssertionError(
            f"sdist {sdist_path.name} is missing LICENSE matching {SDIST_LICENSE_PATTERN.pattern}"
        )
    return sdist_path


def _verify_wheel(dist_dir: Path, pyproject_project: dict[str, Any]) -> Path:
    wheels = sorted(dist_dir.glob("*.whl"))
    if len(wheels) != 1:
        raise AssertionError(
            f"Expected exactly 1 wheel (*.whl) in {dist_dir}, found {len(wheels)}: "
            f"{[p.name for p in wheels]}"
        )
    wheel_path = wheels[0]

    with zipfile.ZipFile(wheel_path) as zf:
        namelist = zf.namelist()
        if not any(WHEEL_LICENSE_PATTERN.search(name) for name in namelist):
            raise AssertionError(
                f"wheel {wheel_path.name} is missing LICENSE matching "
                f"{WHEEL_LICENSE_PATTERN.pattern}"
            )

        meta_names = [name for name in namelist if name.endswith(".dist-info/METADATA")]
        if len(meta_names) != 1:
            raise AssertionError(
                f"Expected exactly 1 .dist-info/METADATA in {wheel_path.name}, found {meta_names}"
            )
        msg = BytesParser().parsebytes(zf.read(meta_names[0]))

    summary = msg["Summary"]
    if summary != EXPECTED_SUMMARY:
        raise AssertionError(f"Unexpected Summary: {summary!r} != {EXPECTED_SUMMARY!r}")

    author_email = msg["Author-email"]
    if author_email != EXPECTED_AUTHOR_EMAIL:
        raise AssertionError(
            f"Unexpected Author-email: {author_email!r} != {EXPECTED_AUTHOR_EMAIL!r}"
        )

    expected_keywords = cast(list[str], pyproject_project["keywords"])
    raw_keywords = msg["Keywords"] or ""
    keywords = [kw for kw in raw_keywords.split(",") if kw]
    if len(keywords) != 24:
        raise AssertionError(f"Expected 24 keywords, got {len(keywords)}: {keywords}")
    if "workload-identity" not in keywords or "model-context-protocol" not in keywords:
        raise AssertionError(f"Missing required keywords in {keywords}")
    if keywords != expected_keywords or raw_keywords != ",".join(expected_keywords):
        raise AssertionError(
            f"Wheel keywords {raw_keywords!r} do not match pyproject.toml keywords "
            f"{','.join(expected_keywords)!r}"
        )

    project_urls = set(msg.get_all("Project-URL") or [])
    if not EXPECTED_PROJECT_URLS.issubset(project_urls):
        missing_urls = sorted(EXPECTED_PROJECT_URLS - project_urls)
        raise AssertionError(f"Missing expected Project-URL entries: {missing_urls}")

    classifiers = set(msg.get_all("Classifier") or [])
    expected_classifiers = set(cast(list[str], pyproject_project["classifiers"]))
    if "Development Status :: 5 - Production/Stable" not in classifiers:
        raise AssertionError("Missing 'Development Status :: 5 - Production/Stable' classifier")
    if "Typing :: Typed" not in classifiers:
        raise AssertionError("Missing 'Typing :: Typed' classifier")
    if "Development Status :: 3 - Alpha" in classifiers:
        raise AssertionError("Found disallowed 'Development Status :: 3 - Alpha' classifier")
    if classifiers != expected_classifiers:
        raise AssertionError(
            f"Wheel classifiers {sorted(classifiers)} do not match pyproject.toml "
            f"{sorted(expected_classifiers)}"
        )

    return wheel_path


def verify_artifacts(dist_dir: Path) -> tuple[Path, Path]:
    """Verify both sdist and wheel artifacts in ``dist_dir``."""
    if not dist_dir.is_dir():
        raise AssertionError(f"Dist directory does not exist: {dist_dir}")
    pyproject_project = _load_pyproject()
    sdist_path = _verify_sdist(dist_dir)
    wheel_path = _verify_wheel(dist_dir, pyproject_project)
    return sdist_path, wheel_path


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Verify license files and metadata in built Python package artifacts."
    )
    parser.add_argument(
        "--dist-dir",
        type=Path,
        default=PY_ROOT / "dist",
        help="Directory containing built .whl and .tar.gz artifacts (default: py/dist).",
    )
    args = parser.parse_args(argv)

    try:
        sdist_path, wheel_path = verify_artifacts(args.dist_dir.resolve())
    except AssertionError as exc:
        print(f"Verification failed: {exc}", file=sys.stderr)
        return 1

    print(
        f"Verified Python package artifacts {wheel_path.name} and {sdist_path.name} "
        "(license, keywords, URLs, and classifiers)."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
