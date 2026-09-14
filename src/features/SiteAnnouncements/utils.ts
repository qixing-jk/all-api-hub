import { getAccountSiteApiRouter, SITE_TYPES } from "~/constants/siteType"
import {
  SITE_ANNOUNCEMENT_PROVIDER_IDS,
  type SiteAnnouncementRecord,
} from "~/types/siteAnnouncements"
import { formatRelativeTime } from "~/utils/core/formatters"
import { joinUrl } from "~/utils/core/url"

import type { UnreadFilter } from "./types"

export interface SiteAnnouncementSiteOption {
  value: string
  label: string
  announcementCount: number
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
  const path = getAccountSiteApiRouter(record.siteType).siteAnnouncementsPath
  return path === null ? null : joinUrl(record.baseUrl, path)
}

/**
 * Returns the Tailwind classes for a summary metric tone.
 */
export function getMetricToneClasses(tone: "blue" | "amber" | "emerald") {
  switch (tone) {
    case "amber":
      return "bg-warning-soft text-warning-soft-foreground ring-warning-text dark:ring-warning-text/20"
    case "emerald":
      return "bg-success-soft text-success-soft-foreground ring-success-text dark:ring-success-text/20"
    case "blue":
    default:
      return "bg-theme-50 text-theme-700 ring-theme-200 dark:bg-theme-400/10 dark:text-theme-200 dark:ring-theme-400/20"
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
  const map = new Map<string, SiteAnnouncementSiteOption>()

  for (const item of status) {
    map.set(item.siteKey, {
      value: item.siteKey,
      label: item.siteName || item.baseUrl,
      announcementCount: 0,
    })
  }

  for (const item of records) {
    const existing = map.get(item.siteKey)
    map.set(item.siteKey, {
      value: item.siteKey,
      label: item.siteName || existing?.label || item.baseUrl,
      announcementCount: (existing?.announcementCount ?? 0) + 1,
    })
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
