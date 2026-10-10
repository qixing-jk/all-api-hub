import {
  getStaticAccountSiteRouteUrl,
  SITE_ROUTE_KINDS,
} from "~/services/accounts/utils/siteRouteResolver"
import { normalizeSearchText } from "~/services/search/accountSearch"
import {
  buildAnnouncementDisplayText,
  getAnnouncementPlainText,
} from "~/services/siteAnnouncements/text"
import type { SiteAnnouncementRecord } from "~/types/siteAnnouncements"
import { formatRelativeTime } from "~/utils/core/formatters"
import { normalizeUrlForOriginKey } from "~/utils/core/urlParsing"

import type { UnreadFilter } from "./types"

export interface SiteAnnouncementSiteOption {
  value: string
  label: string
  announcementCount: number
  sourceKeys?: string[]
}

/**
 * Formats an epoch timestamp for display in the current locale.
 */
export function formatDateTime(value?: number) {
  if (!value) {
    return "-"
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value))
}

/**
 * Formats the primary timestamp shown for a cached announcement.
 */
export function formatAnnouncementTimestamp(record: SiteAnnouncementRecord) {
  if (
    typeof record.createdAt === "number" &&
    Number.isFinite(record.createdAt)
  ) {
    return (
      formatRelativeTime(new Date(record.createdAt)) ||
      formatDateTime(record.createdAt)
    )
  }
  return formatDateTime(record.firstSeenAt)
}

/**
 * Returns the normal site UI surface where the cached announcement can be inspected.
 */
export function getAnnouncementSourceUrl(record: SiteAnnouncementRecord) {
  return getStaticAccountSiteRouteUrl(
    record,
    SITE_ROUTE_KINDS.SiteAnnouncements,
  )
}

/**
 * Builds stable site filter options from both current records and status entries.
 */
export function buildSiteOptions(
  records: SiteAnnouncementRecord[],
  status: Array<{
    siteKey: string
    siteName?: string
    baseUrl: string
    siteType?: SiteAnnouncementRecord["siteType"]
  }>,
) {
  const map = new Map<string, SiteAnnouncementSiteOption>()
  const recordTypes = new Map(
    records.map((record) => [record.siteKey, record.siteType]),
  )
  for (const item of [...status, ...records]) {
    const siteType = item.siteType ?? recordTypes.get(item.siteKey) ?? ""
    const key = `${siteType}:${normalizeUrlForOriginKey(item.baseUrl)}`
    const existing = map.get(key)
    const isRecord = "fingerprint" in item
    if (existing) {
      const keys = existing.sourceKeys ?? [existing.value]
      if (!keys.includes(item.siteKey))
        existing.sourceKeys = [...keys, item.siteKey]
      if (isRecord) existing.announcementCount += 1
      if (isRecord && item.siteName) existing.label = item.siteName
    } else {
      map.set(key, {
        value: item.siteKey,
        label: item.siteName || item.baseUrl,
        announcementCount: isRecord ? 1 : 0,
      })
    }
  }

  return [...map.values()].sort((a, b) => {
    if (a.announcementCount !== b.announcementCount) {
      return b.announcementCount - a.announcementCount
    }

    return a.label.localeCompare(b.label)
  })
}

/**
 * Checks whether an announcement is visible under the active read-state scope.
 */
export function matchesUnreadFilter(
  record: SiteAnnouncementRecord,
  unreadFilter: UnreadFilter,
) {
  return unreadFilter === "all" || !record.read
}

/**
 * Applies the active site and read-state filters to announcement records.
 */
export function filterSiteAnnouncements(
  records: SiteAnnouncementRecord[],
  {
    siteKey,
    siteKeys,
    unreadFilter,
  }: {
    siteKey: string
    siteKeys?: string[]
    unreadFilter: UnreadFilter
  },
) {
  return records.filter((record) => {
    if (
      siteKey !== "all" &&
      !(siteKeys ?? [siteKey]).includes(record.siteKey)
    ) {
      return false
    }

    return matchesUnreadFilter(record, unreadFilter)
  })
}

/** Orders the displayed list newest first without mutating cached records. */
export function sortSiteAnnouncements<T extends SiteAnnouncementRecord>(
  records: T[],
): T[] {
  const publicationTime = (record: SiteAnnouncementRecord) =>
    typeof record.createdAt === "number" && Number.isFinite(record.createdAt)
      ? record.createdAt
      : record.firstSeenAt

  return [...records].sort(
    (left, right) =>
      publicationTime(right) - publicationTime(left) ||
      right.firstSeenAt - left.firstSeenAt,
  )
}

/**
 * Matches one announcement against the free-text search box.
 *
 * Matching runs on the rendered title and the full formatted body so search
 * terms line up with what the card shows, and Markdown or HTML markers in the
 * raw upstream content never become searchable. The body is not truncated: a
 * summary-length preview would hide everything past its first line.
 */
export function matchSiteAnnouncementQuery(
  record: SiteAnnouncementRecord,
  query: string,
) {
  const normalizedQuery = normalizeSearchText(query)
  if (!normalizedQuery) {
    return true
  }

  const display = buildAnnouncementDisplayText(record)
  const haystack = [
    normalizeSearchText(display.title),
    normalizeSearchText(getAnnouncementPlainText(display.body)),
  ].join("\n")

  return haystack.includes(normalizedQuery)
}
