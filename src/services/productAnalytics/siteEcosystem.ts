import {
  isAccountSiteType,
  isManagedSiteType,
  SITE_TYPES,
} from "~/constants/siteType"
import type { SiteAccount } from "~/types"

import {
  PRODUCT_ANALYTICS_EVENTS,
  PRODUCT_ANALYTICS_SITE_TYPES,
  type ProductAnalyticsEventPayload,
  type ProductAnalyticsSiteType,
} from "./events"
import { bucketCount } from "./privacy"

export const SITE_ECOSYSTEM_SNAPSHOT_INTERVAL_MS = 3 * 24 * 60 * 60 * 1000

type SiteEcosystemSnapshotEvent = {
  eventName: typeof PRODUCT_ANALYTICS_EVENTS.SiteEcosystemSnapshot
  properties: ProductAnalyticsEventPayload<
    typeof PRODUCT_ANALYTICS_EVENTS.SiteEcosystemSnapshot
  >
}

type SiteTypePresentEvent = {
  eventName: typeof PRODUCT_ANALYTICS_EVENTS.SiteTypePresent
  properties: ProductAnalyticsEventPayload<
    typeof PRODUCT_ANALYTICS_EVENTS.SiteTypePresent
  >
}

type SiteEcosystemEvent = SiteEcosystemSnapshotEvent | SiteTypePresentEvent

/**
 * Converts untrusted stored site-type values into analytics-approved enums.
 */
function normalizeSiteType(
  siteType: SiteAccount["site_type"],
): ProductAnalyticsSiteType {
  if (isAccountSiteType(siteType) || isManagedSiteType(siteType)) {
    return siteType
  }
  return SITE_TYPES.UNKNOWN
}

/**
 * Derives a local grouping key while keeping URLs and account ids out of events.
 */
function getSiteKeyWithoutExportingIt(account: SiteAccount): string {
  try {
    return new URL(account.site_url).origin
  } catch {
    return `invalid:${account.id}`
  }
}

/**
 * Checks whether the three-day ecosystem snapshot cadence has elapsed.
 */
export function shouldSendSiteEcosystemSnapshot(
  lastSentAt: number | undefined,
  now = Date.now(),
): boolean {
  if (typeof lastSentAt !== "number" || !Number.isFinite(lastSentAt)) {
    return true
  }
  return now - lastSentAt >= SITE_ECOSYSTEM_SNAPSHOT_INTERVAL_MS
}

/**
 * Builds privacy-filtered aggregate ecosystem events from stored accounts.
 */
export function buildSiteEcosystemAnalyticsEvents(
  accounts: SiteAccount[],
): SiteEcosystemEvent[] {
  const siteKeys = new Set<string>()
  const knownSiteTypes = new Set<ProductAnalyticsSiteType>()
  const siteTypeCounts = new Map<ProductAnalyticsSiteType, number>()
  const orderedSiteTypes: ProductAnalyticsSiteType[] = [
    ...PRODUCT_ANALYTICS_SITE_TYPES.filter(
      (siteType) => siteType !== SITE_TYPES.UNKNOWN,
    ),
    SITE_TYPES.UNKNOWN,
  ]
  let unknownSiteCount = 0
  let managedSiteCount = 0

  for (const account of accounts) {
    siteKeys.add(getSiteKeyWithoutExportingIt(account))

    const siteType = normalizeSiteType(account.site_type)
    siteTypeCounts.set(siteType, (siteTypeCounts.get(siteType) ?? 0) + 1)

    if (siteType === SITE_TYPES.UNKNOWN) {
      unknownSiteCount += 1
    } else {
      knownSiteTypes.add(siteType)
    }

    if (isManagedSiteType(siteType)) {
      managedSiteCount += 1
    }
  }

  return [
    {
      eventName: PRODUCT_ANALYTICS_EVENTS.SiteEcosystemSnapshot,
      properties: {
        total_account_count_bucket: bucketCount(accounts.length),
        distinct_site_count_bucket: bucketCount(siteKeys.size),
        known_site_type_count_bucket: bucketCount(knownSiteTypes.size),
        unknown_site_count_bucket: bucketCount(unknownSiteCount),
        managed_site_count_bucket: bucketCount(managedSiteCount),
      },
    },
    ...orderedSiteTypes
      .filter((siteType) => siteTypeCounts.has(siteType))
      .map(
        (siteType): SiteTypePresentEvent => ({
          eventName: PRODUCT_ANALYTICS_EVENTS.SiteTypePresent,
          properties: {
            site_type: siteType,
            account_count_bucket: bucketCount(
              siteTypeCounts.get(siteType) ?? 0,
            ),
          },
        }),
      ),
  ]
}
