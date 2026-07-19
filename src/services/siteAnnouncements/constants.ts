export const SITE_ANNOUNCEMENTS_ALARM_NAME = "siteAnnouncementsCheck" as const

export const SITE_ANNOUNCEMENTS_STORE_SCHEMA_VERSION = 2 as const

export const SITE_ANNOUNCEMENTS_LIMITS = {
  recordsPerSite: 100,
  identitiesPerSite: 1_000,
  identitiesTotal: 10_000,
  summaryLength: 180,
} as const
