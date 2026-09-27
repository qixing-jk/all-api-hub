import type { AccountSiteType } from "~/constants/siteType"
import type { ApiServiceRequest } from "~/services/apiTransport/type"

export const SITE_ANNOUNCEMENT_PROVIDER_IDS = {
  Common: "common",
  Sub2Api: "sub2api",
} as const

export type SiteAnnouncementProviderId =
  (typeof SITE_ANNOUNCEMENT_PROVIDER_IDS)[keyof typeof SITE_ANNOUNCEMENT_PROVIDER_IDS]

export const SITE_ANNOUNCEMENT_STATUS = {
  Never: "never",
  Success: "success",
  Error: "error",
  Unsupported: "unsupported",
} as const

export type SiteAnnouncementStatus =
  (typeof SITE_ANNOUNCEMENT_STATUS)[keyof typeof SITE_ANNOUNCEMENT_STATUS]

export const SITE_ANNOUNCEMENT_CHECK_TRIGGERS = {
  Alarm: "alarm",
  Manual: "manual",
} as const

export type SiteAnnouncementCheckTrigger =
  (typeof SITE_ANNOUNCEMENT_CHECK_TRIGGERS)[keyof typeof SITE_ANNOUNCEMENT_CHECK_TRIGGERS]

/**
 * Supported range for the notification age window, in days.
 */
export const SITE_ANNOUNCEMENT_NOTIFICATION_MAX_AGE_DAYS_RANGE = {
  min: 1,
  max: 365,
} as const

/**
 * Supported range for the polling interval, in minutes.
 */
export const SITE_ANNOUNCEMENT_POLLING_INTERVAL_MINUTES_RANGE = {
  min: 15,
  max: 24 * 60,
} as const

export interface SiteAnnouncementPreferences {
  /**
   * Master switch for automatic background announcement polling.
   */
  enabled: boolean
  /**
   * Controls whether newly discovered announcements create browser system
   * notifications. Local announcement records are still saved when disabled.
   */
  notificationEnabled: boolean
  intervalMinutes: number
  /**
   * How old a newly discovered announcement may be and still count as news.
   * Announcements published earlier than this window are stored as already
   * read, so re-published history never notifies or inflates unread counts.
   */
  notificationMaxAgeDays: number
  /**
   * Whether delivering a notification also marks the fetched announcements
   * read on the site itself.
   *
   * Disabled by default: being notified is not the same as having read, and the
   * upstream write consumes the site's own unread state. Marking read from the
   * announcement page still syncs upstream, because that is a user action.
   */
  autoMarkUpstreamReadOnNotify: boolean
}

export const DEFAULT_SITE_ANNOUNCEMENT_PREFERENCES: SiteAnnouncementPreferences =
  {
    enabled: true,
    notificationEnabled: true,
    intervalMinutes: 360,
    notificationMaxAgeDays: 7,
    autoMarkUpstreamReadOnNotify: false,
  }

/**
 * Constrains the notification age window to the supported range.
 */
export function clampNotificationMaxAgeDays(value: unknown): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return DEFAULT_SITE_ANNOUNCEMENT_PREFERENCES.notificationMaxAgeDays
  }

  return Math.min(
    SITE_ANNOUNCEMENT_NOTIFICATION_MAX_AGE_DAYS_RANGE.max,
    Math.max(
      SITE_ANNOUNCEMENT_NOTIFICATION_MAX_AGE_DAYS_RANGE.min,
      Math.trunc(parsed),
    ),
  )
}

/**
 * Constrains the polling interval to the supported range.
 */
export function clampPollingIntervalMinutes(value: unknown): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return DEFAULT_SITE_ANNOUNCEMENT_PREFERENCES.intervalMinutes
  }

  return Math.min(
    SITE_ANNOUNCEMENT_POLLING_INTERVAL_MINUTES_RANGE.max,
    Math.max(
      SITE_ANNOUNCEMENT_POLLING_INTERVAL_MINUTES_RANGE.min,
      Math.trunc(parsed),
    ),
  )
}

