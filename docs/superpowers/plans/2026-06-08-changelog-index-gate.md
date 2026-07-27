# Changelog Index Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate a docs-site changelog version index and use it to decide whether extension updates should auto-open the update-log dialog.

**Architecture:** The docs package owns the published machine-readable index at `/data/changelog-index.json`, generated from `docs/docs/changelog.md` into `docs/docs/.vuepress/public/data/changelog-index.json`. The extension adds a small updates-domain client and decision helper; it tries the published docs index first, then the GitHub raw generated index, then the GitHub raw changelog markdown. The first available parsed source is authoritative, and version-direction fallback is used only when all changelog version sources are unavailable or invalid.

**Tech Stack:** Node.js ESM scripts, VuePress public assets, TypeScript, WXT WebExtension runtime wrappers, Vitest, existing `pnpm run validate:staged` and `pnpm run validate:push` gates.

---

## File Structure

- Create `docs/scripts/changelog-index.mjs`
  - Pure docs-side functions: normalize version strings, extract changelog versions from markdown, build index payload, read/write generated JSON, and CLI entrypoint.
- Create `docs/scripts/changelog-index.test.mjs`
  - Node built-in test coverage for extraction, normalization, generated JSON shape, and stale-file check behavior.
- Modify `docs/package.json`
  - Add `docs:generate-changelog-index`, `docs:check-changelog-index`, and wire generation/checking into `docs:build` and `docs:check`.
- Generate `docs/docs/.vuepress/public/data/changelog-index.json`
  - Committed generated artifact published by VuePress as `/data/changelog-index.json`.
- Create `src/services/updates/versionComparison.ts`
  - Shared semver-like dotted version normalization and comparison helper for update gate tests and future reuse.
- Create `src/services/updates/changelogIndex.ts`
  - Extension-side constants, index parser, markdown heading parser, ordered bounded fetch client, and auto-open decision helper.
- Modify `src/utils/navigation/docsLinks.ts`
  - Add changelog source URL helpers for the docs static data URL, GitHub raw generated index, and GitHub raw changelog markdown.
- Modify `src/entrypoints/background/index.ts`
  - Use `shouldAutoOpenChangelogForUpdate()` before `changelogOnUpdateState.setPendingVersion()`.
- Create `tests/services/updates/versionComparison.test.ts`
  - Focused tests for version normalization/comparison.
- Create `tests/services/updates/changelogIndex.test.ts`
  - Focused tests for parser, fetch failure behavior, and decision table.
- Modify `tests/entrypoints/background/changelogOnUpdate.test.ts`
  - Mock the new decision helper and add `previousVersion` coverage.

## Task 1: Docs Changelog Index Generator

**Files:**

- Create: `docs/scripts/changelog-index.mjs`
- Create: `docs/scripts/changelog-index.test.mjs`
- Modify: `docs/package.json`
- Generate: `docs/docs/.vuepress/public/data/changelog-index.json`

- [ ] **Step 1: Write failing Node tests for docs index generation**

Create `docs/scripts/changelog-index.test.mjs`:

```js
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"

import {
  buildChangelogIndex,
  extractChangelogVersions,
  normalizeVersion,
  writeChangelogIndex,
} from "./changelog-index.mjs"

test("normalizeVersion accepts dotted versions with optional v prefix", () => {
  assert.equal(normalizeVersion(" 3.44.0 "), "3.44.0")
  assert.equal(normalizeVersion("v3.44.0"), "3.44.0")
  assert.equal(normalizeVersion("V3.44.1"), "3.44.1")
})

test("normalizeVersion rejects non-release headings", () => {
  assert.equal(normalizeVersion("nightly"), null)
  assert.equal(normalizeVersion("3.44.0-beta.1"), null)
  assert.equal(normalizeVersion("3.x"), null)
  assert.equal(normalizeVersion(""), null)
})

test("extractChangelogVersions reads second-level version headings only", () => {
  const markdown = [
    "# 更新日志",
    "",
    "## 3.44.0",
    "",
    "### 修复",
    "",
    "## v3.43.0",
    "",
    "## 不是版本",
    "",
    "### 3.42.0",
    "",
    "```",
    "## 9.9.9",
    "```",
  ].join("\n")

  assert.deepEqual(extractChangelogVersions(markdown), ["3.44.0", "3.43.0"])
})

test("buildChangelogIndex returns schema version 1 with unique versions", () => {
  const index = buildChangelogIndex("## 3.44.0\n\n## v3.44.0\n\n## 3.43.0\n")

  assert.deepEqual(index, {
    schemaVersion: 1,
    versions: ["3.44.0", "3.43.0"],
  })
})

