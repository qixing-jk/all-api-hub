import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  fetchFirstAvailableChangelogVersionSource,
  parseChangelogIndex,
  parseChangelogMarkdownVersions,
  shouldAutoOpenChangelogForUpdate,
} from "~/services/updates/changelogIndex"

vi.mock("~/utils/navigation/docsLinks", () => ({
  getDocsChangelogIndexUrl: () =>
    "https://docs.example.test/data/changelog-index.json",
  getGitHubRawChangelogIndexUrl: () =>
    "https://raw.example.test/changelog-index.json",
  getGitHubRawChangelogMarkdownUrl: () =>
    "https://raw.example.test/changelog.md",
}))

const createJsonResponse = (value: unknown, ok = true) =>
  new Response(JSON.stringify(value), {
    status: ok ? 200 : 500,
    headers: {
      "Content-Type": "application/json",
    },
  })

const createTextResponse = (value: string, ok = true) =>
  new Response(value, {
    status: ok ? 200 : 500,
    headers: {
      "Content-Type": "text/markdown",
    },
  })

const createStalledJsonResponse = () =>
  ({
    ok: true,
    json: vi.fn(() => new Promise(() => undefined)),
  }) as unknown as Response

const createStalledTextResponse = () =>
  ({
    ok: true,
    text: vi.fn(() => new Promise(() => undefined)),
  }) as unknown as Response

