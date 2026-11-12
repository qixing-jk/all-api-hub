import { delay, http, HttpResponse } from "msw"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  fetchFirstAvailableChangelogVersionSource,
  parseChangelogIndex,
  parseChangelogMarkdownVersions,
  resolveChangelogVersion,
} from "~/services/updates/changelogIndex"
import { server } from "~~/tests/msw/server"

const changelogSourceUrls = vi.hoisted(() => ({
  docsIndex: "https://docs.example.test/data/changelog-index.json",
  ghPagesIndex: "https://raw.example.test/gh-pages/changelog-index.json",
  rawMarkdown: "https://raw.example.test/changelog.md",
}))

vi.mock("~/utils/navigation/docsLinks", () => ({
  getDocsChangelogIndexUrl: () => changelogSourceUrls.docsIndex,
  getGitHubPagesRawChangelogIndexUrl: () => changelogSourceUrls.ghPagesIndex,
  getGitHubRawChangelogMarkdownUrl: () => changelogSourceUrls.rawMarkdown,
}))

const validIndex = (versions: string[]) => ({
  schemaVersion: 1,
  versions,
})

const useJsonSource = (
  url: string,
  value: Parameters<typeof HttpResponse.json>[0],
  options: { status?: number; onRequest?: (request: Request) => void } = {},
) => {
  server.use(
    http.get(url, ({ request }) => {
      options.onRequest?.(request)
      return HttpResponse.json(value, { status: options.status ?? 200 })
    }),
  )
}

const useTextSource = (url: string, value: string) => {
  server.use(
    http.get(url, () => {
      return new HttpResponse(value, {
        headers: {
          "Content-Type": "text/markdown",
        },
      })
    }),
  )
}

const useUnavailableSource = (url: string) => {
  server.use(http.get(url, () => new HttpResponse(null, { status: 503 })))
}

const useStalledSource = (url: string) => {
  server.use(
    http.get(url, async () => {
      await delay("infinite")
      return new HttpResponse(null, { status: 204 })
    }),
  )
}

describe("changelogIndex", () => {
  it("waits for the installed version even if an index includes legacy display metadata", async () => {
    useJsonSource(changelogSourceUrls.docsIndex, {
      ...validIndex(["4.10.0"]),
      displayVersions: { "4.10.1": "4.10.0" },
    })

    await expect(resolveChangelogVersion("4.10.1")).resolves.toBeNull()
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
    expect(parseChangelogIndex(null)).toEqual({ ok: false })
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

  it("ignores release-like headings inside tilde-fenced code blocks", () => {
    const result = parseChangelogMarkdownVersions(`
# Changelog

~~~md
## 9.9.9
~~~

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
    let requestCount = 0
    let capturedRequest: Request | undefined
    useJsonSource(changelogSourceUrls.docsIndex, validIndex(["3.44.0"]), {
      onRequest: (request) => {
        requestCount += 1
        capturedRequest = request
      },
    })

    const result = await fetchFirstAvailableChangelogVersionSource()

    expect(result).toEqual({
      ok: true,
      source: "docs-index",
      versions: new Set(["3.44.0"]),
    })
    expect(requestCount).toBe(1)
    expect(capturedRequest?.cache).toBe("no-cache")
    expect(capturedRequest?.signal).toBeInstanceOf(AbortSignal)
  })

  it("falls back to the gh-pages raw index when the docs index is unavailable", async () => {
    let rawIndexRequests = 0
    useUnavailableSource(changelogSourceUrls.docsIndex)
    useJsonSource(changelogSourceUrls.ghPagesIndex, validIndex(["3.43.0"]), {
      onRequest: () => {
        rawIndexRequests += 1
      },
    })

    const result = await fetchFirstAvailableChangelogVersionSource()

    expect(result).toEqual({
      ok: true,
      source: "gh-pages-index",
      versions: new Set(["3.43.0"]),
    })
    expect(rawIndexRequests).toBe(1)
  })

  it("falls back to the gh-pages raw index when docs index body parsing stalls", async () => {
    vi.useFakeTimers()
    useStalledSource(changelogSourceUrls.docsIndex)
    useJsonSource(changelogSourceUrls.ghPagesIndex, validIndex(["3.43.0"]))

    const resultPromise = fetchFirstAvailableChangelogVersionSource()

    await vi.advanceTimersByTimeAsync(2_000)

    const pending = Symbol("pending")
    const result = await Promise.race([resultPromise, Promise.resolve(pending)])

    expect(result).toEqual({
      ok: true,
      source: "gh-pages-index",
      versions: new Set(["3.43.0"]),
    })
  })

  it("falls back to raw markdown when both index sources are unavailable", async () => {
    useUnavailableSource(changelogSourceUrls.docsIndex)
    useUnavailableSource(changelogSourceUrls.ghPagesIndex)
    useTextSource(changelogSourceUrls.rawMarkdown, "## 3.42.0")

    const result = await fetchFirstAvailableChangelogVersionSource()

    expect(result).toEqual({
      ok: true,
      source: "raw-markdown",
      versions: new Set(["3.42.0"]),
    })
  })

  it("returns unavailable when raw markdown body parsing stalls", async () => {
    vi.useFakeTimers()
    useUnavailableSource(changelogSourceUrls.docsIndex)
    useUnavailableSource(changelogSourceUrls.ghPagesIndex)
    useStalledSource(changelogSourceUrls.rawMarkdown)

    const resultPromise = fetchFirstAvailableChangelogVersionSource()

    await vi.advanceTimersByTimeAsync(2_000)

    const pending = Symbol("pending")
    const result = await Promise.race([resultPromise, Promise.resolve(pending)])

    expect(result).toEqual({ ok: false })
  })

  it("keeps unpublished notes pending instead of choosing an unrelated older release", async () => {
    useJsonSource(changelogSourceUrls.docsIndex, validIndex(["4.10.0"]))
    await expect(resolveChangelogVersion("4.11.0")).resolves.toBeNull()
  })

  it("returns unavailable for invalid versions without requesting sources", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch")
    await expect(resolveChangelogVersion("nightly")).resolves.toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("does not open notes when every source is unavailable", async () => {
    useUnavailableSource(changelogSourceUrls.docsIndex)
    useUnavailableSource(changelogSourceUrls.ghPagesIndex)
    useUnavailableSource(changelogSourceUrls.rawMarkdown)
    await expect(resolveChangelogVersion("4.10.1")).resolves.toBeNull()
  })

  it("resolves exact versions for older indexes without mappings", async () => {
    useJsonSource(changelogSourceUrls.docsIndex, validIndex(["4.10.1"]))
    await expect(resolveChangelogVersion("v4.10.1")).resolves.toBe("4.10.1")
  })

  it("uses the installed-version section even if old display metadata is present", async () => {
    useJsonSource(changelogSourceUrls.docsIndex, {
      ...validIndex(["4.10.1", "4.10.0"]),
      displayVersions: { "4.10.1": "4.10.0" },
    })
    await expect(resolveChangelogVersion("4.10.1")).resolves.toBe("4.10.1")
  })
})
