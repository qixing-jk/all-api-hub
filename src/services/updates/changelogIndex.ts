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

const CHANGELOG_VERSION_SOURCES = {
  DOCS_INDEX: "docs-index",
  RAW_INDEX: "raw-index",
  RAW_MARKDOWN: "raw-markdown",
} as const

type ChangelogVersionSource =
  (typeof CHANGELOG_VERSION_SOURCES)[keyof typeof CHANGELOG_VERSION_SOURCES]

type ChangelogIndexResult =
  | {
      ok: true
      source?: ChangelogVersionSource
      versions: Set<string>
    }
  | {
      ok: false
    }

/**
 * Parse a generated changelog index and return normalized release versions.
 */
export function parseChangelogIndex(value: unknown): ChangelogIndexResult {
  if (!value || typeof value !== "object") {
    return { ok: false }
  }

  const payload = value as Record<string, unknown>
  if (payload.schemaVersion !== CHANGELOG_INDEX_SCHEMA_VERSION) {
    return { ok: false }
  }

  if (!Array.isArray(payload.versions)) {
    return { ok: false }
  }

  const versions = new Set<string>()
  for (const version of payload.versions) {
    const normalizedVersion = normalizeDottedVersion(
      typeof version === "string" ? version : null,
    )

    if (!normalizedVersion) {
      return { ok: false }
    }

    versions.add(normalizedVersion)
  }

  return {
    ok: true,
    versions,
  }
}

/**
 * Extract normalized release versions from changelog markdown headings.
 */
export function parseChangelogMarkdownVersions(
  markdown: string,
): ChangelogIndexResult {
  const versions = new Set<string>()
  let isInsideFence = false

  for (const line of markdown.split(/\r?\n/)) {
    const trimmedLine = line.trim()

    if (trimmedLine.startsWith("```") || trimmedLine.startsWith("~~~")) {
      isInsideFence = !isInsideFence
      continue
    }

    if (isInsideFence || !line.startsWith("## ")) {
      continue
    }

    const [versionToken] = line.slice(3).trim().split(/\s+/)
    const normalizedVersion = normalizeDottedVersion(versionToken)

    if (normalizedVersion) {
      versions.add(normalizedVersion)
    }
  }

  if (versions.size === 0) {
    return { ok: false }
  }

  return {
    ok: true,
    versions,
  }
}

/**
 * Fetch and read a changelog source with a short timeout so update UI stays responsive.
 */
async function readSourceWithTimeout<T>(
  url: string,
  readResponse: (response: Response) => Promise<T>,
): Promise<T | null> {
  const controller = new AbortController()
  let timeoutId: ReturnType<typeof setTimeout> | undefined

  const sourcePromise = (async () => {
    const response = await fetch(url, {
      cache: "no-cache",
      signal: controller.signal,
    })

    if (!response.ok) {
      return null
    }

    return await readResponse(response)
  })().catch(() => null)

  const timeoutPromise = new Promise<null>((resolve) => {
    timeoutId = setTimeout(() => {
      controller.abort()
      resolve(null)
    }, CHANGELOG_SOURCE_FETCH_TIMEOUT_MS)
  })

  try {
    return await Promise.race([sourcePromise, timeoutPromise])
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId)
    }
  }
}

/**
 * Fetch and parse a JSON changelog index from a specific source.
 */
async function fetchIndexSource(
  source: ChangelogVersionSource,
  url: string,
): Promise<ChangelogIndexResult> {
  const result = await readSourceWithTimeout(url, async (response) =>
    parseChangelogIndex(await response.json()),
  )

  if (!result?.ok) {
    return { ok: false }
  }

  return {
    ...result,
    source,
  }
}

/**
 * Fetch and parse changelog markdown from a specific source.
 */
async function fetchMarkdownSource(
  source: ChangelogVersionSource,
  url: string,
): Promise<ChangelogIndexResult> {
  const result = await readSourceWithTimeout(url, async (response) =>
    parseChangelogMarkdownVersions(await response.text()),
  )

  if (!result?.ok) {
    return { ok: false }
  }

  return {
    ...result,
    source,
  }
}

/**
 * Resolve the first valid changelog version source in authoritative order.
 */
export async function fetchFirstAvailableChangelogVersionSource(): Promise<ChangelogIndexResult> {
  const docsIndex = await fetchIndexSource(
    CHANGELOG_VERSION_SOURCES.DOCS_INDEX,
    getDocsChangelogIndexUrl(),
  )
  if (docsIndex.ok) {
    return docsIndex
  }

  const rawIndex = await fetchIndexSource(
    CHANGELOG_VERSION_SOURCES.RAW_INDEX,
    getGitHubRawChangelogIndexUrl(),
  )
  if (rawIndex.ok) {
    return rawIndex
  }

  return await fetchMarkdownSource(
    CHANGELOG_VERSION_SOURCES.RAW_MARKDOWN,
    getGitHubRawChangelogMarkdownUrl(),
  )
}

/**
 * Decide whether an update should automatically open the changelog for the current version.
 */
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

  const previousVersion = normalizeDottedVersion(options.previousVersion)
  if (!previousVersion) {
    return true
  }

  const comparison = compareDottedVersions(currentVersion, previousVersion)
  return comparison == null || comparison > 0
}
