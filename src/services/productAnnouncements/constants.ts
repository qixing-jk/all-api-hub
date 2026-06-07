import bundledProductAnnouncementFeed from "~~/public/product-announcements.json"

export const PRODUCT_ANNOUNCEMENT_SCHEMA_VERSION =
  bundledProductAnnouncementFeed.schemaVersion

// Product-owned data-only feed from public/product-announcements.json on main;
// consumers schema-validate it and fall back to the bundled feed.
export const PRODUCT_ANNOUNCEMENT_REMOTE_URL =
  "https://raw.githubusercontent.com/qixing-jk/all-api-hub/main/public/product-announcements.json"

export const PRODUCT_ANNOUNCEMENT_REFRESH_ALARM = "productAnnouncementsRefresh"

export const PRODUCT_ANNOUNCEMENT_REFRESH_INTERVAL_MINUTES = 12 * 60

export const PRODUCT_ANNOUNCEMENT_LOCALE_FALLBACKS = ["zh-CN", "en"] as const

export const PRODUCT_ANNOUNCEMENT_SEVERITIES = {
  Critical: "critical",
  Warning: "warning",
  Info: "info",
} as const