test("writeChangelogIndex writes stable formatted JSON", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aah-changelog-index-"))
  const outputPath = path.join(tempDir, "data", "changelog-index.json")

  writeChangelogIndex({
    changelogPath: path.join(tempDir, "missing.md"),
    outputPath,
    markdown: "## 3.44.0\n\n## 3.43.0\n",
  })

  assert.equal(
    fs.readFileSync(outputPath, "utf8"),
    '{\n  "schemaVersion": 1,\n  "versions": [\n    "3.44.0",\n    "3.43.0"\n  ]\n}\n',
  )
})
```

- [ ] **Step 2: Run the failing docs script tests**

Run from repo root:

```bash
node --test docs/scripts/changelog-index.test.mjs
```

Expected: FAIL with an import/module-not-found error for `docs/scripts/changelog-index.mjs`.

- [ ] **Step 3: Implement the docs index generator**

Create `docs/scripts/changelog-index.mjs`:

```js
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

export const CHANGELOG_INDEX_SCHEMA_VERSION = 1

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const docsPackageRoot = path.resolve(scriptDir, "..")
const defaultChangelogPath = path.join(docsPackageRoot, "docs", "changelog.md")
const defaultOutputPath = path.join(
  docsPackageRoot,
  "docs",
  ".vuepress",
  "public",
  "data",
  "changelog-index.json",
)

export function normalizeVersion(value) {
  if (typeof value !== "string") return null

  const normalized = value.trim().replace(/^v/i, "")
  if (!/^\d+(?:\.\d+)*$/.test(normalized)) return null

  return normalized
}

