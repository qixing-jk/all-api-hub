import { describe, expect, it, vi } from "vitest"

import {
  PRODUCT_ANNOUNCEMENT_ANALYTICS_ACTION_KINDS,
  trackProductAnnouncementAction,
} from "~/features/ProductAnnouncements/analytics"
import { PRODUCT_ANALYTICS_EVENTS } from "~/services/productAnalytics/events"
import type { ProductAnnouncement } from "~/services/productAnnouncements/types"

const trackProductAnalyticsEventMock = vi.hoisted(() => vi.fn())

vi.mock("~/services/productAnalytics/events", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/services/productAnalytics/events")>()

  return {
    ...actual,
    trackProductAnalyticsEvent: trackProductAnalyticsEventMock,
  }
})

const notice = {
  id: "risk",
  revision: 1,
  severity: "critical",
  priority: 100,
  startsAt: 1,
  expiresAt: 2,
  title: "Risk notice",
  message: "Please review.",
  seen: false,
  dismissed: false,
} satisfies ProductAnnouncement

describe("product announcement analytics", () => {
  it("tracks controlled notice metadata when present", () => {
    trackProductAnnouncementAction({
      actionKind: PRODUCT_ANNOUNCEMENT_ANALYTICS_ACTION_KINDS.OpenCta,
      activeCount: 2,
      notice,
      surface: "popup-header",
    })

    expect(trackProductAnalyticsEventMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_EVENTS.FeatureActionCompleted,
      expect.objectContaining({
        action_id: "open_product_announcement_cta",
        surface_id: "popup_product_announcements_header",
        entrypoint: "popup",
        product_announcement_id: "risk",
        product_announcement_severity: "critical",
        product_announcement_active_count: 2,
      }),
    )
  })

  it("omits optional notice and count metadata when absent", () => {
    trackProductAnnouncementAction({
      actionKind: PRODUCT_ANNOUNCEMENT_ANALYTICS_ACTION_KINDS.OpenList,
      surface: "options-header",
    })

    expect(trackProductAnalyticsEventMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_EVENTS.FeatureActionCompleted,
      expect.not.objectContaining({
        product_announcement_id: expect.anything(),
        product_announcement_active_count: expect.anything(),
      }),
    )
  })
})
