export const SITE_ANNOUNCEMENTS_ALARM_NAME = "siteAnnouncementsCheck" as const

export const SITE_ANNOUNCEMENTS_STORE_SCHEMA_VERSION = 2 as const

export const SITE_ANNOUNCEMENTS_LIMITS = {
  recordsPerSite: 100,
  identitiesPerSite: 1_000,
  identitiesTotal: 10_000,
  summaryLength: 180,
} as const

/**
 * Site-key prefix reserved for development-only announcement fixtures, so they
 * can be seeded and cleared without touching real cached announcements.
 */
export const SITE_ANNOUNCEMENT_DEV_FIXTURE_SITE_KEY_PREFIX = "dev-fixture:"

/**
 * Checks whether a site key belongs to a development-only fixture site.
 */
export function isSiteAnnouncementDevFixtureSiteKey(siteKey: string): boolean {
  return siteKey.startsWith(SITE_ANNOUNCEMENT_DEV_FIXTURE_SITE_KEY_PREFIX)
}
