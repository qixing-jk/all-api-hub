import {
  SPONSOR_RECOMMENDATION_SURFACES,
  type SponsorRecommendationSurface,
} from "~/features/AccountManagement/sponsors/constants"
import {
  SPONSOR_CATALOG_SOURCES,
  SPONSOR_SUPPORT_STATUS,
  type SponsorRecommendation,
} from "~/features/AccountManagement/sponsors/types"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_EVENTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SPONSOR_ACTION_AVAILABILITIES,
  PRODUCT_ANALYTICS_SPONSOR_ACTION_KINDS,
  PRODUCT_ANALYTICS_SPONSOR_CATALOG_SOURCES,
  PRODUCT_ANALYTICS_SPONSOR_SUPPORT_STATUSES,
  PRODUCT_ANALYTICS_SURFACE_IDS,
  trackProductAnalyticsEvent,
  type ProductAnalyticsActionId,
  type ProductAnalyticsSponsorActionAvailability,
  type ProductAnalyticsSponsorCatalogSource,
  type ProductAnalyticsSponsorSupportStatus,
  type ProductAnalyticsSurfaceId,
} from "~/services/productAnalytics/events"
import { recordSponsorRecommendationsSummary } from "~/services/productAnalytics/sponsorRecommendationsSummary"

export const SPONSOR_RECOMMENDATION_ACTION_KINDS = {
  ApiCredentialProfilesFallback:
    PRODUCT_ANALYTICS_SPONSOR_ACTION_KINDS.ApiCredentialProfilesFallback,
  BookmarkFallback: PRODUCT_ANALYTICS_SPONSOR_ACTION_KINDS.BookmarkFallback,
  ContinueAddAccount: PRODUCT_ANALYTICS_SPONSOR_ACTION_KINDS.ContinueAddAccount,
  VisitProvider: PRODUCT_ANALYTICS_SPONSOR_ACTION_KINDS.VisitProvider,
} as const

export type SponsorRecommendationActionKind =
  (typeof SPONSOR_RECOMMENDATION_ACTION_KINDS)[keyof typeof SPONSOR_RECOMMENDATION_ACTION_KINDS]

const SPONSOR_SURFACE_TO_PRODUCT_ANALYTICS_SURFACE = {
  [SPONSOR_RECOMMENDATION_SURFACES.AddAccountDialog]:
    PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementAddAccountSponsorRecommendations,
  [SPONSOR_RECOMMENDATION_SURFACES.Newcomer]:
    PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementNewcomerSponsorRecommendations,
} satisfies Record<SponsorRecommendationSurface, ProductAnalyticsSurfaceId>

const SPONSOR_ACTION_TO_PRODUCT_ANALYTICS_ACTION = {
  [PRODUCT_ANALYTICS_SPONSOR_ACTION_KINDS.ApiCredentialProfilesFallback]:
    PRODUCT_ANALYTICS_ACTION_IDS.OpenSponsorApiCredentialsFollowup,
  [PRODUCT_ANALYTICS_SPONSOR_ACTION_KINDS.BookmarkFallback]:
    PRODUCT_ANALYTICS_ACTION_IDS.OpenSponsorBookmarkFollowup,
  [PRODUCT_ANALYTICS_SPONSOR_ACTION_KINDS.ContinueAddAccount]:
    PRODUCT_ANALYTICS_ACTION_IDS.OpenSponsorAddAccountFollowup,
  [PRODUCT_ANALYTICS_SPONSOR_ACTION_KINDS.VisitProvider]:
    PRODUCT_ANALYTICS_ACTION_IDS.OpenSponsorProvider,
} satisfies Record<SponsorRecommendationActionKind, ProductAnalyticsActionId>

/** Records a visible sponsor recommendation set into the daily summary. */
export async function trackSponsorRecommendationsImpression({
  surface,
  items,
}: {
  surface: SponsorRecommendationSurface
  items: SponsorRecommendation[]
}) {
  if (items.length === 0) return
  const supportedItemCount = items.filter(
    (item) => item.supportStatus === SPONSOR_SUPPORT_STATUS.Supported,
  ).length

  await recordSponsorRecommendationsSummary({
    impressionCount: 1,
    itemTotal: items.length,
    supportedItemTotal: supportedItemCount,
    unsupportedItemTotal: items.length - supportedItemCount,
    addAccountSurfaceCount:
      surface === SPONSOR_RECOMMENDATION_SURFACES.AddAccountDialog ? 1 : 0,
    newcomerSurfaceCount:
      surface === SPONSOR_RECOMMENDATION_SURFACES.Newcomer ? 1 : 0,
  })
}

