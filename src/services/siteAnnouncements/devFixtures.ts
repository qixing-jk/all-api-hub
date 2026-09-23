/** Development-only site announcement fixtures behind the floating dev panel. */

import { SITE_TYPES, type AccountSiteType } from "~/constants/siteType"
import {
  createRuntimeMessageFailure,
  type RuntimeMessageResponse,
} from "~/services/runtimeMessaging/result"
import {
  SITE_ANNOUNCEMENT_PROVIDER_IDS,
  SITE_ANNOUNCEMENT_STATUS,
  type SiteAnnouncementProviderId,
  type SiteAnnouncementRecordInput,
  type SiteAnnouncementSiteState,
} from "~/types/siteAnnouncements"
import { isDevelopmentMode } from "~/utils/core/environment"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"

import {
  isSiteAnnouncementDevFixtureSiteKey,
  SITE_ANNOUNCEMENT_DEV_FIXTURE_SITE_KEY_PREFIX,
  SITE_ANNOUNCEMENTS_LIMITS,
} from "./constants"
import { siteAnnouncementStorage } from "./storage"

const logger = createLogger("SiteAnnouncementsDevFixtures")

const DEBUG_UNAVAILABLE_ERROR = "Debug action unavailable"

const HOUR_MS = 60 * 60 * 1000

/** Site state without the fields a fixture decides for itself. */
type DevFixtureSite = Omit<SiteAnnouncementSiteState, "status" | "records">

/** Sites fixture announcements are spread over; the store caps records per site. */
const FIXTURE_ANNOUNCEMENT_SITES = [
  {
    slug: "alpha",
    siteName: "Dev Fixture Alpha",
    siteType: SITE_TYPES.NEW_API,
    providerId: SITE_ANNOUNCEMENT_PROVIDER_IDS.Common,
  },
  {
    slug: "beta",
    siteName: "Dev Fixture Beta",
    siteType: SITE_TYPES.NEW_API,
    providerId: SITE_ANNOUNCEMENT_PROVIDER_IDS.Common,
  },
  {
    slug: "gamma",
    siteName: "Dev Fixture Gamma",
    siteType: SITE_TYPES.SUB2API,
    providerId: SITE_ANNOUNCEMENT_PROVIDER_IDS.Sub2Api,
  },
] as const satisfies readonly {
  slug: string
  siteName: string
  siteType: AccountSiteType
  providerId: SiteAnnouncementProviderId
}[]

const FIXTURE_ANNOUNCEMENT_SITE_COUNT = FIXTURE_ANNOUNCEMENT_SITES.length

const MAX_FIXTURE_ANNOUNCEMENTS =
  FIXTURE_ANNOUNCEMENT_SITE_COUNT * SITE_ANNOUNCEMENTS_LIMITS.recordsPerSite

/** Keeps the unfiltered site selector usable while still showing site issues. */
const MAX_FIXTURE_ISSUE_SITES = 50

export interface SiteAnnouncementsDevFixtureResult {
  sites: number
  records: number
}

export interface SiteAnnouncementsDevSeedRequest {
  /** Announcements spread evenly over the fixture announcement sites. */
  announcementCount?: number
  /** Fixture sites whose last check failed. */
  failedSiteCount?: number
  /** Fixture sites with no available announcement interface. */
  unsupportedSiteCount?: number
}

/** Builds the site identity every fixture site shares. */
function buildFixtureSite(
  slug: string,
  siteName: string,
  siteType: AccountSiteType,
  providerId: SiteAnnouncementProviderId,
): DevFixtureSite {
  const baseUrl = `https://dev-fixture-${slug}.example.invalid`

  return {
    siteKey: `${SITE_ANNOUNCEMENT_DEV_FIXTURE_SITE_KEY_PREFIX}${siteType}:${baseUrl}`,
    siteName,
    siteType,
    baseUrl,
    accountId: `dev-fixture-account-${slug}`,
    providerId,
  }
}

/**
 * Builds one fixture record. The variation is deliberate, so a manual pass
 * covers the renderer's branches: inferred titles, HTML notices, long markdown
 * bodies, and the read/notified badges.
 */
function buildFixtureRecord(
  site: DevFixtureSite,
  index: number,
  now: number,
): SiteAnnouncementRecordInput {
  const createdAt = now - index * HOUR_MS
  const longBody = [
    `## Maintenance window ${index}`,
    "",
    "Billing infrastructure rotates today with brief interruptions.",
    "",
    "- Read-only mode from 22:00 UTC",
    "- Balances stay visible",
    "",
    "```",
    "curl https://example.invalid/api/status",
    "```",
  ].join("\n")
  const htmlBody = `<div><b>HTML notice ${index}</b><ul><li>Legacy markup</li></ul></div>`
  const content =
    index % 5 === 0
      ? longBody
      : index % 4 === 0
        ? htmlBody
        : `Fixture body ${index}`
  const read = index % 3 === 0

  return {
    siteKey: site.siteKey,
    siteName: site.siteName,
    siteType: site.siteType,
    baseUrl: site.baseUrl,
    accountId: site.accountId,
    providerId: site.providerId,
    // Every seventh fixture carries no title, so the page has to infer one.
    title: index % 7 === 0 ? "" : `Fixture announcement ${index}`,
    content,
    fingerprint: `${site.siteKey}:${index}`,
    createdAt,
    ...(read ? { readAt: createdAt } : {}),
    ...(index % 6 === 0 ? { notifiedAt: createdAt } : {}),
  }
}

/**
 * Builds issue-only fixture sites: the statuses the page reports as sites
 * needing attention, without the announcements a healthy site would carry.
 */
