import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_EVENTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import {
  PROTECTION_BYPASS_AUTOMATIC_TRIGGERS,
  PROTECTION_BYPASS_DECISION_RESULTS,
  PROTECTION_BYPASS_DENIED_REASONS,
  PROTECTION_BYPASS_EXECUTION_KINDS,
  PROTECTION_BYPASS_FEATURES,
  PROTECTION_BYPASS_OPERATIONS,
} from "~/services/protectionBypass/contracts"

const { captureMock, stateMocks } = vi.hoisted(() => ({
  captureMock: vi.fn(),
  stateMocks: {
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

describe("shield bypass product analytics summary", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-05-12T08:00:00.000Z"))
    captureMock.mockResolvedValue(true)
    stateMocks.getShieldBypassSummaryState.mockResolvedValue({
      day: "2026-05-11",
      promptShownCount: 11,
      promptDismissedCount: 2,
      settingsVisitedCount: 1,
      tempWindowFetchSuccessCount: 3,
      tempWindowFetchFailureCount: 1,
      tempWindowTurnstileFetchSuccessCount: 0,
      tempWindowTurnstileFetchFailureCount: 4,
      featureCounts: { checkin: 4, account_refresh: 2, other: 1 },
      invocationKindCounts: { automatic: 5, user_command: 2 },
      automaticTriggerCounts: { scheduled: 3, retry: 2 },
      operationCounts: { fetch: 2, native_page_action: 5 },
      decisionCounts: { allowed: 3, denied: 2, unavailable: 2 },
      denialReasonCounts: {
        automatic_disabled: 2,
        permission_required: 1,
        policy_unavailable: 1,
        resource_stale: 3,
      },
      adapterCounts: { tab: 2, window: 1 },
    })
    stateMocks.incrementShieldBypassSummary.mockResolvedValue(true)
    stateMocks.replaceShieldBypassSummaryState.mockResolvedValue(true)
  })

  it("records prompt exposure locally instead of sending per-exposure analytics", async () => {
    const { recordShieldBypassPromptShown } = await import(
      "~/services/productAnalytics/shieldBypassSummary"
    )

    await recordShieldBypassPromptShown()

    expect(stateMocks.incrementShieldBypassSummary).toHaveBeenCalledWith({
      promptShownCount: 1,
    })
    expect(captureMock).not.toHaveBeenCalled()
  })

  it("records prompt dismissal and settings visits locally", async () => {
    const {
      recordShieldBypassPromptDismissed,
      recordShieldBypassSettingsVisited,
    } = await import("~/services/productAnalytics/shieldBypassSummary")

    await recordShieldBypassPromptDismissed()
    await recordShieldBypassSettingsVisited()

    expect(stateMocks.incrementShieldBypassSummary).toHaveBeenNthCalledWith(1, {
      promptDismissedCount: 1,
    })
    expect(stateMocks.incrementShieldBypassSummary).toHaveBeenNthCalledWith(2, {
      settingsVisitedCount: 1,
    })
    expect(captureMock).not.toHaveBeenCalled()
  })

  it("records temp-window fetch outcomes locally", async () => {
    const {
      recordShieldBypassTempWindowFetchResult,
      recordShieldBypassTempWindowTurnstileFetchResult,
    } = await import("~/services/productAnalytics/shieldBypassSummary")

    await recordShieldBypassTempWindowFetchResult(
      PRODUCT_ANALYTICS_RESULTS.Success,
    )
    await recordShieldBypassTempWindowFetchResult(
      PRODUCT_ANALYTICS_RESULTS.Failure,
    )
    await recordShieldBypassTempWindowTurnstileFetchResult(
      PRODUCT_ANALYTICS_RESULTS.Success,
    )
    await recordShieldBypassTempWindowTurnstileFetchResult(
      PRODUCT_ANALYTICS_RESULTS.Failure,
    )

    expect(stateMocks.incrementShieldBypassSummary).toHaveBeenNthCalledWith(1, {
      tempWindowFetchSuccessCount: 1,
    })
    expect(stateMocks.incrementShieldBypassSummary).toHaveBeenNthCalledWith(2, {
      tempWindowFetchFailureCount: 1,
    })
    expect(stateMocks.incrementShieldBypassSummary).toHaveBeenNthCalledWith(3, {
      tempWindowTurnstileFetchSuccessCount: 1,
    })
    expect(stateMocks.incrementShieldBypassSummary).toHaveBeenNthCalledWith(4, {
      tempWindowTurnstileFetchFailureCount: 1,
    })
    expect(captureMock).not.toHaveBeenCalled()
  })

  it("records one privacy-safe marginal patch per final policy decision", async () => {
    const { recordProtectionBypassDecision } = await import(
      "~/services/productAnalytics/shieldBypassSummary"
    )

    await recordProtectionBypassDecision({
      feature: PROTECTION_BYPASS_FEATURES.Checkin,
      invocationKind: PROTECTION_BYPASS_EXECUTION_KINDS.Automatic,
      automaticTrigger: PROTECTION_BYPASS_AUTOMATIC_TRIGGERS.Scheduled,
      operation: PROTECTION_BYPASS_OPERATIONS.NativePageAction,
      decision: PROTECTION_BYPASS_DECISION_RESULTS.Denied,
      denialReason: PROTECTION_BYPASS_DENIED_REASONS.AutomaticDisabled,
    })

    expect(stateMocks.incrementShieldBypassSummary).toHaveBeenCalledWith({
      featureCounts: { checkin: 1 },
      invocationKindCounts: { automatic: 1 },
      automaticTriggerCounts: { scheduled: 1 },
      operationCounts: { native_page_action: 1 },
      decisionCounts: { denied: 1 },
      denialReasonCounts: { automatic_disabled: 1 },
    })
    expect(
      JSON.stringify(stateMocks.incrementShieldBypassSummary.mock.calls),
    ).not.toMatch(
      /grant|request|https?:|origin|host|account|raw|message|error/i,
    )
    expect(captureMock).not.toHaveBeenCalled()
  })

  it("uploads one exact daily summary and rolls the local state forward", async () => {
    const { flushShieldBypassDailySummary } = await import(
      "~/services/productAnalytics/shieldBypassSummary"
    )

    await expect(flushShieldBypassDailySummary()).resolves.toBe(true)

    expect(captureMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_EVENTS.ShieldBypassSummaryCaptured,
      {
        feature_id: PRODUCT_ANALYTICS_FEATURE_IDS.ShieldBypassAssist,
        surface_id:
          PRODUCT_ANALYTICS_SURFACE_IDS.BackgroundShieldBypassTempContext,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Background,
        shield_bypass_prompt_shown_count: 11,
        shield_bypass_prompt_dismissed_count: 2,
        shield_bypass_settings_visited_count: 1,
        temp_window_fetch_success_count: 3,
        temp_window_fetch_failure_count: 1,
        temp_window_turnstile_fetch_success_count: 0,
        temp_window_turnstile_fetch_failure_count: 4,
        protection_bypass_feature_account_refresh_count: 2,
        protection_bypass_feature_checkin_count: 4,
        protection_bypass_feature_other_count: 1,
        protection_bypass_invocation_automatic_count: 5,
        protection_bypass_invocation_user_command_count: 2,
        protection_bypass_trigger_scheduled_count: 3,
        protection_bypass_trigger_retry_count: 2,
        protection_bypass_operation_fetch_count: 2,
        protection_bypass_operation_native_page_action_count: 5,
        protection_bypass_decision_allowed_count: 3,
        protection_bypass_decision_denied_count: 2,
        protection_bypass_decision_unavailable_count: 2,
        protection_bypass_denial_automatic_disabled_count: 2,
        protection_bypass_denial_permission_required_count: 1,
        protection_bypass_denial_policy_unavailable_count: 1,
        protection_bypass_denial_resource_stale_count: 3,
        protection_bypass_adapter_tab_count: 2,
        protection_bypass_adapter_window_count: 1,
      },
    )
    expect(stateMocks.replaceShieldBypassSummaryState).toHaveBeenCalledWith({
      day: "2026-05-12",
      promptShownCount: 0,
      promptDismissedCount: 0,
      settingsVisitedCount: 0,
      tempWindowFetchSuccessCount: 0,
      tempWindowFetchFailureCount: 0,
      tempWindowTurnstileFetchSuccessCount: 0,
      tempWindowTurnstileFetchFailureCount: 0,
      featureCounts: {},
      invocationKindCounts: {},
      automaticTriggerCounts: {},
      operationCounts: {},
      decisionCounts: {},
      denialReasonCounts: {},
      adapterCounts: {},
    })
  })

  it("does not roll local state forward when daily summary upload fails", async () => {
    captureMock.mockResolvedValue(false)
    const { flushShieldBypassDailySummary } = await import(
      "~/services/productAnalytics/shieldBypassSummary"
    )

    await expect(flushShieldBypassDailySummary()).resolves.toBe(false)

    expect(captureMock).toHaveBeenCalledTimes(1)
    expect(stateMocks.replaceShieldBypassSummaryState).not.toHaveBeenCalled()
  })

  it("keeps same-day summary local until the next UTC day", async () => {
    stateMocks.getShieldBypassSummaryState.mockResolvedValue({
      day: "2026-05-12",
      promptShownCount: 5,
    })
    const { flushShieldBypassDailySummary } = await import(
      "~/services/productAnalytics/shieldBypassSummary"
    )

    await expect(flushShieldBypassDailySummary()).resolves.toBe(false)

    expect(captureMock).not.toHaveBeenCalled()
    expect(stateMocks.replaceShieldBypassSummaryState).not.toHaveBeenCalled()
  })

  it("does not upload an empty previous-day summary", async () => {
    stateMocks.getShieldBypassSummaryState.mockResolvedValue({
      day: "2026-05-11",
      promptShownCount: 0,
      promptDismissedCount: 0,
      settingsVisitedCount: 0,
      tempWindowFetchSuccessCount: 0,
      tempWindowFetchFailureCount: 0,
      tempWindowTurnstileFetchSuccessCount: 0,
      tempWindowTurnstileFetchFailureCount: 0,
    })
    const { flushShieldBypassDailySummary } = await import(
      "~/services/productAnalytics/shieldBypassSummary"
    )

    await expect(flushShieldBypassDailySummary()).resolves.toBe(false)

    expect(captureMock).not.toHaveBeenCalled()
    expect(stateMocks.replaceShieldBypassSummaryState).not.toHaveBeenCalled()
  })
})