export function extractChangelogVersions(markdown) {
  const versions = []
  const seen = new Set()
  let inFence = false

  for (const line of markdown.split(/\r?\n/)) {
    if (/^```/.test(line.trim())) {
      inFence = !inFence
      continue
    }

    if (inFence) continue

    const match = line.match(/^##\s+(.+?)\s*$/)
    if (!match) continue

    const firstToken = match[1].trim().split(/\s+/)[0]
    const version = normalizeVersion(firstToken)
    if (!version || seen.has(version)) continue

    seen.add(version)
    versions.push(version)
  }

  return versions
}

export function buildChangelogIndex(markdown) {
  return {
    schemaVersion: CHANGELOG_INDEX_SCHEMA_VERSION,
    versions: extractChangelogVersions(markdown),
  }
}

export function writeChangelogIndex({
  changelogPath = defaultChangelogPath,
  outputPath = defaultOutputPath,
  markdown,
} = {}) {
  const source =
    typeof markdown === "string"
      ? markdown
      : fs.readFileSync(changelogPath, "utf8")
  const index = buildChangelogIndex(source)
  const json = `${JSON.stringify(index, null, 2)}\n`

  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  fs.writeFileSync(outputPath, json)

  return { index, json, outputPath }
}

export function checkChangelogIndex({
  changelogPath = defaultChangelogPath,
  outputPath = defaultOutputPath,
} = {}) {
  const source = fs.readFileSync(changelogPath, "utf8")
  const expected = `${JSON.stringify(buildChangelogIndex(source), null, 2)}\n`

  const existing = fs.existsSync(outputPath)
    ? fs.readFileSync(outputPath, "utf8")
    : ""

  return existing === expected
}

function parseCliArgs(args) {
  return {
    check: args.includes("--check"),
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const options = parseCliArgs(process.argv.slice(2))
  const source = fs.readFileSync(defaultChangelogPath, "utf8")
  const expected = `${JSON.stringify(buildChangelogIndex(source), null, 2)}\n`
  const current = fs.existsSync(defaultOutputPath)
    ? fs.readFileSync(defaultOutputPath, "utf8")
    : ""

  if (options.check) {
    if (current !== expected) {
      console.error(
        "changelog-index.json is out of date. Run `pnpm run docs:generate-changelog-index` in docs/.",
      )
      process.exit(1)
    }

    console.log("changelog-index.json is up to date.")
    process.exit(0)
  }

  fs.mkdirSync(path.dirname(defaultOutputPath), { recursive: true })
  fs.writeFileSync(defaultOutputPath, expected)
  console.log(
    `Wrote ${path.relative(docsPackageRoot, defaultOutputPath).replaceAll("\\", "/")}`,
  )
}
```

- [ ] **Step 4: Run docs generator tests**

Run:

```bash
node --test docs/scripts/changelog-index.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Wire docs package scripts**

Modify `docs/package.json` scripts to:

```json
{
  "docs:dev": "pnpm run docs:generate-changelog-index && vuepress dev docs",
  "docs:clean-dev": "pnpm run docs:generate-changelog-index && vuepress dev docs --clean-cache",
  "docs:build": "pnpm run docs:generate-changelog-index && vuepress build docs",
  "docs:check-links": "node scripts/check-doc-links.mjs",
  "docs:generate-changelog-index": "node scripts/changelog-index.mjs",
  "docs:check-changelog-index": "node scripts/changelog-index.mjs --check",
  "docs:test": "node --test scripts/*.test.mjs",
  "docs:check": "pnpm run docs:test && pnpm run docs:check-links && pnpm run docs:check-changelog-index && pnpm run docs:build",
  "docs:update-package": "pnpm dlx vp-update"
}
```

- [ ] **Step 6: Generate the committed changelog index**

Run from `docs/`:

```bash
pnpm run docs:generate-changelog-index
```

Expected: creates `docs/docs/.vuepress/public/data/changelog-index.json` and logs:

```text
Wrote docs/.vuepress/public/data/changelog-index.json
```

- [ ] **Step 7: Verify docs checks**

Run from `docs/`:

```bash
pnpm run docs:test
pnpm run docs:check-changelog-index
pnpm run docs:check-links
```

Expected: all PASS.

- [ ] **Step 8: Commit docs generator slice**

Run from repo root:

```bash
git add docs/package.json docs/scripts/changelog-index.mjs docs/scripts/changelog-index.test.mjs docs/docs/.vuepress/public/data/changelog-index.json
git commit -m "feat(docs): generate changelog index"
```

Expected: commit succeeds.

## Task 2: Extension Changelog Index Decision Helpers

**Files:**

- Create: `src/services/updates/versionComparison.ts`
- Create: `src/services/updates/changelogIndex.ts`
- Modify: `src/utils/navigation/docsLinks.ts`
- Create: `tests/services/updates/versionComparison.test.ts`
- Create: `tests/services/updates/changelogIndex.test.ts`

- [ ] **Step 1: Write failing version comparison tests**

Create `tests/services/updates/versionComparison.test.ts`:

```ts
import { describe, expect, it } from "vitest"

import {
  compareDottedVersions,
  normalizeDottedVersion,
} from "~/services/updates/versionComparison"

describe("update version comparison", () => {
  it("normalizes semver-like dotted versions", () => {
    expect(normalizeDottedVersion(" 3.44.0 ")).toBe("3.44.0")
    expect(normalizeDottedVersion("v3.44.0")).toBe("3.44.0")
    expect(normalizeDottedVersion("V3.44.1")).toBe("3.44.1")
  })

  it("rejects non-dotted-release versions", () => {
    expect(normalizeDottedVersion("nightly")).toBeNull()
    expect(normalizeDottedVersion("3.44.0-beta.1")).toBeNull()
    expect(normalizeDottedVersion("")).toBeNull()
    expect(normalizeDottedVersion(undefined)).toBeNull()
  })

  it("compares dotted versions numerically", () => {
    expect(compareDottedVersions("3.44.0", "3.44.1")).toBeLessThan(0)
    expect(compareDottedVersions("3.44.1", "3.44.0")).toBeGreaterThan(0)
    expect(compareDottedVersions("3.44", "3.44.0")).toBe(0)
    expect(compareDottedVersions("3.10.0", "3.9.9")).toBeGreaterThan(0)
  })

  it("returns null when either version cannot be compared", () => {
    expect(compareDottedVersions("nightly", "3.44.0")).toBeNull()
    expect(compareDottedVersions("3.44.0", undefined)).toBeNull()
  })
})
```

- [ ] **Step 2: Run failing version comparison tests**

Run:

```bash
pnpm vitest --run tests/services/updates/versionComparison.test.ts
```

Expected: FAIL with missing module `~/services/updates/versionComparison`.

- [ ] **Step 3: Implement version comparison helper**

Create `src/services/updates/versionComparison.ts`:

```ts
export function normalizeDottedVersion(
  value: string | null | undefined,
): string | null {
  if (typeof value !== "string") {
    return null
  }

  const normalized = value.trim().replace(/^v/i, "")
  if (!/^\d+(?:\.\d+)*$/.test(normalized)) {
    return null
  }

  return normalized
}

export function compareDottedVersions(
  left: string | null | undefined,
  right: string | null | undefined,
): number | null {
  const normalizedLeft = normalizeDottedVersion(left)
  const normalizedRight = normalizeDottedVersion(right)

  if (!normalizedLeft || !normalizedRight) {
    return null
  }

  const leftParts = normalizedLeft
    .split(".")
    .map((part) => Number.parseInt(part, 10))
  const rightParts = normalizedRight
    .split(".")
    .map((part) => Number.parseInt(part, 10))
  const length = Math.max(leftParts.length, rightParts.length)

  for (let index = 0; index < length; index++) {
    const leftPart = leftParts[index] ?? 0
    const rightPart = rightParts[index] ?? 0

    if (leftPart !== rightPart) {
      return leftPart - rightPart
    }
  }

  return 0
}
```

- [ ] **Step 4: Run version comparison tests**

Run:

```bash
pnpm vitest --run tests/services/updates/versionComparison.test.ts
```

Expected: PASS.

- [ ] **Step 5: Add docs index URL helper test**

Modify `tests/utils/docsLinks.test.ts` by adding:

```ts
  it("builds changelog source URLs", () => {
    expect(getDocsChangelogIndexUrl()).toBe(
      getDocsPageUrl("data/changelog-index.json"),
    )
    expect(getGitHubRawChangelogIndexUrl()).toBe(
      "https://raw.githubusercontent.com/qixing-jk/all-api-hub/main/docs/docs/.vuepress/public/data/changelog-index.json",
    )
    expect(getGitHubRawChangelogMarkdownUrl()).toBe(
      "https://raw.githubusercontent.com/qixing-jk/all-api-hub/main/docs/docs/changelog.md",
    )
  })
```

Update the import from `~/utils/navigation/docsLinks` to include `getDocsChangelogIndexUrl`, `getGitHubRawChangelogIndexUrl`, and `getGitHubRawChangelogMarkdownUrl`.

- [ ] **Step 6: Run docs link test and observe failure**

Run:

```bash
pnpm vitest --run tests/utils/docsLinks.test.ts
```

Expected: FAIL because the changelog source URL helpers are not exported.

- [ ] **Step 7: Implement docs index URL helper**

Modify `src/utils/navigation/docsLinks.ts` after `getDocsChangelogUrl`:

```ts
export const getDocsChangelogIndexUrl = () =>
  getDocsPageUrl("data/changelog-index.json")

export const getGitHubRawChangelogIndexUrl = () =>
  "https://raw.githubusercontent.com/qixing-jk/all-api-hub/main/docs/docs/.vuepress/public/data/changelog-index.json"

export const getGitHubRawChangelogMarkdownUrl = () =>
  "https://raw.githubusercontent.com/qixing-jk/all-api-hub/main/docs/docs/changelog.md"
```

- [ ] **Step 8: Write failing changelog source helper tests**

Create `tests/services/updates/changelogIndex.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  fetchFirstAvailableChangelogVersionSource,
  parseChangelogIndex,
  parseChangelogMarkdownVersions,
  shouldAutoOpenChangelogForUpdate,
} from "~/services/updates/changelogIndex"

const fetchMock = vi.fn()

vi.mock("~/utils/navigation/docsLinks", () => ({
  getDocsChangelogIndexUrl: () =>
    "https://docs.example.test/data/changelog-index.json",
  getGitHubRawChangelogIndexUrl: () =>
    "https://raw.example.test/changelog-index.json",
  getGitHubRawChangelogMarkdownUrl: () =>
    "https://raw.example.test/changelog.md",
}))

describe("changelog index update gate", () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal("fetch", fetchMock)
    fetchMock.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.stubGlobal("fetch", originalFetch)
    vi.restoreAllMocks()
  })

  it("parses valid schema 1 indexes", () => {
    expect(
      parseChangelogIndex({
        schemaVersion: 1,
        versions: ["3.44.0", "v3.43.0", " 3.42.0 "],
      }),
    ).toEqual({
      ok: true,
      versions: new Set(["3.44.0", "3.43.0", "3.42.0"]),
    })
  })

  it("rejects unsupported or malformed indexes", () => {
    expect(parseChangelogIndex({ schemaVersion: 2, versions: ["3.44.0"] })).toEqual({
      ok: false,
    })
    expect(parseChangelogIndex({ schemaVersion: 1, versions: "3.44.0" })).toEqual({
      ok: false,
    })
    expect(parseChangelogIndex({ schemaVersion: 1, versions: ["nightly"] })).toEqual({
      ok: false,
    })
  })

  it("parses raw changelog markdown headings", () => {
    expect(
      parseChangelogMarkdownVersions(
        "# 更新日志\n\n## 3.44.0\n\n### 修复\n\n## v3.43.0\n",
      ),
    ).toEqual({
      ok: true,
      versions: new Set(["3.44.0", "3.43.0"]),
    })
  })

  it("rejects raw changelog markdown without release headings", () => {
    expect(parseChangelogMarkdownVersions("# 更新日志\n\n## 不是版本\n")).toEqual({
      ok: false,
    })
  })

  it("uses the docs index as the first available source", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ schemaVersion: 1, versions: ["3.44.0"] }),
    })

    const result = await fetchFirstAvailableChangelogVersionSource()

    expect(result).toEqual({
      ok: true,
      source: "docs-index",
      versions: new Set(["3.44.0"]),
    })
    expect(fetchMock).toHaveBeenCalledWith(
      "https://docs.example.test/data/changelog-index.json",
      expect.objectContaining({
        cache: "no-cache",
        signal: expect.any(AbortSignal),
      }),
    )
  })

  it("falls back to raw index when the docs index is unavailable", async () => {
    fetchMock.mockRejectedValueOnce(new Error("network failed"))
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ schemaVersion: 1, versions: ["3.44.0"] }),
    })

    await expect(fetchFirstAvailableChangelogVersionSource()).resolves.toEqual({
      ok: true,
      source: "raw-index",
      versions: new Set(["3.44.0"]),
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("falls back to raw markdown when both index sources are unavailable", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 503 })
    fetchMock.mockRejectedValueOnce(new Error("raw index failed"))
    fetchMock.mockResolvedValueOnce({
      ok: true,
      text: async () => "# 更新日志\n\n## 3.44.0\n",
    })

    await expect(fetchFirstAvailableChangelogVersionSource()).resolves.toEqual({
      ok: true,
      source: "raw-markdown",
      versions: new Set(["3.44.0"]),
    })
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it("does not continue to raw sources when a valid docs index is missing the current version", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ schemaVersion: 1, versions: ["3.44.0"] }),
    })

    await expect(
      shouldAutoOpenChangelogForUpdate({
        currentVersion: "3.45.0",
        previousVersion: "3.44.0",
      }),
    ).resolves.toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("treats all source failures as unavailable source", async () => {
    fetchMock.mockRejectedValueOnce(new Error("docs failed"))
    fetchMock.mockResolvedValueOnce({ ok: false, status: 503 })
    fetchMock.mockResolvedValueOnce({
      ok: true,
      text: async () => "# 更新日志\n\n## 不是版本\n",
    })

    await expect(fetchFirstAvailableChangelogVersionSource()).resolves.toEqual({
      ok: false,
    })
  })

  it("uses source membership before version direction", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ schemaVersion: 1, versions: ["3.43.0"] }),
    })

    await expect(
      shouldAutoOpenChangelogForUpdate({
        currentVersion: "3.43.0",
        previousVersion: "3.44.0",
      }),
    ).resolves.toBe(true)
  })

  it("falls back closed for rollback when all sources are unavailable", async () => {
    fetchMock.mockRejectedValueOnce(new Error("docs failed"))
    fetchMock.mockRejectedValueOnce(new Error("raw index failed"))
    fetchMock.mockRejectedValueOnce(new Error("raw markdown failed"))

    await expect(
      shouldAutoOpenChangelogForUpdate({
        currentVersion: "3.43.0",
        previousVersion: "3.44.0",
      }),
    ).resolves.toBe(false)
  })

  it("falls back open for upgrades or unknown previous version when all sources are unavailable", async () => {
    fetchMock.mockRejectedValueOnce(new Error("docs failed"))
    fetchMock.mockRejectedValueOnce(new Error("raw index failed"))
    fetchMock.mockRejectedValueOnce(new Error("raw markdown failed"))

    await expect(
      shouldAutoOpenChangelogForUpdate({
        currentVersion: "3.45.0",
        previousVersion: "3.44.0",
      }),
    ).resolves.toBe(true)

    fetchMock.mockRejectedValueOnce(new Error("docs failed"))
    fetchMock.mockRejectedValueOnce(new Error("raw index failed"))
    fetchMock.mockRejectedValueOnce(new Error("raw markdown failed"))

    await expect(
      shouldAutoOpenChangelogForUpdate({
        currentVersion: "3.45.0",
      }),
    ).resolves.toBe(true)
  })
})
```

- [ ] **Step 9: Run failing changelog source tests**

Run:

```bash
pnpm vitest --run tests/services/updates/changelogIndex.test.ts tests/utils/docsLinks.test.ts
```

Expected: FAIL because `~/services/updates/changelogIndex` does not exist.

- [ ] **Step 10: Implement changelog source client and decision helper**

Create `src/services/updates/changelogIndex.ts`:

```ts
import {
  getDocsChangelogIndexUrl,
  getGitHubRawChangelogIndexUrl,
  getGitHubRawChangelogMarkdownUrl,
} from "~/utils/navigation/docsLinks"

