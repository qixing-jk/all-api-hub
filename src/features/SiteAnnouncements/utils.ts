import { getSiteApiRouter, SITE_TYPES } from "~/constants/siteType"
import {
  SITE_ANNOUNCEMENT_PROVIDER_IDS,
  type SiteAnnouncementRecord,
} from "~/types/siteAnnouncements"
import { formatRelativeTime } from "~/utils/core/formatters"
import { joinUrl } from "~/utils/core/url"

import type { UnreadFilter } from "./types"

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
  return formatDateTime(record.createdAt ?? record.firstSeenAt)
}

/**
 * Formats Sub2API announcements with relative time when possible.
 */
export function formatSub2ApiRelativeTimestamp(record: SiteAnnouncementRecord) {
  return (
    formatRelativeTime(new Date(record.createdAt ?? record.firstSeenAt)) ||
    formatAnnouncementTimestamp(record)
  )
}

/**
 * Checks whether a cached announcement came from the Sub2API provider.
 */
export function isSub2ApiAnnouncement(record: SiteAnnouncementRecord) {
  return (
    record.siteType === SITE_TYPES.SUB2API ||
    record.providerId === SITE_ANNOUNCEMENT_PROVIDER_IDS.Sub2Api
  )
}

/**
 * Returns the normal site UI surface where the cached announcement can be inspected.
 */
export function getAnnouncementSourceUrl(record: SiteAnnouncementRecord) {
  return joinUrl(
    record.baseUrl,
    getSiteApiRouter(record.siteType).siteAnnouncementsPath,
  )
}

/**
 * Returns the Tailwind classes for a summary metric tone.
 */
export function getMetricToneClasses(tone: "blue" | "amber" | "emerald") {
  switch (tone) {
    case "amber":
      return "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-400/10 dark:text-amber-200 dark:ring-amber-400/20"
    case "emerald":
      return "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-400/10 dark:text-emerald-200 dark:ring-emerald-400/20"
    case "blue":
    default:
      return "bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-400/10 dark:text-blue-200 dark:ring-blue-400/20"
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
  }>,
) {
  const map = new Map<string, string>()

  for (const item of status) {
    map.set(item.siteKey, item.siteName || item.baseUrl)
  }

  for (const item of records) {
    map.set(item.siteKey, item.siteName || item.baseUrl)
  }

  return [...map.entries()]
}

/**
 * Collects distinct site types for the filter dropdown.
 */
export function buildSiteTypeOptions(records: SiteAnnouncementRecord[]) {
  return [...new Set(records.map((record) => record.siteType))].sort()
}

/**
 * Applies the active site and read-state filters to announcement records.
 */
export function filterSiteAnnouncements(
  records: SiteAnnouncementRecord[],
  {
    siteKey,
    siteType,
    unreadFilter,
  }: {
    siteKey: string
    siteType: string
    unreadFilter: UnreadFilter
  },
) {
  return records.filter((record) => {
    if (siteKey !== "all" && record.siteKey !== siteKey) {
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