/**
 * Merges legacy or partial stored preferences with the current defaults.
 */
export function normalizeSiteAnnouncementPreferences(
  preferences?: Partial<SiteAnnouncementPreferences> | null,
): SiteAnnouncementPreferences {
  return {
    enabled:
      preferences?.enabled ?? DEFAULT_SITE_ANNOUNCEMENT_PREFERENCES.enabled,
    notificationEnabled:
      preferences?.notificationEnabled ??
      DEFAULT_SITE_ANNOUNCEMENT_PREFERENCES.notificationEnabled,
    intervalMinutes:
      preferences?.intervalMinutes ??
      DEFAULT_SITE_ANNOUNCEMENT_PREFERENCES.intervalMinutes,
    notificationMaxAgeDays: clampNotificationMaxAgeDays(
      preferences?.notificationMaxAgeDays ??
        DEFAULT_SITE_ANNOUNCEMENT_PREFERENCES.notificationMaxAgeDays,
    ),
    autoMarkUpstreamReadOnNotify:
      preferences?.autoMarkUpstreamReadOnNotify ??
      DEFAULT_SITE_ANNOUNCEMENT_PREFERENCES.autoMarkUpstreamReadOnNotify,
  }
}

export interface SiteAnnouncement {
  id?: string
  title?: string
  content?: string
  createdAt?: number
  updatedAt?: number
  readAt?: number
  fingerprint?: string
}

export interface SiteAnnouncementProviderRequest {
  accountId: string
  siteName: string
  siteType: AccountSiteType
  baseUrl: string
  providerId: SiteAnnouncementProviderId
  apiRequest: ApiServiceRequest
}

export interface SiteAnnouncementProviderResult {
  providerId: SiteAnnouncementProviderId
  siteKey: string
  status: Exclude<SiteAnnouncementStatus, "never">
  announcements: SiteAnnouncement[]
  error?: string
}

export interface SiteAnnouncementProvider {
  id: SiteAnnouncementProviderId
  createSiteKey: (input: {
    accountId: string
    siteType: AccountSiteType
    baseUrl: string
  }) => string
  fetch: (
    request: SiteAnnouncementProviderRequest,
  ) => Promise<SiteAnnouncementProviderResult>
  markRead?: (
    request: SiteAnnouncementProviderRequest,
    announcements: SiteAnnouncement[],
  ) => Promise<void>
}

export interface SiteAnnouncementRecord {
  id: string
  siteKey: string
  siteName: string
  siteType: AccountSiteType
  baseUrl: string
  accountId: string
  providerId: SiteAnnouncementProviderId
  upstreamId?: string
  title: string
  content: string
  fingerprint: string
  firstSeenAt: number
  lastSeenAt: number
  createdAt?: number
  updatedAt?: number
  notifiedAt?: number
  notificationError?: string
  read: boolean
  readAt?: number
}

export type SiteAnnouncementRecordInput = Omit<
  SiteAnnouncementRecord,
  "id" | "firstSeenAt" | "lastSeenAt" | "read"
>

export interface SiteAnnouncementSiteState {
  siteKey: string
  siteName: string
  siteType: AccountSiteType
  baseUrl: string
  accountId: string
  providerId: SiteAnnouncementProviderId
  status: SiteAnnouncementStatus
  lastCheckedAt?: number
  lastSuccessAt?: number
  lastError?: string
  lastNotifiedFingerprint?: string
  records: SiteAnnouncementRecord[]
}

export interface SiteAnnouncementIdentityMarker {
  firstSeenAt: number
  lastSeenAt: number
  readAt?: number
}

export interface SiteAnnouncementStoreState {
  schemaVersion: 2
  sites: Record<string, SiteAnnouncementSiteState>
  identityLedger: Record<string, Record<string, SiteAnnouncementIdentityMarker>>
}

export interface SiteAnnouncementCheckResult {
  checked: number
  created: number
  notified: number
  failed: number
  unsupported: number
  records: SiteAnnouncementRecord[]
}
