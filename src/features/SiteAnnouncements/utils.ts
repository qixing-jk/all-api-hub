import {
  getStaticAccountSiteRouteUrl,
  SITE_ROUTE_KINDS,
} from "~/services/accounts/utils/siteRouteResolver"
import type { SiteAnnouncementRecord } from "~/types/siteAnnouncements"
import { formatRelativeTime } from "~/utils/core/formatters"
import { normalizeUrlForOriginKey } from "~/utils/core/urlParsing"

import type { AnnouncementMetric, UnreadFilter } from "./types"

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
 * Returns the Tailwind classes for a summary metric tone.
 */
export function getMetricToneClasses(tone: AnnouncementMetric["tone"]) {
  switch (tone) {
    case "info":
      return "bg-info-soft text-info-soft-foreground ring-info-border"
    case "neutral":
      return "bg-muted text-secondary-foreground ring-border"
    case "accent":
    default:
      return "bg-primary-soft text-primary-soft-foreground ring-primary-soft-border"
  }
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
 * Collects distinct site types for the filter dropdown.
 */
export function buildSiteTypeOptions(
  records: SiteAnnouncementRecord[],
  status: Array<{ siteType: SiteAnnouncementRecord["siteType"] }> = [],
) {
  return [
    ...new Set([...records, ...status].map((item) => item.siteType)),
  ].sort()
}

/**
 * Applies the active site and read-state filters to announcement records.
 */
export function filterSiteAnnouncements(
  records: SiteAnnouncementRecord[],
  {
    siteKey,
    siteKeys,
    siteType,
    unreadFilter,
  }: {
    siteKey: string
    siteKeys?: string[]
    siteType: string
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
    if (siteType !== "all" && record.siteType !== siteType) {
      return false
    }
    if (unreadFilter === "unread" && record.read) {
      return false
    }
    if (unreadFilter === "read" && !record.read) {
      return false
    }

    return true
  })
}
