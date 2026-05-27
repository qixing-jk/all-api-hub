import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_EVENTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/events"

const { captureMock, preferenceMocks } = vi.hoisted(() => ({
  captureMock: vi.fn(),
  preferenceMocks: {
    getShieldBypassSummaryState: vi.fn(),
    incrementShieldBypassSummary: vi.fn(),
    replaceShieldBypassSummaryState: vi.fn(),
  },
}))

vi.mock("~/services/productAnalytics/client", () => ({
  productAnalyticsClient: {
    capture: captureMock,
  },
}))

vi.mock("~/services/productAnalytics/preferences", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("~/services/productAnalytics/preferences")
    >()
  return {
    ...actual,
    productAnalyticsPreferences: {
      ...actual.productAnalyticsPreferences,
      ...preferenceMocks,
    },
  }
})

describe("shield bypass product analytics summary", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-05-12T08:00:00.000Z"))
    captureMock.mockResolvedValue(true)
    preferenceMocks.getShieldBypassSummaryState.mockResolvedValue({
      day: "2026-05-11",
      promptShownCount: 11,
      promptDismissedCount: 2,
      settingsVisitedCount: 1,
      tempWindowFetchSuccessCount: 3,
      tempWindowFetchFailureCount: 1,
      tempWindowTurnstileFetchSuccessCount: 0,
      tempWindowTurnstileFetchFailureCount: 4,
    })
    preferenceMocks.incrementShieldBypassSummary.mockResolvedValue(true)
    preferenceMocks.replaceShieldBypassSummaryState.mockResolvedValue(true)
  })

  it("records prompt exposure locally instead of sending per-exposure analytics", async () => {
    const { recordShieldBypassPromptShown } = await import(
      "~/services/productAnalytics/shieldBypassSummary"
    )

    await recordShieldBypassPromptShown()

    expect(preferenceMocks.incrementShieldBypassSummary).toHaveBeenCalledWith({
      promptShownCount: 1,
    })
    expect(captureMock).not.toHaveBeenCalled()
  })

  it("uploads one bucketed daily summary and rolls the local state forward", async () => {
    const { flushShieldBypassDailySummary } = await import(
      "~/services/productAnalytics/shieldBypassSummary"
    )

    await expect(flushShieldBypassDailySummary()).resolves.toBe(true)

    expect(captureMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_EVENTS.FeatureActionCompleted,
      {
        feature_id: PRODUCT_ANALYTICS_FEATURE_IDS.ShieldBypassAssist,
        action_id: PRODUCT_ANALYTICS_ACTION_IDS.SummarizeShieldBypassDaily,
        surface_id:
          PRODUCT_ANALYTICS_SURFACE_IDS.BackgroundShieldBypassTempContext,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Background,
        result: PRODUCT_ANALYTICS_RESULTS.Success,
        shield_bypass_prompt_shown_count_bucket: "10_plus",
        shield_bypass_prompt_dismissed_count_bucket: "2_3",
        shield_bypass_settings_visited_count_bucket: "1",
        temp_window_fetch_success_count_bucket: "2_3",
        temp_window_fetch_failure_count_bucket: "1",
        temp_window_turnstile_fetch_success_count_bucket: "0",
        temp_window_turnstile_fetch_failure_count_bucket: "4_10",
      },
    )
    expect(
      preferenceMocks.replaceShieldBypassSummaryState,
    ).toHaveBeenCalledWith({
      day: "2026-05-12",
      promptShownCount: 0,
      promptDismissedCount: 0,
      settingsVisitedCount: 0,
      tempWindowFetchSuccessCount: 0,
      tempWindowFetchFailureCount: 0,
      tempWindowTurnstileFetchSuccessCount: 0,
      tempWindowTurnstileFetchFailureCount: 0,
    })
  })

  it("keeps same-day summary local until the next UTC day", async () => {
    preferenceMocks.getShieldBypassSummaryState.mockResolvedValue({
      day: "2026-05-12",
      promptShownCount: 5,
    })
    const { flushShieldBypassDailySummary } = await import(
      "~/services/productAnalytics/shieldBypassSummary"
    )

    await expect(flushShieldBypassDailySummary()).resolves.toBe(false)

    expect(captureMock).not.toHaveBeenCalled()
    expect(
      preferenceMocks.replaceShieldBypassSummaryState,
    ).not.toHaveBeenCalled()
  })
})
