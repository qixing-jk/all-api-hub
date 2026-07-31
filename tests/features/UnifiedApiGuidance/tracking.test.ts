import { beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest"

import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { SITE_TYPES } from "~/constants/siteType"
import {
  trackUnifiedApiGuidanceAction,
  UNIFIED_API_GUIDANCE_ACTION_KINDS,
  UNIFIED_API_GUIDANCE_SOURCE_KINDS,
  UNIFIED_API_GUIDANCE_STATUSES,
  type UnifiedApiGuidanceSurfaceId,
} from "~/features/UnifiedApiGuidance"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_EVENTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_MANAGED_SITE_TYPES,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
  PRODUCT_ANALYTICS_TARGET_KINDS,
} from "~/services/productAnalytics/contracts"

const trackProductAnalyticsEventMock = vi.hoisted(() => vi.fn())

vi.mock("~/services/productAnalytics/dispatch", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("~/services/productAnalytics/dispatch")
    >()

  return {
    ...actual,
    trackProductAnalyticsEvent: trackProductAnalyticsEventMock,
  }
})

describe("trackUnifiedApiGuidanceAction", () => {
  beforeEach(() => {
    trackProductAnalyticsEventMock.mockReset()
    trackProductAnalyticsEventMock.mockReturnValue(true)
  })

  it("limits guidance tracking surfaces to the overview guidance surface", () => {
    expectTypeOf<UnifiedApiGuidanceSurfaceId>().toEqualTypeOf<
      typeof PRODUCT_ANALYTICS_SURFACE_IDS.OptionsOverviewUnifiedApiGuidance
    >()
  })

  it("tracks route-param presence without emitting raw params", () => {
    trackUnifiedApiGuidanceAction({
      model: {
        status: UNIFIED_API_GUIDANCE_STATUSES.NeedsManagedSite,
        sourceKind: UNIFIED_API_GUIDANCE_SOURCE_KINDS.Both,
        managedSiteType: SITE_TYPES.NEW_API,
        modelSyncSupported: true,
        steps: [
          { id: "source", state: "completed" },
          { id: "gateway_settings", state: "current" },
          { id: "gateway_channel", state: "upcoming" },
          { id: "client_access", state: "upcoming" },
        ],
        primaryAction: {
          kind: UNIFIED_API_GUIDANCE_ACTION_KINDS.ConfigureManagedSite,
          target: {
            menuItemId: MENU_ITEM_IDS.BASIC,
            params: {
              anchor: "managed-site-selector",
              highlight: "managed-site-selector",
            },
          },
        },
        secondaryActions: [],
        optionalActions: [],
      },
      action: {
        kind: UNIFIED_API_GUIDANCE_ACTION_KINDS.ConfigureManagedSite,
        target: {
          menuItemId: MENU_ITEM_IDS.BASIC,
          params: {
            anchor: "managed-site-selector",
            highlight: "managed-site-selector",
          },
        },
      },
      surfaceId:
        PRODUCT_ANALYTICS_SURFACE_IDS.OptionsOverviewUnifiedApiGuidance,
    })

    expect(trackProductAnalyticsEventMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_EVENTS.FeatureActionCompleted,
      {
        feature_id: PRODUCT_ANALYTICS_FEATURE_IDS.OptionsOverview,
        action_id: PRODUCT_ANALYTICS_ACTION_IDS.OpenUnifiedApiGuidanceAction,
        surface_id:
          PRODUCT_ANALYTICS_SURFACE_IDS.OptionsOverviewUnifiedApiGuidance,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
        result: PRODUCT_ANALYTICS_RESULTS.Success,
        target_kind: PRODUCT_ANALYTICS_TARGET_KINDS.OptionsPage,
        target_page_id: MENU_ITEM_IDS.BASIC,
        route_params_present: true,
        guidance_status: UNIFIED_API_GUIDANCE_STATUSES.NeedsManagedSite,
        guidance_action_kind:
          UNIFIED_API_GUIDANCE_ACTION_KINDS.ConfigureManagedSite,
        managed_site_type: PRODUCT_ANALYTICS_MANAGED_SITE_TYPES.NewApi,
      },
    )

    expect(
      trackProductAnalyticsEventMock.mock.calls[0]?.[1],
    ).not.toHaveProperty("params")
  })
})
