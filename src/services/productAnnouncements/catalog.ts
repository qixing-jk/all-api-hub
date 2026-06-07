import {
  PRODUCT_ANNOUNCEMENT_LOCALE_FALLBACKS,
  PRODUCT_ANNOUNCEMENT_SCHEMA_VERSION,
  PRODUCT_ANNOUNCEMENT_SEVERITIES,
} from "./constants"
import type {
  ProductAnnouncement,
  ProductAnnouncementCta,
  ProductAnnouncementSeverity,
  RawProductAnnouncementCta,
  RawProductAnnouncementFeed,
} from "./types"
import { sanitizeProductAnnouncementCta } from "./urlPolicy"
import { isVersionInRange } from "./versionRange"

interface NormalizeOptions {
  currentVersion: string
  locale: string
  now: number
  dismissed: Record<string, number>
  seenAt: Record<string, number>
}

interface NormalizeProductAnnouncementResult {
  notices: ProductAnnouncement[]
  errors: string[]
}

export interface ProductAnnouncementView {
  notices: ProductAnnouncement[]
  activeNotices: ProductAnnouncement[]
  dismissedNotices: ProductAnnouncement[]
  primaryRiskNotice: ProductAnnouncement | null
  activeRiskCount: number
  unseenActiveCount: number
}

interface LocalizedAnnouncementContent {
  title: string
  message: string
  cta: ProductAnnouncementCta | null
}

const DEFAULT_PRODUCT_ANNOUNCEMENT_LOCALE = "zh-CN"

const SEVERITY_RANK: Record<ProductAnnouncementSeverity, number> = {
  [PRODUCT_ANNOUNCEMENT_SEVERITIES.Critical]: 0,
  [PRODUCT_ANNOUNCEMENT_SEVERITIES.Warning]: 1,
  [PRODUCT_ANNOUNCEMENT_SEVERITIES.Info]: 2,
}

/**
 * Checks whether a feed value can be inspected as a plain object.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/**
 * Reads a required display or identifier string after trimming whitespace.
 */
function readNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null

  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

/**
 * Parses ISO timestamp fields from raw announcement data.
 */
function readTimestamp(value: unknown): number | null {
  if (typeof value !== "string") return null

  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? timestamp : null
}

/**
 * Reads the positive integer revision used for dismissal comparisons.
 */
function readRevision(value: unknown): number | null {
  if (typeof value !== "number") return null

  return Number.isInteger(value) && value >= 1 ? value : null
}

/**
 * Reads the optional priority value, defaulting invalid values to neutral rank.
 */