describe("changelogIndex", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it("parses schema version 1 changelog indexes and normalizes versions", () => {
    const result = parseChangelogIndex({
      schemaVersion: 1,
      versions: [" 3.44.0 ", "v3.43.0", "V3.42.0", "3.44.0"],
    })

    expect(result).toEqual({
      ok: true,
      versions: new Set(["3.44.0", "3.43.0", "3.42.0"]),
    })
  })

  it("rejects unsupported or invalid changelog indexes", () => {
    expect(
      parseChangelogIndex({
        schemaVersion: 2,
        versions: ["3.44.0"],
      }),
    ).toEqual({ ok: false })
    expect(
      parseChangelogIndex({
        schemaVersion: 1,
        versions: "3.44.0",
      }),
    ).toEqual({ ok: false })
    expect(
      parseChangelogIndex({
        schemaVersion: 1,
        versions: ["nightly"],
      }),
    ).toEqual({ ok: false })
  })

  it("extracts release headings from changelog markdown", () => {
    const result = parseChangelogMarkdownVersions(`
# Changelog

## 3.44.0

### Added

## v3.43.0
`)

    expect(result).toEqual({
      ok: true,
      versions: new Set(["3.44.0", "3.43.0"]),
    })
  })

  it("only extracts column-0 level-two release headings from changelog markdown", () => {
    const result = parseChangelogMarkdownVersions(`
# Changelog

 ## 9.9.9
### 8.8.8
## 3.44.0
`)

    expect(result).toEqual({
      ok: true,
      versions: new Set(["3.44.0"]),
    })
  })

  it("ignores release-like headings inside fenced code blocks", () => {
    const result = parseChangelogMarkdownVersions(`
# Changelog

\`\`\`md
## 9.9.9
\`\`\`

## 3.44.0
`)

    expect(result).toEqual({
      ok: true,
      versions: new Set(["3.44.0"]),
    })
  })

  it("rejects markdown without release headings", () => {
    expect(parseChangelogMarkdownVersions("# Changelog")).toEqual({ ok: false })
  })

  it("uses the docs index first with no-cache fetch options and an abort signal", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse({
        schemaVersion: 1,
        versions: ["3.44.0"],
      }),
    )
    vi.stubGlobal("fetch", fetchMock)

    const result = await fetchFirstAvailableChangelogVersionSource()

    expect(result).toEqual({
      ok: true,
      source: "docs-index",
      versions: new Set(["3.44.0"]),
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      "https://docs.example.test/data/changelog-index.json",
      expect.objectContaining({
        cache: "no-cache",
        signal: expect.any(AbortSignal),
      }),
    )
  })

  it("falls back to the raw index when the docs index is unavailable", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("docs unavailable"))
      .mockResolvedValueOnce(
        createJsonResponse({
          schemaVersion: 1,
          versions: ["3.43.0"],
        }),
      )
    vi.stubGlobal("fetch", fetchMock)

    const result = await fetchFirstAvailableChangelogVersionSource()

    expect(result).toEqual({
      ok: true,
      source: "raw-index",
      versions: new Set(["3.43.0"]),
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://raw.example.test/changelog-index.json",
      expect.objectContaining({
        cache: "no-cache",
        signal: expect.any(AbortSignal),
      }),
    )
  })

  it("falls back to the raw index when docs index body parsing stalls", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(createStalledJsonResponse())
      .mockResolvedValueOnce(
        createJsonResponse({
          schemaVersion: 1,
          versions: ["3.43.0"],
        }),
      )
    vi.stubGlobal("fetch", fetchMock)

    const resultPromise = fetchFirstAvailableChangelogVersionSource()

    await vi.advanceTimersByTimeAsync(2_000)

    const pending = Symbol("pending")
    const result = await Promise.race([resultPromise, Promise.resolve(pending)])

    expect(result).toEqual({
      ok: true,
      source: "raw-index",
      versions: new Set(["3.43.0"]),
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("falls back to raw markdown when both index sources are unavailable", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("docs unavailable"))
      .mockRejectedValueOnce(new Error("raw index unavailable"))
      .mockResolvedValueOnce(createTextResponse("## 3.42.0"))
    vi.stubGlobal("fetch", fetchMock)

    const result = await fetchFirstAvailableChangelogVersionSource()

    expect(result).toEqual({
      ok: true,
      source: "raw-markdown",
      versions: new Set(["3.42.0"]),
    })
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it("returns unavailable when raw markdown body parsing stalls", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("docs unavailable"))
      .mockRejectedValueOnce(new Error("raw index unavailable"))
      .mockResolvedValueOnce(createStalledTextResponse())
    vi.stubGlobal("fetch", fetchMock)

    const resultPromise = fetchFirstAvailableChangelogVersionSource()

    await vi.advanceTimersByTimeAsync(2_000)

    const pending = Symbol("pending")
    const result = await Promise.race([resultPromise, Promise.resolve(pending)])

    expect(result).toEqual({ ok: false })
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it("does not continue to raw sources when a valid docs index misses the current version", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse({
        schemaVersion: 1,
        versions: ["3.44.0"],
      }),
    )
    vi.stubGlobal("fetch", fetchMock)

    await expect(
      shouldAutoOpenChangelogForUpdate({
        currentVersion: "3.45.0",
        previousVersion: "3.44.0",
      }),
    ).resolves.toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("treats all changelog source failures as unavailable", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("docs unavailable"))
      .mockRejectedValueOnce(new Error("raw index unavailable"))
      .mockRejectedValueOnce(new Error("raw markdown unavailable"))
    vi.stubGlobal("fetch", fetchMock)

    await expect(fetchFirstAvailableChangelogVersionSource()).resolves.toEqual({
      ok: false,
    })
  })

  it("uses source membership before version direction", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse({
        schemaVersion: 1,
        versions: ["3.43.0"],
      }),
    )
    vi.stubGlobal("fetch", fetchMock)

    await expect(
      shouldAutoOpenChangelogForUpdate({
        currentVersion: "3.43.0",
        previousVersion: "3.44.0",
      }),
    ).resolves.toBe(true)
  })

  it("falls back closed for rollbacks when all sources are unavailable", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("unavailable"))
    vi.stubGlobal("fetch", fetchMock)

    await expect(
      shouldAutoOpenChangelogForUpdate({
        currentVersion: "3.43.0",
        previousVersion: "3.44.0",
      }),
    ).resolves.toBe(false)
  })

  it("falls back closed for same-version checks when all sources are unavailable", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("unavailable"))
    vi.stubGlobal("fetch", fetchMock)

    await expect(
      shouldAutoOpenChangelogForUpdate({
        currentVersion: "3.44.0",
        previousVersion: "3.44.0",
      }),
    ).resolves.toBe(false)
  })

  it("falls back open for upgrades or unknown previous versions when all sources are unavailable", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("unavailable"))
    vi.stubGlobal("fetch", fetchMock)

    await expect(
      shouldAutoOpenChangelogForUpdate({
        currentVersion: "3.45.0",
        previousVersion: "3.44.0",
      }),
    ).resolves.toBe(true)
    await expect(
      shouldAutoOpenChangelogForUpdate({
        currentVersion: "3.45.0",
      }),
    ).resolves.toBe(true)
  })
})
