import { describe, expect, it, vi } from "vitest"

import {
  buildAutoCheckinAccountGroupProperties,
  buildAutoCheckinConfigSnapshotProperties,
  buildAutoCheckinDiagnostics,
  buildAutoCheckinRunSummaryProperties,
  trackAutoCheckinConfigSnapshot,
} from "~/services/productAnalytics/autoCheckin"
import {
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_EVENTS,
  PRODUCT_ANALYTICS_FAILURE_REASONS,
  PRODUCT_ANALYTICS_FAILURE_STAGES,
  PRODUCT_ANALYTICS_MODE_IDS,
  PRODUCT_ANALYTICS_SETTING_IDS,
  PRODUCT_ANALYTICS_SOURCE_KINDS,
} from "~/services/productAnalytics/events"
import { AuthTypeEnum } from "~/types"
import {
  AUTO_CHECKIN_SCHEDULE_MODE,
  AUTO_CHECKIN_SKIP_REASON,
  CHECKIN_RESULT_STATUS,
} from "~/types/autoCheckin"

const { trackProductAnalyticsEventMock } = vi.hoisted(() => ({
  trackProductAnalyticsEventMock: vi.fn(),
}))

vi.mock("~/services/productAnalytics/events", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("~/services/productAnalytics/events")
  >()),
  trackProductAnalyticsEvent: trackProductAnalyticsEventMock,
}))

