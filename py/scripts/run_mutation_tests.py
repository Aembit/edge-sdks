# Copyright 2024-present Aembit, Inc.
# SPDX-License-Identifier: Apache-2.0

"""Run selective mutmut mutation tests on changed files or entire codebase."""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path

import tomli
import tomli_w


def get_changed_files(since: str | None, repo_root: Path) -> list[str]:
    """Get list of changed python source files in src/aembit_edge/."""
    cmd = ["git", "diff", "--name-only", "--diff-filter=ACMR"]
    if since:
        cmd.append(since)
    else:
        cmd.append("origin/main")

    try:
        result = subprocess.run(cmd, cwd=repo_root, capture_output=True, text=True, check=True)
        files = result.stdout.strip().splitlines()
    except subprocess.CalledProcessError:
        # Fallback to diff against HEAD~1 or HEAD
        result = subprocess.run(
            ["git", "diff", "--name-only", "--diff-filter=ACMR", "HEAD~1"],
            cwd=repo_root,
            capture_output=True,
            text=True,
            check=False,
        )
        files = result.stdout.strip().splitlines()

    py_changed: list[str] = []
    for f in files:
        f_clean = f.strip()
        if f_clean.startswith("py/"):
            f_clean = f_clean[3:]
        if f_clean.startswith("src/aembit_edge/") and f_clean.endswith(".py"):
            py_changed.append(f_clean)

    return sorted(list(set(py_changed)))


def main() -> int:
    parser = argparse.ArgumentParser(description="Run selective mutmut mutation tests.")
    parser.add_argument(
        "--all",
        action="store_true",
        help="Run mutation tests across all source files instead of selective changes.",
    )
    parser.add_argument(
        "--since",
        type=str,
        default=None,
        help="Git revision or branch to diff against (e.g. origin/main, HEAD~1).",
    )
    parser.add_argument(
        "--files",
        nargs="*",
        default=[],
        help="Explicit list of python source files to mutate.",
    )
    parser.add_argument(
        "--threshold",
        type=float,
        default=50.0,
        help="Minimum mutation score percentage required to pass (default: 50.0).",
    )

    args = parser.parse_args()

    py_root = Path(__file__).resolve().parent.parent
    repo_root = py_root.parent
    pyproject_file = py_root / "pyproject.toml"

    target_files: list[str] = []
    if args.files:
        for f in args.files:
            f_clean = f.strip()
            if f_clean.startswith("py/"):
                f_clean = f_clean[3:]
            if f_clean.endswith(".py"):
                target_files.append(f_clean)
    elif not args.all:
        target_files = get_changed_files(args.since, repo_root)

    if not args.all and not target_files:
        print(
            "No changed Python source files detected in src/aembit_edge/. "
            "Skipping mutation testing."
        )
        return 0

    target_desc = (
        "all files"
        if args.all
        else f"{len(target_files)} target file(s): " + ", ".join(target_files)
    )
    if len(target_desc) > 80 and not args.all:
        target_desc = f"{len(target_files)} target file(s)"
    print(f"Running mutation testing on {target_desc}")

    original_pyproject_bytes = pyproject_file.read_bytes()

    try:
        if args.all:
            with pyproject_file.open("rb") as f:
                cfg = tomli.load(f)

            if "tool" in cfg and "mutmut" in cfg["tool"] and "only_mutate" in cfg["tool"]["mutmut"]:
                del cfg["tool"]["mutmut"]["only_mutate"]
                with pyproject_file.open("wb") as f:
                    tomli_w.dump(cfg, f)
        elif target_files:
            with pyproject_file.open("rb") as f:
                cfg = tomli.load(f)

            if "tool" not in cfg:
                cfg["tool"] = {}
            if "mutmut" not in cfg["tool"]:
                cfg["tool"]["mutmut"] = {}

            cfg["tool"]["mutmut"]["only_mutate"] = target_files
            with pyproject_file.open("wb") as f:
                tomli_w.dump(cfg, f)

        # Clean existing mutants cache directory for accurate run
        mutants_dir = py_root / "mutants"
        if mutants_dir.exists():
            shutil.rmtree(mutants_dir)

        # Run mutmut
        subprocess.run(["mutmut", "run"], cwd=py_root, check=False)

        # Export stats
        subprocess.run(["mutmut", "export-cicd-stats"], cwd=py_root, check=False)
        stats_file = py_root / "mutants" / "mutmut-cicd-stats.json"

        if not stats_file.is_file():
            print("Could not find mutmut CI/CD stats file.", file=sys.stderr)
            return 1

        with stats_file.open("r", encoding="utf-8") as f:
            stats = json.load(f)

        killed = stats.get("killed", 0)
        survived = stats.get("survived", 0)
        timeout = stats.get("timeout", 0)
        total_evaluated = killed + survived + timeout

        if total_evaluated == 0:
            print("No mutants were evaluated.")
            return 0

        score = (killed / total_evaluated) * 100.0
        print(
            f"\nMutation Testing Summary:\n"
            f"  Total Evaluated: {total_evaluated}\n"
            f"  Killed:          {killed}\n"
            f"  Survived:        {survived}\n"
            f"  Timeout:         {timeout}\n"
            f"  Mutation Score:  {score:.2f}% (Threshold: {args.threshold}%)\n"
        )

        if score < args.threshold:
            print(
                f"FAILED: Mutation score {score:.2f}% is below threshold {args.threshold}%.",
                file=sys.stderr,
            )
            return 1

        print(f"PASSED: Mutation score {score:.2f}% meets threshold {args.threshold}%.")
        return 0

    finally:
        pyproject_file.write_bytes(original_pyproject_bytes)


if __name__ == "__main__":
    sys.exit(main())
