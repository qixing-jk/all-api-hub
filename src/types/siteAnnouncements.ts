import type { SiteType } from "~/constants/siteType"
import type { ApiServiceRequest } from "~/services/apiService/common/type"

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
}

export const DEFAULT_SITE_ANNOUNCEMENT_PREFERENCES: SiteAnnouncementPreferences =
  {
    enabled: true,
    notificationEnabled: true,
    intervalMinutes: 360,
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
  siteType: SiteType
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
    siteType: SiteType
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
  siteType: SiteType
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

export interface SiteAnnouncementSiteState {
  siteKey: string
  siteName: string
  siteType: SiteType
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

export interface SiteAnnouncementStoreState {
  schemaVersion: 1
  sites: Record<string, SiteAnnouncementSiteState>
}

export interface SiteAnnouncementCheckResult {
  checked: number
  created: number
  notified: number
  failed: number
  unsupported: number
  records: SiteAnnouncementRecord[]
}
