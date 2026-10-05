import type { AccountSiteType } from "~/constants/siteType"
import type { ApiServiceRequest } from "~/services/apiTransport/type"

export const ANNOUNCEMENT_SOURCE_SCOPES = {
  Site: "site",
  Account: "account",
} as const

export type AnnouncementSourceScope =
  (typeof ANNOUNCEMENT_SOURCE_SCOPES)[keyof typeof ANNOUNCEMENT_SOURCE_SCOPES]

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
  /** Upstream read state, independent of whether a read timestamp is available. */
  read?: boolean
  readAt?: number
  fingerprint?: string
}

export interface AnnouncementSourceHandlerRequest {
  accountId: string
  siteName: string
  siteType: AccountSiteType
  baseUrl: string
  sourceScope: AnnouncementSourceScope
  apiRequest: ApiServiceRequest
}

export interface AnnouncementSourceHandlerResult {
  sourceScope: AnnouncementSourceScope
  siteKey: string
  status: Exclude<SiteAnnouncementStatus, "never">
  announcements: SiteAnnouncement[]
  error?: string
}

export interface AnnouncementSourceHandler {
  scope: AnnouncementSourceScope
  createSiteKey: (input: {
    accountId: string
    siteType: AccountSiteType
    baseUrl: string
  }) => string
  fetch: (
    request: AnnouncementSourceHandlerRequest,
  ) => Promise<AnnouncementSourceHandlerResult>
  markRead?: (
    request: AnnouncementSourceHandlerRequest,
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
  sourceScope: AnnouncementSourceScope
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

/** Current actions projected for the UI, independent of persisted record identity. */
export interface SiteAnnouncementRecordView extends SiteAnnouncementRecord {
  canSyncRead: boolean
}

export type SiteAnnouncementRecordInput = Omit<
  SiteAnnouncementRecord,
  "id" | "firstSeenAt" | "lastSeenAt" | "read"
> & { read?: boolean }

export interface SiteAnnouncementSiteState {
  siteKey: string
  siteName: string
  siteType: AccountSiteType
  baseUrl: string
  accountId: string
  sourceScope: AnnouncementSourceScope
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
  schemaVersion: 3
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
