// Copyright 2024-present Aembit, Inc.
// SPDX-License-Identifier: Apache-2.0

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const TS_ROOT = path.resolve(__dirname, "..")
const REPO_ROOT = path.resolve(TS_ROOT, "..")

describe("License and Copyright Header Compliance", () => {
  it("verifies root LICENSE file exists and contains Apache 2.0 with Aembit notice", () => {
    const licensePath = path.join(REPO_ROOT, "LICENSE")
    expect(fs.existsSync(licensePath)).toBe(true)

    const content = fs.readFileSync(licensePath, "utf8")
    expect(content).toContain("Copyright 2024-present Aembit, Inc.")
    expect(content).toContain("Apache License")
    expect(content).toContain("Version 2.0, January 2004")
  })

  it("verifies root NOTICE.md exists and contains Aembit copyright", () => {
    const noticePath = path.join(REPO_ROOT, "NOTICE.md")
    expect(fs.existsSync(noticePath)).toBe(true)

    const content = fs.readFileSync(noticePath, "utf8")
    expect(content).toContain("Aembit Edge SDKs")
    expect(content).toContain("Copyright 2024-present Aembit, Inc.")
  })

  it("verifies ts/LICENSE exists for package bundling", () => {
    const tsLicensePath = path.join(TS_ROOT, "LICENSE")
    expect(fs.existsSync(tsLicensePath)).toBe(true)
  })

  it("verifies ts/package.json has Apache-2.0 license", () => {
    const pkgPath = path.join(TS_ROOT, "package.json")
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as { license?: string }
    expect(pkg.license).toBe("Apache-2.0")
  })

  it("verifies TypeScript source and test files have required copyright header", () => {
    const expectedHeader = [
      "// Copyright 2024-present Aembit, Inc.",
      "// SPDX-License-Identifier: Apache-2.0"
    ].join("\n")

    function getTsFiles(dir: string): string[] {
      const entries = fs.readdirSync(dir, { withFileTypes: true })
      const results: string[] = []
      for (const entry of entries) {
        if (["node_modules", "dist", "coverage", ".git"].includes(entry.name)) {
          continue
        }
        const fullPath = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          results.push(...getTsFiles(fullPath))
        } else if (entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) {
          results.push(fullPath)
        }
      }
      return results
    }

    const tsFiles = getTsFiles(TS_ROOT)
    expect(tsFiles.length).toBeGreaterThan(0)

    const missingHeaders: string[] = []
    for (const filePath of tsFiles) {
      const content = fs.readFileSync(filePath, "utf8")
      if (!content.startsWith(expectedHeader)) {
        missingHeaders.push(path.relative(REPO_ROOT, filePath))
      }
    }

    expect(missingHeaders).toEqual([])
  })
})
