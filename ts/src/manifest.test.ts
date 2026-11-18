// Copyright 2024-present Aembit, Inc.
// SPDX-License-Identifier: Apache-2.0

import { execFileSync, spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const TS_ROOT = path.resolve(__dirname, "..")
const REPO_ROOT = path.resolve(TS_ROOT, "..")
const PACKAGE_JSON_PATH = path.join(TS_ROOT, "package.json")
const PYPROJECT_TOML_PATH = path.join(REPO_ROOT, "py", "pyproject.toml")
const VERIFY_SCRIPT_PATH = path.join(TS_ROOT, "scripts", "verify-package-artifact.mjs")

interface PackageManifest {
  name?: string
  version?: string
  description?: string
  author?: string
  funding?: unknown
  homepage?: string
  bugs?: {
    url?: string
  }
  repository?: {
    type?: string
    url?: string
    directory?: string
  }
  keywords?: string[]
}

interface PyProjectAuthor {
  name: string
  email: string
}

interface PyProjectMetadata {
  authors: PyProjectAuthor[]
  keywords: string[]
  urls: Record<string, string>
}

const CANONICAL_KEYWORDS = [
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
  "zero-trust"
] as const

function stripTomlComment(line: string): string {
  let inQuotes = false
  let escaped = false
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]
    if (escaped) {
      escaped = false
      continue
    }
    if (ch === "\\" && inQuotes) {
      escaped = true
      continue
    }
    if (ch === "\"") {
      inQuotes = !inQuotes
      continue
    }
    if (ch === "#" && !inQuotes) {
      return line.slice(0, i)
    }
  }
  return line
}

function extractSectionLines(content: string, sectionName: string): string[] {
  const lines = content.split(/\r?\n/)
  const collected: string[] = []
  let inTargetSection = false

  for (const rawLine of lines) {
    const trimmed = stripTomlComment(rawLine).trim()
    if (!trimmed) {
      continue
    }
    const sectionMatch = /^\[([^\]]+)\]$/.exec(trimmed)
    if (sectionMatch) {
      inTargetSection = sectionMatch[1]?.trim() === sectionName
      continue
    }
    if (inTargetSection) {
      collected.push(trimmed)
    }
  }

  return collected
}

function parseTomlStringArray(sectionLines: string[], key: string): string[] {
  const startPattern = new RegExp(`^${key}\\s*=\\s*\\[(.*)$`)
  let collecting = false
  const bodyChunks: string[] = []

  for (const line of sectionLines) {
    if (!collecting) {
      const match = startPattern.exec(line)
      if (!match) {
        continue
      }
      collecting = true
      const rest = match[1] ?? ""
      const closeIndex = rest.indexOf("]")
      if (closeIndex !== -1) {
        bodyChunks.push(rest.slice(0, closeIndex))
        break
      }
      bodyChunks.push(rest)
    } else {
      const closeIndex = line.indexOf("]")
      if (closeIndex !== -1) {
        bodyChunks.push(line.slice(0, closeIndex))
        break
      }
      bodyChunks.push(line)
    }
  }

  const joined = bodyChunks.join("\n")
  return [...joined.matchAll(/"([^"]*)"/g)].map((match) => match[1] ?? "")
}

function parseTomlAuthors(sectionLines: string[]): PyProjectAuthor[] {
  const startPattern = /^authors\s*=\s*\[(.*)$/
  let collecting = false
  const bodyChunks: string[] = []

  for (const line of sectionLines) {
    if (!collecting) {
      const match = startPattern.exec(line)
      if (!match) {
        continue
      }
      collecting = true
      const rest = match[1] ?? ""
      const closeIndex = rest.indexOf("]")
      if (closeIndex !== -1) {
        bodyChunks.push(rest.slice(0, closeIndex))
        break
      }
      bodyChunks.push(rest)
    } else {
      const closeIndex = line.indexOf("]")
      if (closeIndex !== -1) {
        bodyChunks.push(line.slice(0, closeIndex))
        break
      }
      bodyChunks.push(line)
    }
  }

  const joined = bodyChunks.join("\n")
  const authors: PyProjectAuthor[] = []
  for (const tableMatch of joined.matchAll(/\{([^}]*)\}/g)) {
    const tableBody = tableMatch[1] ?? ""
    const nameMatch = /\bname\s*=\s*"([^"]*)"/.exec(tableBody)
    const emailMatch = /\bemail\s*=\s*"([^"]*)"/.exec(tableBody)
    if (nameMatch?.[1] && emailMatch?.[1]) {
      authors.push({
        name: nameMatch[1],
        email: emailMatch[1]
      })
    }
  }
  return authors
}