/** Tracks a sponsor recommendation click without reading URLs or display copy. */
export function trackSponsorRecommendationClick({
  actionKind,
  item,
  itemCount,
  surface,
}: {
  actionKind: SponsorRecommendationActionKind
  item: SponsorRecommendation
  itemCount: number
  surface: SponsorRecommendationSurface
}) {
  void trackProductAnalyticsEvent(
    PRODUCT_ANALYTICS_EVENTS.FeatureActionCompleted,
    {
      feature_id: PRODUCT_ANALYTICS_FEATURE_IDS.SponsorRecommendations,
      action_id: SPONSOR_ACTION_TO_PRODUCT_ANALYTICS_ACTION[actionKind],
      surface_id: resolveProductAnalyticsSponsorSurface(surface),
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      result: PRODUCT_ANALYTICS_RESULTS.Success,
      item_count: itemCount,
      sponsor_action_kind: actionKind,
      sponsor_action_availability: resolveSponsorActionAvailability(item),
      ...(item.selectedLocale
        ? { sponsor_campaign_locale: item.selectedLocale }
        : {}),
      sponsor_catalog_schema_version: item.schemaVersion,
      sponsor_catalog_source: resolveSponsorCatalogSource([item]),
      sponsor_rank: item.rank,
      sponsor_support_status: resolveSponsorSupportStatus(item),
    },
  )
}

/** Maps sponsor recommendation surfaces into the product analytics taxonomy. */
function resolveProductAnalyticsSponsorSurface(
  surface: SponsorRecommendationSurface,
) {
  return SPONSOR_SURFACE_TO_PRODUCT_ANALYTICS_SURFACE[surface]
}

/** Collapses one or more catalog sources into the controlled analytics source set. */
function resolveSponsorCatalogSource(
  items: SponsorRecommendation[],
): ProductAnalyticsSponsorCatalogSource {
  const sources = new Set(items.map((item) => item.source))
  if (sources.size > 1) return PRODUCT_ANALYTICS_SPONSOR_CATALOG_SOURCES.Mixed

  switch (items[0]?.source) {
    case SPONSOR_CATALOG_SOURCES.Cached:
      return PRODUCT_ANALYTICS_SPONSOR_CATALOG_SOURCES.Cached
    case SPONSOR_CATALOG_SOURCES.Remote:
      return PRODUCT_ANALYTICS_SPONSOR_CATALOG_SOURCES.Remote
    case SPONSOR_CATALOG_SOURCES.Bundled:
    default:
      return PRODUCT_ANALYTICS_SPONSOR_CATALOG_SOURCES.Bundled
  }
}

/** Maps normalized support status into product analytics status values. */
function resolveSponsorSupportStatus(
  item: SponsorRecommendation,
): ProductAnalyticsSponsorSupportStatus {
  return item.supportStatus === SPONSOR_SUPPORT_STATUS.Supported
    ? PRODUCT_ANALYTICS_SPONSOR_SUPPORT_STATUSES.Supported
    : PRODUCT_ANALYTICS_SPONSOR_SUPPORT_STATUSES.Unsupported
}

/** Collapses item-level action paths into a controlled analytics dimension. */
function resolveSponsorActionAvailability(
  item: SponsorRecommendation,
): ProductAnalyticsSponsorActionAvailability {
  const hasAddAccount = Boolean(item.actions.addAccount)
  const hasBookmark = Boolean(item.actions.bookmarkFallback)
  const hasApi = Boolean(item.actions.apiCredentialProfileFallback)

  if (hasAddAccount && hasBookmark && hasApi) {
    return PRODUCT_ANALYTICS_SPONSOR_ACTION_AVAILABILITIES.AddAccountBookmarkApi
  }

  if (hasAddAccount && hasBookmark) {
    return PRODUCT_ANALYTICS_SPONSOR_ACTION_AVAILABILITIES.AddAccountBookmark
  }

  if (hasAddAccount && hasApi) {
    return PRODUCT_ANALYTICS_SPONSOR_ACTION_AVAILABILITIES.AddAccountApi
  }

  if (hasBookmark && hasApi) {
    return PRODUCT_ANALYTICS_SPONSOR_ACTION_AVAILABILITIES.BookmarkApi
  }

  if (hasAddAccount) {
    return PRODUCT_ANALYTICS_SPONSOR_ACTION_AVAILABILITIES.AddAccount
  }

  if (hasBookmark) {
    return PRODUCT_ANALYTICS_SPONSOR_ACTION_AVAILABILITIES.Bookmark
  }

  if (hasApi) {
    return PRODUCT_ANALYTICS_SPONSOR_ACTION_AVAILABILITIES.Api
  }

  return PRODUCT_ANALYTICS_SPONSOR_ACTION_AVAILABILITIES.None
}