import {
  compareDottedVersions,
  normalizeDottedVersion,
} from "./versionComparison"

const CHANGELOG_INDEX_SCHEMA_VERSION = 1
const CHANGELOG_SOURCE_FETCH_TIMEOUT_MS = 2_000

export type ChangelogVersionSource =
  | "docs-index"
  | "raw-index"
  | "raw-markdown"

export type ChangelogIndexResult =
  | {
      ok: true
      source?: ChangelogVersionSource
      versions: Set<string>
    }
  | {
      ok: false
    }

export function parseChangelogIndex(value: unknown): ChangelogIndexResult {
  if (!value || typeof value !== "object") {
    return { ok: false }
  }

  const record = value as Record<string, unknown>
  if (record.schemaVersion !== CHANGELOG_INDEX_SCHEMA_VERSION) {
    return { ok: false }
  }

  if (!Array.isArray(record.versions)) {
    return { ok: false }
  }

  const versions = new Set<string>()
  for (const rawVersion of record.versions) {
    const version = normalizeDottedVersion(
      typeof rawVersion === "string" ? rawVersion : null,
    )

    if (!version) {
      return { ok: false }
    }

    versions.add(version)
  }

  return { ok: true, versions }
}

export function parseChangelogMarkdownVersions(
  markdown: string,
): ChangelogIndexResult {
  const versions = new Set<string>()
  let inFence = false

  for (const line of markdown.split(/\r?\n/)) {
    if (/^```/.test(line.trim())) {
      inFence = !inFence
      continue
    }

    if (inFence) continue

    const match = line.match(/^##\s+(.+?)\s*$/)
    if (!match) continue

    const version = normalizeDottedVersion(match[1].trim().split(/\s+/)[0])
    if (version) {
      versions.add(version)
    }
  }

  return versions.size > 0 ? { ok: true, versions } : { ok: false }
}

async function fetchWithTimeout(url: string): Promise<Response | null> {
  const controller = new AbortController()
  const timeoutId = globalThis.setTimeout(
    () => controller.abort(),
    CHANGELOG_SOURCE_FETCH_TIMEOUT_MS,
  )

  try {
    return await fetch(url, {
      cache: "no-cache",
      signal: controller.signal,
    })
  } catch {
    return null
  } finally {
    globalThis.clearTimeout(timeoutId)
  }
}

async function fetchIndexSource(
  source: ChangelogVersionSource,
  url: string,
): Promise<ChangelogIndexResult> {
  const response = await fetchWithTimeout(url)
  if (!response?.ok) {
    return { ok: false }
  }

  try {
    const parsed = parseChangelogIndex(await response.json())
    return parsed.ok ? { ...parsed, source } : parsed
  } catch {
    return { ok: false }
  }
}

async function fetchMarkdownSource(
  source: ChangelogVersionSource,
  url: string,
): Promise<ChangelogIndexResult> {
  const response = await fetchWithTimeout(url)
  if (!response?.ok) {
    return { ok: false }
  }

  try {
    const parsed = parseChangelogMarkdownVersions(await response.text())
    return parsed.ok ? { ...parsed, source } : parsed
  } catch {
    return { ok: false }
  }
}

export async function fetchFirstAvailableChangelogVersionSource(): Promise<ChangelogIndexResult> {
  const docsIndex = await fetchIndexSource(
    "docs-index",
    getDocsChangelogIndexUrl(),
  )
  if (docsIndex.ok) return docsIndex

  const rawIndex = await fetchIndexSource(
    "raw-index",
    getGitHubRawChangelogIndexUrl(),
  )
  if (rawIndex.ok) return rawIndex

  const rawMarkdown = await fetchMarkdownSource(
    "raw-markdown",
    getGitHubRawChangelogMarkdownUrl(),
  )
  if (rawMarkdown.ok) return rawMarkdown

  return { ok: false }
}

export async function shouldAutoOpenChangelogForUpdate(options: {
  currentVersion: string
  previousVersion?: string
}): Promise<boolean> {
  const currentVersion = normalizeDottedVersion(options.currentVersion)
  if (!currentVersion) {
    return false
  }

  const source = await fetchFirstAvailableChangelogVersionSource()
  if (source.ok) {
    return source.versions.has(currentVersion)
  }

  const comparison = compareDottedVersions(
    options.previousVersion,
    currentVersion,
  )

  if (comparison !== null && comparison >= 0) {
    return false
  }

  return true
}
```

External fetch constraints: `fetchWithTimeout` requests only the fixed docs and
GitHub raw changelog URLs exposed by the docs-link helpers, so no user-entered
URL is fetched. Extension CSP/CORS must allow those fixed origins; when a source
is blocked, times out, returns non-OK, or cannot be parsed, `fetchWithTimeout`
returns `null` and the client falls through to the next source or the final
version-direction fallback. `CHANGELOG_SOURCE_FETCH_TIMEOUT_MS` stays at 2,000ms
to cap update-flow latency and limit abuse from slow external responses; raising
it would let release-day fetch spikes or hostile network conditions hold the
update UI open longer. The first implementation intentionally uses no retry loop
or backoff, so each update checks each source at most once and surfaces no hard
user error for transient network failure.

- [ ] **Step 11: Run helper tests**

Run:

```bash
pnpm vitest --run tests/services/updates/versionComparison.test.ts tests/services/updates/changelogIndex.test.ts tests/utils/docsLinks.test.ts
```

Expected: PASS.

- [ ] **Step 12: Commit extension helper slice**

Run:

```bash
git add src/services/updates/versionComparison.ts src/services/updates/changelogIndex.ts src/utils/navigation/docsLinks.ts tests/services/updates/versionComparison.test.ts tests/services/updates/changelogIndex.test.ts tests/utils/docsLinks.test.ts
git commit -m "feat(updates): add changelog source gate helper"
```

Expected: commit succeeds.

## Task 3: Background Update Flow Integration

**Files:**

- Modify: `src/entrypoints/background/index.ts`
- Modify: `tests/entrypoints/background/changelogOnUpdate.test.ts`

- [ ] **Step 1: Update background test mocks for the gate helper**

In `tests/entrypoints/background/changelogOnUpdate.test.ts`, change:

```ts
type InstalledListener = (details: { reason: string }) => void
```

to:

```ts
type InstalledListener = (details: {
  reason: string
  previousVersion?: string
}) => void
```

Add a mock variable near the existing mocks:

```ts
  let shouldAutoOpenChangelogForUpdateMock: ReturnType<typeof vi.fn>
```

Initialize it in `beforeEach`:

```ts
    shouldAutoOpenChangelogForUpdateMock = vi.fn().mockResolvedValue(true)
```

Add this module mock after the `changelogOnUpdateState` mock:

```ts
    vi.doMock("~/services/updates/changelogIndex", () => ({
      shouldAutoOpenChangelogForUpdate: shouldAutoOpenChangelogForUpdateMock,
    }))
```

Add `vi.doUnmock("~/services/updates/changelogIndex")` in `afterEach`.

- [ ] **Step 2: Write failing integration tests for gate behavior**

Add these tests to `tests/entrypoints/background/changelogOnUpdate.test.ts` after the existing update pending-version test:

```ts
  it("passes current and previous versions to the changelog index gate", async () => {
    await import("~/entrypoints/background/index")

    expect(onInstalledListener).toBeTypeOf("function")
    await onInstalledListener?.({
      reason: "update",
      previousVersion: "2.38.0",
    })
    await flushPromises()

    expect(shouldAutoOpenChangelogForUpdateMock).toHaveBeenCalledWith({
      currentVersion: "2.39.0",
      previousVersion: "2.38.0",
    })
    expect(setPendingVersionMock).toHaveBeenCalledWith("2.39.0")
  })

  it("skips pending-version state when the changelog index gate rejects the version", async () => {
    shouldAutoOpenChangelogForUpdateMock.mockResolvedValue(false)

    await import("~/entrypoints/background/index")

    expect(onInstalledListener).toBeTypeOf("function")
    await onInstalledListener?.({
      reason: "update",
      previousVersion: "2.40.0",
    })
    await flushPromises()

    expect(shouldAutoOpenChangelogForUpdateMock).toHaveBeenCalledWith({
      currentVersion: "2.39.0",
      previousVersion: "2.40.0",
    })
    expect(setPendingVersionMock).not.toHaveBeenCalled()
  })
```

- [ ] **Step 3: Run failing background tests**

Run:

```bash
pnpm vitest --run tests/entrypoints/background/changelogOnUpdate.test.ts
```

Expected: FAIL because the background entrypoint does not call `shouldAutoOpenChangelogForUpdate`.

- [ ] **Step 4: Integrate the gate into background update handling**

Modify `src/entrypoints/background/index.ts` imports:

```ts
import { changelogOnUpdateState } from "~/services/updates/changelogOnUpdateState"
import { shouldAutoOpenChangelogForUpdate } from "~/services/updates/changelogIndex"
```

Replace the update pending-version block:

```ts
        if (details.reason === "update") {
          const version = getExtensionVersion("")
          if (version) {
            await changelogOnUpdateState.setPendingVersion(version)
          }
        }
```

with:

```ts
        if (details.reason === "update") {
          const version = getExtensionVersion("")
          if (
            version &&
            (await shouldAutoOpenChangelogForUpdate({
              currentVersion: version,
              previousVersion: details.previousVersion,
            }))
          ) {
            await changelogOnUpdateState.setPendingVersion(version)
          }
        }
```

- [ ] **Step 5: Run focused background tests**

Run:

```bash
pnpm vitest --run tests/entrypoints/background/changelogOnUpdate.test.ts
```

Expected: PASS.

- [ ] **Step 6: Run all update-related focused tests**

Run:

```bash
pnpm vitest --run tests/services/updates/versionComparison.test.ts tests/services/updates/changelogIndex.test.ts tests/services/updates/changelogOnUpdateState.test.ts tests/entrypoints/background/changelogOnUpdate.test.ts tests/components/ChangelogOnUpdateUiOpenHandler.test.tsx tests/components/UpdateLogDialog.test.tsx tests/utils/docsLinks.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit background integration slice**

Run:

```bash
git add src/entrypoints/background/index.ts tests/entrypoints/background/changelogOnUpdate.test.ts
git commit -m "feat(updates): gate changelog auto-open by source"
```

Expected: commit succeeds.

## Task 4: Cleanup, Broad Validation, and Final Gate

**Files:**

- Inspect all task-scoped files from Tasks 1-3.

- [ ] **Step 1: Inspect final task-scoped diff**

Run:

```bash
git status --porcelain
git diff --stat HEAD~3..HEAD
git diff HEAD~3..HEAD -- docs/package.json docs/scripts/changelog-index.mjs docs/scripts/changelog-index.test.mjs docs/docs/.vuepress/public/data/changelog-index.json src/services/updates/versionComparison.ts src/services/updates/changelogIndex.ts src/utils/navigation/docsLinks.ts src/entrypoints/background/index.ts tests/services/updates/versionComparison.test.ts tests/services/updates/changelogIndex.test.ts tests/utils/docsLinks.test.ts tests/entrypoints/background/changelogOnUpdate.test.ts
```

Expected: only task-scoped files changed; no debug code, unrelated formatting, or generated artifacts outside `docs/docs/.vuepress/public/data/changelog-index.json`.

- [ ] **Step 2: Run docs validation**

Run from `docs/`:

```bash
pnpm run docs:check
```

Expected: PASS. This runs docs tests, link checks, changelog-index freshness check, and VuePress build.

- [ ] **Step 3: Run extension focused validation**

Run from repo root:

```bash
pnpm vitest --run tests/services/updates/versionComparison.test.ts tests/services/updates/changelogIndex.test.ts tests/services/updates/changelogOnUpdateState.test.ts tests/entrypoints/background/changelogOnUpdate.test.ts tests/components/ChangelogOnUpdateUiOpenHandler.test.tsx tests/components/UpdateLogDialog.test.tsx tests/utils/docsLinks.test.ts
```

Expected: PASS.

- [ ] **Step 4: Run staged validation**

If there are remaining uncommitted task-scoped files, stage only those files and run:

```bash
pnpm run validate:staged
```

Expected: PASS. If no files are staged because each task was committed, run this only after any final cleanup commit is staged.

- [ ] **Step 5: Run pre-push-equivalent validation**

Run:

```bash
pnpm run validate:push
```

Expected: PASS. This is required because the implementation touches TypeScript runtime code, tests, docs scripts, and package scripts.

- [ ] **Step 6: Final status report**

Run:

```bash
git status --porcelain
git log --oneline -4
```

Expected: worktree contains only pre-existing unrelated untracked files, and the latest commits correspond to the docs generator, helper, and background integration slices.

Report:

- commit hashes for implementation commits.
- validation commands run and pass/fail result.
- unchanged unrelated files if still present.
- E2E decision: no new E2E added because behavior is covered by deterministic unit/background tests and does not require real browser extension runtime beyond existing `onInstalled` wrapper tests.