describe("auto-checkin product analytics", () => {
  it("builds an exact config snapshot without exporting raw schedule strings", () => {
    const snapshot = buildAutoCheckinConfigSnapshotProperties(
      {
        globalEnabled: true,
        pretriggerDailyOnUiOpen: false,
        notifyUiOnCompletion: true,
        windowStart: "08:15",
        windowEnd: "12:45",
        scheduleMode: AUTO_CHECKIN_SCHEDULE_MODE.DETERMINISTIC,
        deterministicTime: "09:30",
        retryStrategy: {
          enabled: true,
          intervalMinutes: 30,
          maxAttemptsPerDay: 3,
        },
      },
      PRODUCT_ANALYTICS_ENTRYPOINTS.Background,
    )

    expect(snapshot).toEqual({
      setting_id: PRODUCT_ANALYTICS_SETTING_IDS.AutoCheckinConfigSnapshot,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Background,
      global_enabled: true,
      ui_pretrigger_enabled: false,
      notify_completion_enabled: true,
      retry_enabled: true,
      schedule_mode: "deterministic",
      retry_interval_minutes: 30,
      retry_max_attempts: 3,
      window_length_minutes: 270,
      deterministic_time_minutes: 570,
    })
    expect(JSON.stringify(snapshot)).not.toContain("08:15")
    expect(JSON.stringify(snapshot)).not.toContain("12:45")
    expect(JSON.stringify(snapshot)).not.toContain("09:30")
  })

  it("tracks the config snapshot as a snapshot event", () => {
    trackAutoCheckinConfigSnapshot(
      {
        globalEnabled: false,
        pretriggerDailyOnUiOpen: true,
        notifyUiOnCompletion: false,
        windowStart: "20:00",
        windowEnd: "01:00",
        scheduleMode: AUTO_CHECKIN_SCHEDULE_MODE.RANDOM,
        retryStrategy: {
          enabled: false,
          intervalMinutes: 5,
          maxAttemptsPerDay: 1,
        },
      },
      PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    )

    expect(trackProductAnalyticsEventMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_EVENTS.SettingsSnapshotCaptured,
      expect.objectContaining({
        setting_id: PRODUCT_ANALYTICS_SETTING_IDS.AutoCheckinConfigSnapshot,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
        global_enabled: false,
        retry_interval_minutes: 5,
        retry_max_attempts: 1,
        window_length_minutes: 300,
      }),
    )
  })

  it("treats malformed time strings as unset instead of truncating them", () => {
    const snapshot = buildAutoCheckinConfigSnapshotProperties(
      {
        globalEnabled: true,
        pretriggerDailyOnUiOpen: false,
        notifyUiOnCompletion: true,
        windowStart: "08:30:59",
        windowEnd: "12:00",
        scheduleMode: AUTO_CHECKIN_SCHEDULE_MODE.DETERMINISTIC,
        deterministicTime: "09:30:59",
        retryStrategy: {
          enabled: false,
          intervalMinutes: 30,
          maxAttemptsPerDay: 1,
        },
      },
      PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    )

    expect(snapshot.window_length_minutes).toBe(0)
    expect(snapshot.deterministic_time_minutes).toBeUndefined()
  })

  it("normalizes invalid time bounds and keeps long retry settings exact", () => {
    const snapshot = buildAutoCheckinConfigSnapshotProperties(
      {
        globalEnabled: false,
        pretriggerDailyOnUiOpen: true,
        notifyUiOnCompletion: false,
        windowStart: "24:00",
        windowEnd: "12:30",
        scheduleMode: AUTO_CHECKIN_SCHEDULE_MODE.DETERMINISTIC,
        deterministicTime: "18:45",
        retryStrategy: {
          enabled: true,
          intervalMinutes: 90,
          maxAttemptsPerDay: 5,
        },
      },
      PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    )

    expect(snapshot).toEqual(
      expect.objectContaining({
        retry_interval_minutes: 90,
        retry_max_attempts: 5,
        window_length_minutes: 0,
        deterministic_time_minutes: 1125,
      }),
    )
    expect(JSON.stringify(snapshot)).not.toContain("18:45")
  })

  it("keeps short overnight windows and deterministic times exact", () => {
    const snapshot = buildAutoCheckinConfigSnapshotProperties(
      {
        globalEnabled: true,
        pretriggerDailyOnUiOpen: true,
        notifyUiOnCompletion: true,
        windowStart: "23:45",
        windowEnd: "00:15",
        scheduleMode: AUTO_CHECKIN_SCHEDULE_MODE.DETERMINISTIC,
        deterministicTime: "13:30",
        retryStrategy: {
          enabled: true,
          intervalMinutes: 60,
          maxAttemptsPerDay: 2,
        },
      },
      PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    )

    expect(snapshot).toEqual(
      expect.objectContaining({
        retry_interval_minutes: 60,
        retry_max_attempts: 2,
        window_length_minutes: 30,
        deterministic_time_minutes: 810,
      }),
    )
  })

  it("builds raw-number run summaries from snapshots, results, and retry state", () => {
    const properties = buildAutoCheckinRunSummaryProperties({
      runKind: "daily",
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Background,
      retryEnabled: true,
      retryPendingBefore: 0,
      retryAttempted: 0,
      retryRescued: 0,
      retryPendingAfter: 2,
      retryExhausted: 0,
      snapshots: [
        {
          accountId: "one",
          accountName: "One",
          siteType: "new-api",
          detectionEnabled: true,
          autoCheckinEnabled: true,
          providerAvailable: true,
          lastResult: {
            accountId: "one",
            accountName: "One",
            status: CHECKIN_RESULT_STATUS.SUCCESS,
            timestamp: 1,
          },
        },
        {
          accountId: "two",
          accountName: "Two",
          siteType: "Veloera",
          detectionEnabled: true,
          autoCheckinEnabled: true,
          providerAvailable: true,
          lastResult: {
            accountId: "two",
            accountName: "Two",
            status: CHECKIN_RESULT_STATUS.FAILED,
            timestamp: 1,
          },
        },
        {
          accountId: "three",
          accountName: "Three",
          siteType: "one-api",
          detectionEnabled: true,
          autoCheckinEnabled: false,
          providerAvailable: false,
          skipReason: AUTO_CHECKIN_SKIP_REASON.AUTO_CHECKIN_DISABLED,
          lastResult: {
            accountId: "three",
            accountName: "Three",
            status: CHECKIN_RESULT_STATUS.SKIPPED,
            reasonCode: AUTO_CHECKIN_SKIP_REASON.AUTO_CHECKIN_DISABLED,
            timestamp: 1,
          },
        },
        {
          accountId: "four",
          accountName: "Four",
          siteType: "one-hub",
          detectionEnabled: false,
          autoCheckinEnabled: true,
          providerAvailable: false,
          skipReason: AUTO_CHECKIN_SKIP_REASON.DETECTION_DISABLED,
        },
      ],
    })

    expect(properties).toEqual({
      run_kind: "daily",
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Background,
      total_accounts: 4,
      detection_enabled_accounts: 3,
      auto_checkin_enabled_accounts: 3,
      provider_available_accounts: 2,
      runnable_accounts: 2,
      success_count: 1,
      failed_count: 1,
      skipped_count: 2,
      retry_enabled: true,
      retry_pending_before: 0,
      retry_attempted: 0,
      retry_rescued: 0,
      retry_pending_after: 2,
      retry_exhausted: 0,
    })
    expect(JSON.stringify(properties)).not.toContain("one")
    expect(JSON.stringify(properties)).not.toContain("One")
  })

  it("builds grouped Auto Check-in analytics by site type, auth mode, and skip reason", () => {
    const groups = buildAutoCheckinAccountGroupProperties({
      runKind: "retry",
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Background,
      accountsById: new Map([
        ["one", { authType: AuthTypeEnum.AccessToken }],
        ["two", { authType: AuthTypeEnum.Cookie }],
      ]),
      snapshots: [
        {
          accountId: "one",
          accountName: "One",
          siteType: "new-api",
          detectionEnabled: true,
          autoCheckinEnabled: true,
          providerAvailable: true,
          lastResult: {
            accountId: "one",
            accountName: "One",
            status: CHECKIN_RESULT_STATUS.SUCCESS,
            timestamp: 1,
          },
        },
        {
          accountId: "two",
          accountName: "Two",
          siteType: "new-api",
          detectionEnabled: true,
          autoCheckinEnabled: false,
          providerAvailable: false,
          skipReason: AUTO_CHECKIN_SKIP_REASON.AUTO_CHECKIN_DISABLED,
          lastResult: {
            accountId: "two",
            accountName: "Two",
            status: CHECKIN_RESULT_STATUS.SKIPPED,
            reasonCode: AUTO_CHECKIN_SKIP_REASON.AUTO_CHECKIN_DISABLED,
            timestamp: 1,
          },
        },
      ],
    })

    expect(groups).toEqual([
      {
        run_kind: "retry",
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Background,
        site_type: "new-api",
        requested_auth_mode: AuthTypeEnum.AccessToken,
        total_accounts: 1,
        runnable_accounts: 1,
        success_count: 1,
        failed_count: 0,
        skipped_count: 0,
      },
      {
        run_kind: "retry",
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Background,
        site_type: "new-api",
        requested_auth_mode: AuthTypeEnum.Cookie,
        skip_reason: AUTO_CHECKIN_SKIP_REASON.AUTO_CHECKIN_DISABLED,
        total_accounts: 1,
        runnable_accounts: 0,
        success_count: 0,
        failed_count: 0,
        skipped_count: 1,
      },
    ])
  })

  it("builds structured action diagnostics from safe Auto Check-in summary fields", () => {
    const diagnostics = buildAutoCheckinDiagnostics({
      sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.Auto,
      mode: PRODUCT_ANALYTICS_MODE_IDS.TelemetryAuto,
      summary: {
        totalEligible: 4,
        executed: 2,
        successCount: 1,
        failedCount: 1,
        skippedCount: 2,
        needsRetry: true,
      },
      backgroundExecution: true,
      retryAttempted: true,
      retryCount: 2,
      tempContextUsed: false,
      incognitoContextUsed: false,
    })

    expect(diagnostics).toEqual({
      context: {
        sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.Auto,
        mode: PRODUCT_ANALYTICS_MODE_IDS.TelemetryAuto,
      },
      execution: {
        backgroundExecution: true,
        retryAttempted: true,
        retryCount: 2,
        tempContextUsed: false,
        incognitoContextUsed: false,
      },
      outcome: {
        itemCount: 4,
        successCount: 1,
        failureCount: 1,
        skippedCount: 2,
      },
      failure: {
        category: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
        stage: PRODUCT_ANALYTICS_FAILURE_STAGES.Execute,
        reason: PRODUCT_ANALYTICS_FAILURE_REASONS.Unknown,
      },
    })
    expect(JSON.stringify(diagnostics)).not.toContain("accountId")
    expect(JSON.stringify(diagnostics)).not.toContain("accountName")
  })

  it("omits Auto Check-in failure diagnostics when the summary did not fail", () => {
    const diagnostics = buildAutoCheckinDiagnostics({
      sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.Manual,
      mode: PRODUCT_ANALYTICS_MODE_IDS.Selected,
      siteType: "new-api",
      requestedAuthMode: AuthTypeEnum.AccessToken,
      summary: {
        totalEligible: 1,
        executed: 1,
        successCount: 1,
        failedCount: 0,
        skippedCount: 0,
        needsRetry: false,
      },
    })

    expect(diagnostics).toEqual({
      context: {
        sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.Manual,
        mode: PRODUCT_ANALYTICS_MODE_IDS.Selected,
        siteType: "new-api",
        requestedAuthMode: AuthTypeEnum.AccessToken,
      },
      outcome: {
        itemCount: 1,
        successCount: 1,
        failureCount: 0,
        skippedCount: 0,
      },
    })
  })
})