function parseTomlKeyValues(sectionLines: string[]): Record<string, string> {
  const values: Record<string, string> = {}
  for (const line of sectionLines) {
    const match = /^([A-Za-z0-9_-]+)\s*=\s*"([^"]*)"$/.exec(line)
    if (match?.[1] && match[2] !== undefined) {
      values[match[1]] = match[2]
    }
  }
  return values
}

function readPackageManifest(): PackageManifest {
  return JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, "utf8")) as PackageManifest
}

function readPyProjectMetadata(): PyProjectMetadata {
  const content = fs.readFileSync(PYPROJECT_TOML_PATH, "utf8")
  const projectLines = extractSectionLines(content, "project")
  const projectUrlLines = extractSectionLines(content, "project.urls")

  return {
    authors: parseTomlAuthors(projectLines),
    keywords: parseTomlStringArray(projectLines, "keywords"),
    urls: parseTomlKeyValues(projectUrlLines)
  }
}

describe("TypeScript Package Manifest Metadata", () => {
  const pkg = readPackageManifest()
  const pyproject = readPyProjectMetadata()

  it.each([
    ["name", pkg.name, "@aembit/edge-sdk"],
    [
      "description",
      pkg.description,
      "Official TypeScript SDK for the Aembit Edge API: workload identity authentication and secretless credential retrieval"
    ],
    ["author", pkg.author, "Aembit, Inc. <support@aembit.io>"]
  ])("verifies %s matches expected package metadata", (_field, actual, expected) => {
    expect(actual).toBe(expected)
  })

  it("omits funding metadata", () => {
    expect("funding" in pkg).toBe(false)
    expect(pkg.funding).toBeUndefined()
  })

  it.each([
    ["homepage", pkg.homepage, "https://docs.aembit.io/dev-guide/api/edge/"],
    ["bugs.url", pkg.bugs?.url, "https://github.com/Aembit/edge-sdks/issues"],
    ["repository.url", pkg.repository?.url, "git+https://github.com/Aembit/edge-sdks.git"]
  ])("verifies %s is a valid HTTPS URL matching canonical target", (_label, actual, expected) => {
    expect(actual).toBe(expected)
    const normalized = (actual ?? "").replace(/^git\+/, "")
    const parsed = new URL(normalized)
    expect(parsed.protocol).toBe("https:")
  })

  it("verifies repository type and monorepo directory", () => {
    expect(pkg.repository).toEqual({
      type: "git",
      url: "git+https://github.com/Aembit/edge-sdks.git",
      directory: "ts"
    })
  })

  it("verifies keywords match the canonical 24-term sorted list without duplicates or empty entries", () => {
    expect(pkg.keywords).toEqual([...CANONICAL_KEYWORDS])
    expect(pkg.keywords).toHaveLength(24)
    expect(pkg.keywords?.every((kw) => kw.trim().length > 0)).toBe(true)
    expect(new Set(pkg.keywords).size).toBe(pkg.keywords?.length)
    expect(pkg.keywords).toEqual([...(pkg.keywords ?? [])].sort((a, b) => a.localeCompare(b)))
  })

  describe("Cross-Language Parity with py/pyproject.toml", () => {
    it("matches py/pyproject.toml keywords 1:1 in order and content", () => {
      expect(pyproject.keywords).toHaveLength(24)
      expect(pkg.keywords).toEqual(pyproject.keywords)
    })

    it("matches py/pyproject.toml primary author name and email", () => {
      expect(pyproject.authors).toHaveLength(1)
      const [primaryAuthor] = pyproject.authors
      expect(primaryAuthor).toBeDefined()
      expect(pkg.author).toBe(`${primaryAuthor?.name} <${primaryAuthor?.email}>`)
    })

    it.each([
      ["homepage vs Homepage", pkg.homepage, pyproject.urls.Homepage],
      ["homepage vs Documentation", pkg.homepage, pyproject.urls.Documentation],
      ["bugs.url vs Issues", pkg.bugs?.url, pyproject.urls.Issues]
    ])("matches %s between package.json and py/pyproject.toml", (_label, tsValue, pyValue) => {
      expect(tsValue).toBeDefined()
      expect(pyValue).toBeDefined()
      expect(tsValue).toBe(pyValue)
    })
  })
})

