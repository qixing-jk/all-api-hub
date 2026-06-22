import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_EVENTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
} from "~/services/productAnalytics/events"

const { captureMock, stateMocks } = vi.hoisted(() => ({
  captureMock: vi.fn(),
  stateMocks: {
    getSponsorRecommendationsSummaryState: vi.fn(),
    incrementSponsorRecommendationsSummary: vi.fn(),
    replaceSponsorRecommendationsSummaryState: vi.fn(),
  },
}))

vi.mock("~/services/productAnalytics/client", () => ({
  productAnalyticsClient: {
    capture: captureMock,
  },
}))

vi.mock("~/services/productAnalytics/state", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/services/productAnalytics/state")>()
  return {
    ...actual,
    productAnalyticsState: {
      ...actual.productAnalyticsState,
      ...stateMocks,
    },
  }
})

describe("sponsor recommendations product analytics summary", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-05-12T08:00:00.000Z"))
    captureMock.mockResolvedValue(true)
    stateMocks.getSponsorRecommendationsSummaryState.mockResolvedValue({
      day: "2026-05-11",
      impressionCount: 7,
      itemTotal: 14,
      supportedItemTotal: 9,
      unsupportedItemTotal: 5,
      addAccountSurfaceCount: 4,
      newcomerSurfaceCount: 3,
    })
    stateMocks.incrementSponsorRecommendationsSummary.mockResolvedValue(true)
    stateMocks.replaceSponsorRecommendationsSummaryState.mockResolvedValue(true)
  })

  it("records sponsor recommendation impressions locally instead of sending per-impression analytics", async () => {
    const { recordSponsorRecommendationsSummary } = await import(
      "~/services/productAnalytics/sponsorRecommendationsSummary"
    )

    await recordSponsorRecommendationsSummary({
      impressionCount: 1,
      itemTotal: 2,
      supportedItemTotal: 1,
      unsupportedItemTotal: 1,
      addAccountSurfaceCount: 1,
    })

    expect(
      stateMocks.incrementSponsorRecommendationsSummary,
    ).toHaveBeenCalledWith({
      impressionCount: 1,
      itemTotal: 2,
      supportedItemTotal: 1,
      unsupportedItemTotal: 1,
      addAccountSurfaceCount: 1,
    })
    expect(captureMock).not.toHaveBeenCalled()
  })

  it("uploads one daily summary and rolls the local state forward", async () => {
    const { flushSponsorRecommendationsDailySummary } = await import(
      "~/services/productAnalytics/sponsorRecommendationsSummary"
    )

    await expect(flushSponsorRecommendationsDailySummary()).resolves.toBe(true)

    expect(captureMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_EVENTS.SponsorRecommendationsDailySummaryCaptured,
      {
        feature_id: PRODUCT_ANALYTICS_FEATURE_IDS.SponsorRecommendations,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Background,
        day: "2026-05-11",
        impression_count: 7,
        item_total: 14,
        supported_item_total: 9,
        unsupported_item_total: 5,
        add_account_surface_count: 4,
        newcomer_surface_count: 3,
      },
    )
    expect(
      stateMocks.replaceSponsorRecommendationsSummaryState,
    ).toHaveBeenCalledWith({
      day: "2026-05-12",
      impressionCount: 0,
      itemTotal: 0,
      supportedItemTotal: 0,
      unsupportedItemTotal: 0,
      addAccountSurfaceCount: 0,
      newcomerSurfaceCount: 0,
    })
  })

  it("keeps same-day summary local until the next UTC day", async () => {
    stateMocks.getSponsorRecommendationsSummaryState.mockResolvedValue({
      day: "2026-05-12",
      impressionCount: 5,
    })
    const { flushSponsorRecommendationsDailySummary } = await import(
      "~/services/productAnalytics/sponsorRecommendationsSummary"
    )

    await expect(flushSponsorRecommendationsDailySummary()).resolves.toBe(false)

    expect(captureMock).not.toHaveBeenCalled()
    expect(
      stateMocks.replaceSponsorRecommendationsSummaryState,
    ).not.toHaveBeenCalled()
  })

  it("does not roll local state forward when daily summary upload fails", async () => {
    captureMock.mockResolvedValue(false)
    const { flushSponsorRecommendationsDailySummary } = await import(
      "~/services/productAnalytics/sponsorRecommendationsSummary"
    )

    await expect(flushSponsorRecommendationsDailySummary()).resolves.toBe(false)

    expect(captureMock).toHaveBeenCalledTimes(1)
    expect(
      stateMocks.replaceSponsorRecommendationsSummaryState,
    ).not.toHaveBeenCalled()
  })

  it("reports failure when rolling the uploaded summary forward fails", async () => {
    stateMocks.replaceSponsorRecommendationsSummaryState.mockResolvedValue(
      false,
    )
    const { flushSponsorRecommendationsDailySummary } = await import(
      "~/services/productAnalytics/sponsorRecommendationsSummary"
    )

    await expect(flushSponsorRecommendationsDailySummary()).resolves.toBe(false)

    expect(captureMock).toHaveBeenCalledTimes(1)
    expect(
      stateMocks.replaceSponsorRecommendationsSummaryState,
    ).toHaveBeenCalledWith({
      day: "2026-05-12",
      impressionCount: 0,
      itemTotal: 0,
      supportedItemTotal: 0,
      unsupportedItemTotal: 0,
      addAccountSurfaceCount: 0,
      newcomerSurfaceCount: 0,
    })
  })

  it("does not upload an empty previous-day summary", async () => {
    stateMocks.getSponsorRecommendationsSummaryState.mockResolvedValue({
      day: "2026-05-11",
      impressionCount: 0,
    })
    const { flushSponsorRecommendationsDailySummary } = await import(
      "~/services/productAnalytics/sponsorRecommendationsSummary"
    )

    await expect(flushSponsorRecommendationsDailySummary()).resolves.toBe(false)

    expect(captureMock).not.toHaveBeenCalled()
    expect(
      stateMocks.replaceSponsorRecommendationsSummaryState,
    ).not.toHaveBeenCalled()
  })
})