function buildIssueSites(
  kind: "failed" | "unsupported",
  status: (typeof SITE_ANNOUNCEMENT_STATUS)[keyof typeof SITE_ANNOUNCEMENT_STATUS],
  count: number,
  now: number,
): Array<Omit<SiteAnnouncementSiteState, "records">> {
  const failed = status === SITE_ANNOUNCEMENT_STATUS.Error

  return Array.from({ length: count }, (_, index) => ({
    ...buildFixtureSite(
      `${kind}-${index + 1}`,
      `Dev Fixture ${failed ? "Failed" : "Unsupported"} ${index + 1}`,
      SITE_TYPES.NEW_API,
      SITE_ANNOUNCEMENT_PROVIDER_IDS.Common,
    ),
    status,
    lastCheckedAt: now,
    ...(failed ? { lastError: "Dev fixture: simulated check failure" } : {}),
  }))
}

/** Clamps a requested fixture count to what the store can hold. */
function clampFixtureCount(value: unknown, max: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return 0
  }

  return Math.min(max, Math.max(0, Math.trunc(parsed)))
}

/** Counts the fixture sites and records currently persisted. */
async function summarizeDevFixtures(): Promise<SiteAnnouncementsDevFixtureResult> {
  const sites = (await siteAnnouncementStorage.getStatus()).filter((site) =>
    isSiteAnnouncementDevFixtureSiteKey(site.siteKey),
  )

  return {
    sites: sites.length,
    records: sites.reduce((total, site) => total + site.records.length, 0),
  }
}

/**
 * Seeds announcement fixtures. Records belong to a fixture site by index, so
 * seeding a larger count later adds to the cache instead of moving records
 * between sites.
 */
export async function seedDevSiteAnnouncementFixtures(
  request: SiteAnnouncementsDevSeedRequest = {},
): Promise<SiteAnnouncementsDevFixtureResult> {
  const now = Date.now()
  const announcementCount = clampFixtureCount(
    request.announcementCount,
    MAX_FIXTURE_ANNOUNCEMENTS,
  )
  const failedSiteCount = clampFixtureCount(
    request.failedSiteCount,
    MAX_FIXTURE_ISSUE_SITES,
  )
  const unsupportedSiteCount = clampFixtureCount(
    request.unsupportedSiteCount,
    MAX_FIXTURE_ISSUE_SITES,
  )

  const recordsBySite = new Map<number, SiteAnnouncementRecordInput[]>()
  for (let index = 0; index < announcementCount; index += 1) {
    const siteIndex = index % FIXTURE_ANNOUNCEMENT_SITE_COUNT
    const site = FIXTURE_ANNOUNCEMENT_SITES[siteIndex]
    if (!site) {
      continue
    }

    const records = recordsBySite.get(siteIndex) ?? []
    records.push(
      buildFixtureRecord(
        buildFixtureSite(
          site.slug,
          site.siteName,
          site.siteType,
          site.providerId,
        ),
        index,
        now,
      ),
    )
    recordsBySite.set(siteIndex, records)
  }

  for (const [siteIndex, records] of recordsBySite) {
    const site = FIXTURE_ANNOUNCEMENT_SITES[siteIndex]
    if (!site) {
      continue
    }

    await siteAnnouncementStorage.upsertDiscoveredRecords({
      site: {
        ...buildFixtureSite(
          site.slug,
          site.siteName,
          site.siteType,
          site.providerId,
        ),
        status: SITE_ANNOUNCEMENT_STATUS.Success,
        lastCheckedAt: now,
        lastSuccessAt: now,
      },
      records,
      now,
    })
  }

  const issueSites = [
    ...buildIssueSites(
      "failed",
      SITE_ANNOUNCEMENT_STATUS.Error,
      failedSiteCount,
      now,
    ),
    ...buildIssueSites(
      "unsupported",
      SITE_ANNOUNCEMENT_STATUS.Unsupported,
      unsupportedSiteCount,
      now,
    ),
  ]
  for (const site of issueSites) {
    await siteAnnouncementStorage.upsertSiteStatus(site)
  }

  return await summarizeDevFixtures()
}

/**
 * Removes fixture sites with their records, leaving real cached data untouched.
 */
export async function clearDevSiteAnnouncementFixtures(): Promise<SiteAnnouncementsDevFixtureResult> {
  const fixtureSiteKeys = (await siteAnnouncementStorage.getStatus())
    .map((site) => site.siteKey)
    .filter(isSiteAnnouncementDevFixtureSiteKey)

  return await siteAnnouncementStorage.removeSites(fixtureSiteKeys)
}

/** Resolve a typed request to seed announcement fixtures. */
export async function resolveSiteAnnouncementsDebugSeedFixturesMessage(
  request?: SiteAnnouncementsDevSeedRequest,
): Promise<RuntimeMessageResponse<SiteAnnouncementsDevFixtureResult>> {
  if (!isDevelopmentMode()) {
    return createRuntimeMessageFailure(DEBUG_UNAVAILABLE_ERROR)
  }

  try {
    return {
      success: true,
      data: await seedDevSiteAnnouncementFixtures(request),
    }
  } catch (error) {
    logger.error("Failed to seed site announcement fixtures", error)
    return createRuntimeMessageFailure(getErrorMessage(error))
  }
}

/** Resolve a typed request to clear announcement fixtures. */
export async function resolveSiteAnnouncementsDebugClearFixturesMessage(): Promise<
  RuntimeMessageResponse<SiteAnnouncementsDevFixtureResult>
> {
  if (!isDevelopmentMode()) {
    return createRuntimeMessageFailure(DEBUG_UNAVAILABLE_ERROR)
  }

  try {
    return { success: true, data: await clearDevSiteAnnouncementFixtures() }
  } catch (error) {
    logger.error("Failed to clear site announcement fixtures", error)
    return createRuntimeMessageFailure(getErrorMessage(error))
  }
}