function buildSyntheticTarball(
  dir: string,
  options: {
    includeLicense?: boolean
    packageOverrides?: Record<string, unknown>
    skipTarball?: boolean
  } = {}
): void {
  if (options.skipTarball) {
    return
  }
  const stageDir = path.join(dir, "stage")
  const pkgDir = path.join(stageDir, "package")
  fs.mkdirSync(pkgDir, { recursive: true })

  if (options.includeLicense !== false) {
    fs.writeFileSync(path.join(pkgDir, "LICENSE"), "Apache-2.0\n", "utf8")
  }

  const basePkg = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, "utf8")) as Record<string, unknown>
  const version = String(basePkg.version)
  const mergedPkg = {
    ...basePkg,
    ...options.packageOverrides
  }
  fs.writeFileSync(path.join(pkgDir, "package.json"), JSON.stringify(mergedPkg, null, 2), "utf8")

  const tgzPath = path.join(dir, `aembit-edge-sdk-${version}.tgz`)
  execFileSync("tar", ["-czf", tgzPath, "-C", stageDir, "package"])
  fs.rmSync(stageDir, { recursive: true, force: true })
}

describe("verify-package-artifact.mjs", () => {
  it("passes on a valid synthetic package tarball", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sdk58-ts-verify-pass-"))
    try {
      const pkg = readPackageManifest()
      buildSyntheticTarball(tmpDir)
      const result = spawnSync(
        process.execPath,
        [VERIFY_SCRIPT_PATH, "--dir", tmpDir],
        { encoding: "utf8" }
      )
      expect(result.status).toBe(0)
      expect(result.stdout).toContain(
        `Verified TypeScript package artifact aembit-edge-sdk-${String(pkg.version)}.tgz`
      )
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  it.each([
    [
      "missing tarball",
      { skipTarball: true },
      "Expected exactly 1 aembit-edge-sdk-*.tgz"
    ],
    [
      "missing package/LICENSE",
      { includeLicense: false },
      "missing required entry package/LICENSE"
    ],
    [
      "version drift",
      { packageOverrides: { version: "0.0.0-drifted" } },
      "0.0.0-drifted"
    ],
    [
      "description drift",
      { packageOverrides: { description: "Drifted description" } },
      "Official TypeScript SDK"
    ],
    [
      "homepage drift",
      { packageOverrides: { homepage: "https://example.com/wrong" } },
      "https://docs.aembit.io/dev-guide/api/edge/"
    ],
    [
      "unexpected funding field",
      { packageOverrides: { funding: "https://example.com/sponsor" } },
      "package.json must not contain funding"
    ],
    [
      "mutated keywords",
      { packageOverrides: { keywords: ["aembit", "mutated"] } },
      "24"
    ]
  ])("exits non-zero when %s", (_label, options, expectedErrSubstring) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sdk58-ts-verify-fail-"))
    try {
      buildSyntheticTarball(tmpDir, options)
      const result = spawnSync(
        process.execPath,
        [VERIFY_SCRIPT_PATH, "--dir", tmpDir],
        { encoding: "utf8" }
      )
      expect(result.status).not.toBe(0)
      expect(result.stderr).toContain(expectedErrSubstring)
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })
})
