import { SITE_TYPES } from "~/constants/siteType"
import { normalizeAccountSiteUrlForDuplicateCheck } from "~/services/accounts/utils/siteUrlNormalization"
import type { SiteAccount } from "~/types"

import type {
  BookmarkAccountImportCandidate,
  BookmarkAccountImportIgnoredCounts,
  BookmarkAccountImportScanResult,
  BookmarkAccountImportScanSummary,
  NativeBookmarkTreeNode,
} from "./types"

interface BuildBookmarkAccountImportCandidatesInput {
  bookmarkTree: NativeBookmarkTreeNode[]
  existingAccounts: SiteAccount[]
}

/**
 * Creates the initial ignored-count accumulator for a bookmark scan.
 */
function createEmptyIgnoredCounts(): BookmarkAccountImportIgnoredCounts {
  return {
    folder: 0,
    malformed: 0,
    nonWeb: 0,
    repeatedOrigin: 0,
    unsupported: 0,
  }
}

/**
 * Traverses native bookmark trees in document order and returns every node.
 */
function flattenBookmarkNodes(nodes: NativeBookmarkTreeNode[]) {
  const result: NativeBookmarkTreeNode[] = []
  const visit = (node: NativeBookmarkTreeNode) => {
    result.push(node)
    for (const child of node.children ?? []) {
      visit(child)
    }
  }

  for (const node of nodes) {
    visit(node)
  }

  return result
}

/**
 * Parses a bookmark URL into the normalized origin used for account matching.
 */
function parseWebBookmarkUrl(value: unknown):
  | {
      url: string
      normalizedOrigin: string
    }
  | "malformed"
  | "non-web"
  | "unsupported" {
  if (typeof value !== "string" || value.trim().length === 0) {
    return "malformed"
  }

  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    return "malformed"
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return "non-web"
  }

  const normalizedOrigin = normalizeAccountSiteUrlForDuplicateCheck({
    siteType: SITE_TYPES.UNKNOWN,
    url: parsed.href,
  })

  if (!normalizedOrigin) {
    return "unsupported"
  }

  return {
    url: normalizedOrigin,
    normalizedOrigin,
  }
}

/**
 * Counts existing accounts by their duplicate-check origin key.
 */
function buildExistingOriginCounts(accounts: SiteAccount[]) {
  const counts = new Map<string, number>()

  for (const account of accounts) {
    const origin = normalizeAccountSiteUrlForDuplicateCheck({
      siteType: account.site_type,
      url: account.site_url,
    })
    if (!origin) continue

    counts.set(origin, (counts.get(origin) ?? 0) + 1)
  }

  return counts
}

/**
 * Builds normalized account-import candidates from a native browser bookmark tree.
 */
export function buildBookmarkAccountImportCandidates(
  input: BuildBookmarkAccountImportCandidatesInput,
): BookmarkAccountImportScanResult {
  const ignoredCounts = createEmptyIgnoredCounts()
  const existingOriginCounts = buildExistingOriginCounts(input.existingAccounts)
  const candidatesByOrigin = new Map<string, BookmarkAccountImportCandidate>()

  for (const node of flattenBookmarkNodes(input.bookmarkTree)) {
    if (Array.isArray(node.children)) {
      ignoredCounts.folder += 1
    }

    if (typeof node.url !== "string") {
      continue
    }

    const parsed = parseWebBookmarkUrl(node.url)
    if (parsed === "malformed") {
      ignoredCounts.malformed += 1
      continue
    }
    if (parsed === "non-web") {
      ignoredCounts.nonWeb += 1
      continue
    }
    if (parsed === "unsupported") {
      ignoredCounts.unsupported += 1
      continue
    }

    const existing = candidatesByOrigin.get(parsed.normalizedOrigin)
    if (existing) {
      existing.sourceBookmarkCount += 1
      ignoredCounts.repeatedOrigin += 1
      continue
    }

    const existingAccountCount =
      existingOriginCounts.get(parsed.normalizedOrigin) ?? 0
    const status = existingAccountCount > 0 ? "duplicate" : "ready"

    candidatesByOrigin.set(parsed.normalizedOrigin, {
      id: `bookmark-import:${parsed.normalizedOrigin}`,
      url: parsed.url,
      normalizedOrigin: parsed.normalizedOrigin,
      status,
      selectedByDefault: status === "ready",
      sourceBookmarkCount: 1,
      ...(existingAccountCount > 0 ? { existingAccountCount } : {}),
    })
  }

  return {
    candidates: Array.from(candidatesByOrigin.values()).sort((a, b) =>
      a.normalizedOrigin.localeCompare(b.normalizedOrigin),
    ),
    ignoredCounts,
  }
}

/**
 * Summarizes candidate statuses and ignored inputs for scan result UI.
 */
export function summarizeBookmarkAccountImportScan(
  scan: BookmarkAccountImportScanResult,
): BookmarkAccountImportScanSummary {
  const readyCount = scan.candidates.filter(
    (candidate) => candidate.status === "ready",
  ).length
  const duplicateCount = scan.candidates.filter(
    (candidate) => candidate.status === "duplicate",
  ).length
  const ignoredCount = Object.values(scan.ignoredCounts).reduce(
    (sum, count) => sum + count,
    0,
  )

  return {
    candidateCount: scan.candidates.length,
    readyCount,
    duplicateCount,
    invalidCount:
      scan.ignoredCounts.malformed +
      scan.ignoredCounts.nonWeb +
      scan.ignoredCounts.unsupported,
    ignoredCount,
    selectedDefaultCount: scan.candidates.filter(
      (candidate) => candidate.selectedByDefault,
    ).length,
  }
}
