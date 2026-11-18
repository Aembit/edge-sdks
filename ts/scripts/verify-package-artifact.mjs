// Copyright 2024-present Aembit, Inc.
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tsRoot = path.resolve(__dirname, "..");

function parseArtifactDirArg(argv) {
  const dirIndex = argv.indexOf("--dir");
  if (dirIndex === -1) {
    return tsRoot;
  }
  const value = argv[dirIndex + 1];
  if (!value || value.startsWith("--")) {
    throw new Error("--dir requires a directory path argument.");
  }
  return path.resolve(value);
}

function main() {
  const artifactDir = parseArtifactDirArg(process.argv.slice(2));
  if (!fs.existsSync(artifactDir) || !fs.statSync(artifactDir).isDirectory()) {
    throw new Error(`Artifact directory does not exist: ${artifactDir}`);
  }

  const tarballs = fs
    .readdirSync(artifactDir)
    .filter((entry) => /^aembit-edge-sdk-.*\.tgz$/.test(entry))
    .sort();

  if (tarballs.length !== 1) {
    throw new Error(
      `Expected exactly 1 aembit-edge-sdk-*.tgz in ${artifactDir}, found ${tarballs.length}: ${tarballs.join(", ") || "(none)"}`,
    );
  }

  const tarballPath = path.join(artifactDir, tarballs[0]);
  const entriesOutput = execFileSync("tar", ["-ztf", tarballPath], {
    encoding: "utf8",
  });
  const entries = entriesOutput
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const requiredEntry of [
    "package/LICENSE",
    "package/README.md",
    "package/dist/index.d.ts",
  ]) {
    assert.ok(
      entries.includes(requiredEntry),
      `Tarball ${tarballs[0]} is missing required entry ${requiredEntry}`,
    );
  }

  const packageJsonRaw = execFileSync(
    "tar",
    ["-zxOf", tarballPath, "package/package.json"],
    { encoding: "utf8" },
  );
  const pkg = JSON.parse(packageJsonRaw);
  const sourcePkg = JSON.parse(
    fs.readFileSync(path.join(tsRoot, "package.json"), "utf8"),
  );

  assert.equal(pkg.version, sourcePkg.version);
  assert.equal(
    pkg.description,
    "Official TypeScript SDK for the Aembit Edge API: workload identity authentication and secretless credential retrieval",
  );
  assert.equal(pkg.author, "Aembit, Inc. <support@aembit.io>");
  assert.equal(pkg.homepage, "https://docs.aembit.io/dev-guide/api/edge/");
  assert.equal("funding" in pkg, false, "package.json must not contain funding");
  assert.ok(Array.isArray(pkg.keywords), "keywords must be an array");
  assert.equal(pkg.keywords.length, 24);
  assert.ok(pkg.keywords.includes("workload-identity"));
  assert.ok(pkg.keywords.includes("model-context-protocol"));
  assert.deepEqual(pkg.keywords, sourcePkg.keywords);

  console.log(
    `Verified TypeScript package artifact ${tarballs[0]} (${pkg.keywords.length} keywords, license, and metadata).`,
  );
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
