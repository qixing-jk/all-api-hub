import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_EVENTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_PRODUCT_ANNOUNCEMENT_ACTION_KINDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
  trackProductAnalyticsEvent,
  type ProductAnalyticsActionId,
  type ProductAnalyticsEntrypoint,
  type ProductAnalyticsSurfaceId,
} from "~/services/productAnalytics/events"
import type { ProductAnnouncement } from "~/services/productAnnouncements/types"

import type { ProductAnnouncementButtonSurface } from "./ProductAnnouncementButton"

type ProductAnnouncementAnalyticsSurface =
  | ProductAnnouncementButtonSurface
  | "options-banner"

export const PRODUCT_ANNOUNCEMENT_ANALYTICS_ACTION_KINDS = {
  OpenList: PRODUCT_ANALYTICS_PRODUCT_ANNOUNCEMENT_ACTION_KINDS.OpenList,
  Dismiss: PRODUCT_ANALYTICS_PRODUCT_ANNOUNCEMENT_ACTION_KINDS.Dismiss,
  Restore: PRODUCT_ANALYTICS_PRODUCT_ANNOUNCEMENT_ACTION_KINDS.Restore,
  OpenCta: PRODUCT_ANALYTICS_PRODUCT_ANNOUNCEMENT_ACTION_KINDS.OpenCta,
} as const

type ProductAnnouncementAnalyticsActionKind =
  (typeof PRODUCT_ANNOUNCEMENT_ANALYTICS_ACTION_KINDS)[keyof typeof PRODUCT_ANNOUNCEMENT_ANALYTICS_ACTION_KINDS]

const PRODUCT_ANNOUNCEMENT_SURFACE_TO_ANALYTICS = {
  "options-header": {
    surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsProductAnnouncementsHeader,
    entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
  },
  "options-banner": {
    surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsProductAnnouncementsBanner,
    entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
  },
  "popup-header": {
    surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.PopupProductAnnouncementsHeader,
    entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Popup,
  },
} satisfies Record<
  ProductAnnouncementAnalyticsSurface,
  {
    surfaceId: ProductAnalyticsSurfaceId
    entrypoint: ProductAnalyticsEntrypoint
  }
>

const PRODUCT_ANNOUNCEMENT_ACTION_KIND_TO_ACTION = {
  [PRODUCT_ANALYTICS_PRODUCT_ANNOUNCEMENT_ACTION_KINDS.OpenList]:
    PRODUCT_ANALYTICS_ACTION_IDS.OpenProductAnnouncements,
  [PRODUCT_ANALYTICS_PRODUCT_ANNOUNCEMENT_ACTION_KINDS.Dismiss]:
    PRODUCT_ANALYTICS_ACTION_IDS.DismissProductAnnouncement,
  [PRODUCT_ANALYTICS_PRODUCT_ANNOUNCEMENT_ACTION_KINDS.Restore]:
    PRODUCT_ANALYTICS_ACTION_IDS.RestoreProductAnnouncement,
  [PRODUCT_ANALYTICS_PRODUCT_ANNOUNCEMENT_ACTION_KINDS.OpenCta]:
    PRODUCT_ANALYTICS_ACTION_IDS.OpenProductAnnouncementCta,
} satisfies Record<
  ProductAnnouncementAnalyticsActionKind,
  ProductAnalyticsActionId
>

/** Tracks product announcement interactions using only controlled metadata. */
export function trackProductAnnouncementAction({
  actionKind,
  activeCount,
  notice,
  surface,
}: {
  actionKind: ProductAnnouncementAnalyticsActionKind
  activeCount?: number
  notice?: ProductAnnouncement
  surface: ProductAnnouncementAnalyticsSurface
}) {
  const surfaceContext = PRODUCT_ANNOUNCEMENT_SURFACE_TO_ANALYTICS[surface]

  void trackProductAnalyticsEvent(
    PRODUCT_ANALYTICS_EVENTS.FeatureActionCompleted,
    {
      feature_id: PRODUCT_ANALYTICS_FEATURE_IDS.ProductAnnouncements,
      action_id: PRODUCT_ANNOUNCEMENT_ACTION_KIND_TO_ACTION[actionKind],
      surface_id: surfaceContext.surfaceId,
      entrypoint: surfaceContext.entrypoint,
      result: PRODUCT_ANALYTICS_RESULTS.Success,
      product_announcement_action_kind: actionKind,
      ...(notice
        ? {
            product_announcement_id: notice.id,
            product_announcement_severity: notice.severity,
          }
        : {}),
      ...(typeof activeCount === "number"
        ? { product_announcement_active_count: activeCount }
        : {}),
    },
  )
}