function readPriority(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

/**
 * Narrows a raw severity value to the supported announcement severities.
 */
function isProductAnnouncementSeverity(
  value: string,
): value is ProductAnnouncementSeverity {
  return (
    value === PRODUCT_ANNOUNCEMENT_SEVERITIES.Critical ||
    value === PRODUCT_ANNOUNCEMENT_SEVERITIES.Warning ||
    value === PRODUCT_ANNOUNCEMENT_SEVERITIES.Info
  )
}

/**
 * Reads a raw severity value when it matches the supported severity union.
 */
function readSeverity(value: unknown): ProductAnnouncementSeverity | null {
  return typeof value === "string" && isProductAnnouncementSeverity(value)
    ? value
    : null
}

/**
 * Resolves the feed default locale while preserving the product fallback.
 */
function getDefaultLocale(feed: RawProductAnnouncementFeed): string {
  return (
    readNonEmptyString(feed.defaultLocale) ??
    DEFAULT_PRODUCT_ANNOUNCEMENT_LOCALE
  )
}

/**
 * Builds the locale lookup chain for localized announcement content.
 */
function getLocaleCandidates(locale: string, defaultLocale: string): string[] {
  const candidates = [
    readNonEmptyString(locale),
    readNonEmptyString(locale.split("-")[0]),
    ...PRODUCT_ANNOUNCEMENT_LOCALE_FALLBACKS,
    defaultLocale,
  ]

  return candidates.filter(
    (candidate, index): candidate is string =>
      candidate !== null && candidates.indexOf(candidate) === index,
  )
}

/**
 * Converts unknown CTA data into the shape accepted by the URL policy helper.
 */
function readCta(value: unknown): RawProductAnnouncementCta | undefined {
  if (!isRecord(value)) return undefined

  return {
    label: value.label,
    url: value.url,
  }
}

/**
 * Selects the first valid localized content block for the requested locale.
 */
function resolveLocalizedContent(
  content: Record<string, unknown>,
  locale: string,
  defaultLocale: string,
): LocalizedAnnouncementContent | null {
  for (const candidate of getLocaleCandidates(locale, defaultLocale)) {
    const localized = content[candidate]
    if (!isRecord(localized)) continue

    const title = readNonEmptyString(localized.title)
    const message = readNonEmptyString(localized.message)
    if (!title || !message) continue

    return {
      title,
      message,
      cta: sanitizeProductAnnouncementCta(readCta(localized.cta)),
    }
  }

  return null
}

/**
 * Orders notices by risk, product priority, freshness, and stable identity.
 */
function sortProductAnnouncements(
  left: ProductAnnouncement,
  right: ProductAnnouncement,
): number {
  return (
    SEVERITY_RANK[left.severity] - SEVERITY_RANK[right.severity] ||
    right.priority - left.priority ||
    right.startsAt - left.startsAt ||
    left.id.localeCompare(right.id)
  )
}

/**
 * Converts one raw feed item into a display-ready notice when it is applicable.
 */
function normalizeProductAnnouncement(
  rawAnnouncement: unknown,
  options: NormalizeOptions,
  defaultLocale: string,
): ProductAnnouncement | null {
  if (!isRecord(rawAnnouncement)) return null

  const id = readNonEmptyString(rawAnnouncement.id)
  const revision = readRevision(rawAnnouncement.revision)
  const severity = readSeverity(rawAnnouncement.severity)
  const affectedVersions =
    typeof rawAnnouncement.affectedVersions === "string"
      ? rawAnnouncement.affectedVersions
      : null
  const startsAt = readTimestamp(rawAnnouncement.startsAt)
  const expiresAt = readTimestamp(rawAnnouncement.expiresAt)
  const content = isRecord(rawAnnouncement.content)
    ? rawAnnouncement.content
    : null

  if (
    !id ||
    revision === null ||
    !severity ||
    affectedVersions === null ||
    startsAt === null ||
    expiresAt === null ||
    !content ||
    startsAt > options.now ||
    options.now >= expiresAt ||
    !isVersionInRange(options.currentVersion, affectedVersions)
  ) {
    return null
  }

  const localized = resolveLocalizedContent(
    content,
    options.locale,
    defaultLocale,
  )
  if (!localized) return null

  const dismissedRevision = options.dismissed[id]
  const notice: ProductAnnouncement = {
    id,
    revision,
    severity,
    priority: readPriority(rawAnnouncement.priority),
    startsAt,
    expiresAt,
    title: localized.title,
    message: localized.message,
    dismissed:
      typeof dismissedRevision === "number" && dismissedRevision >= revision,
    seen: typeof options.seenAt[id] === "number",
  }

  if (localized.cta) {
    notice.cta = localized.cta
  }

  return notice
}

/**
 * Normalizes a raw product announcement feed into display-ready notices.
 */
export function normalizeProductAnnouncementFeed(
  feed: RawProductAnnouncementFeed,
  options: NormalizeOptions,
): NormalizeProductAnnouncementResult {
  if (feed.schemaVersion !== PRODUCT_ANNOUNCEMENT_SCHEMA_VERSION) {
    return { notices: [], errors: ["unsupported_schema"] }
  }

  const defaultLocale = getDefaultLocale(feed)
  const rawAnnouncements = Array.isArray(feed.announcements)
    ? feed.announcements
    : []
  const notices = rawAnnouncements
    .map((announcement) =>
      normalizeProductAnnouncement(announcement, options, defaultLocale),
    )
    .filter((notice): notice is ProductAnnouncement => notice !== null)
    .sort(sortProductAnnouncements)

  return { notices, errors: [] }
}

/**
 * Derives active, dismissed, and risk-focused presentation groups.
 */
export function selectProductAnnouncementView(
  notices: ProductAnnouncement[],
): ProductAnnouncementView {
  const activeNotices = notices.filter((notice) => !notice.dismissed)
  const dismissedNotices = notices.filter((notice) => notice.dismissed)
  const activeRiskNotices = activeNotices.filter(
    (notice) =>
      notice.severity === PRODUCT_ANNOUNCEMENT_SEVERITIES.Critical ||
      notice.severity === PRODUCT_ANNOUNCEMENT_SEVERITIES.Warning,
  )
  const primaryRiskNotice =
    activeRiskNotices.length > 0 ? activeRiskNotices[0] : null

  return {
    notices,
    activeNotices,
    dismissedNotices,
    primaryRiskNotice,
    activeRiskCount: activeRiskNotices.length,
    unseenActiveCount: activeNotices.filter((notice) => !notice.seen).length,
  }
}
