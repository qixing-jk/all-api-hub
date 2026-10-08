// Install shared mocks before loading scheduler dependencies.
import "~~/tests/services/autoCheckin/schedulerTestHarness"

import { beforeEach, describe, expect, it, vi } from "vitest"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import { SITE_TYPES } from "~/constants/siteType"
import { accountCheckinRunWorkflow } from "~/services/checkin/autoCheckin/execution/runAccountWorkflow"
import { autoCheckinScheduler } from "~/services/checkin/autoCheckin/scheduling/schedulerCore"
import { DEFAULT_PREFERENCES } from "~/services/preferences/preferencesDefaults"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FAILURE_REASONS,
  PRODUCT_ANALYTICS_FAILURE_STAGES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import { TEMP_WINDOW_REQUEST_SOURCES } from "~/types/tempWindowFetch"
import {
  mockedAccountStorage,
  mockedBrowserApi,
  mockedNotifyTaskResult,
  mockedProductAnalytics,
  mockedUserPreferences,
  resolveProviderForTest,
  RETRY_EXECUTION,
  runnableCheckIn,
  schedulerTestState,
} from "~~/tests/services/autoCheckin/schedulerTestHarness"

describe("retryBatch", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedBrowserApi.hasAlarmsAPI.mockReturnValue(true)
  })
  it("processes mixed retry outcomes and preserves the background post-checkin refresh source", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2024, 0, 1, 9, 30, 0))

    mockedUserPreferences.getPreferences.mockResolvedValue({
      autoCheckin: {
        ...(DEFAULT_PREFERENCES as any).autoCheckin,
        globalEnabled: true,
        notifyUiOnCompletion: true,
        retryStrategy: {
          enabled: true,
          intervalMinutes: 30,
          maxAttemptsPerDay: 3,
        },
      },
    })

    schedulerTestState.storedStatus = {
      lastDailyRunDay: "2024-01-01",
      retryState: {
        day: "2024-01-01",
        pendingAccountIds: ["disabled", "success", "failed"],
        attemptsByAccount: {},
      },
      perAccount: {
        disabled: {
          accountId: "disabled",
          accountName: "Disabled Site · disabled-user",
          status: "failed",
          timestamp: Date.now(),
        },
        success: {
          accountId: "success",
          accountName: "Success Site · success-user",
          status: "failed",
          timestamp: Date.now(),
        },
        failed: {
          accountId: "failed",
          accountName: "Failed Site · failed-user",
          status: "failed",
          timestamp: Date.now(),
        },
      },
      summary: {
        totalEligible: 3,
        executed: 3,
        successCount: 0,
        failedCount: 3,
        skippedCount: 0,
        needsRetry: true,
      },
      accountsSnapshot: [
        { accountId: "disabled", accountName: "Disabled Site · disabled-user" },
        { accountId: "success", accountName: "Success Site · success-user" },
        { accountId: "failed", accountName: "Failed Site · failed-user" },
      ],
    } as any

    const disabledAccount: any = {
      id: "disabled",
      disabled: true,
      site_name: "Disabled Site",
      site_type: SITE_TYPES.VELOERA,
      account_info: { username: "disabled-user" },
      checkIn: runnableCheckIn(),
    }
    const successAccount: any = {
      id: "success",
      disabled: false,
      site_name: "Success Site",
      site_type: SITE_TYPES.VELOERA,
      account_info: { username: "success-user" },
      checkIn: runnableCheckIn(),
    }
    const failedAccount: any = {
      id: "failed",
      disabled: false,
      site_name: "Failed Site",
      site_type: SITE_TYPES.VELOERA,
      account_info: { username: "failed-user" },
      checkIn: runnableCheckIn(),
    }

    mockedAccountStorage.getAllAccounts.mockResolvedValue([
      disabledAccount,
      successAccount,
      failedAccount,
    ])
    mockedAccountStorage.getAccountById.mockImplementation(
      async (id: string) => {
        if (id === "disabled") return disabledAccount
        if (id === "success") return successAccount
        if (id === "failed") return failedAccount
        return null
      },
    )

    const provider = {
      getReadiness: vi.fn(() => ({ ready: true })),
      checkIn: vi.fn(async (account: any, _context?: unknown) => {
        if (account.id === "success") {
          return { status: "success", rawMessage: "ok" }
        }
        return { status: "failed", rawMessage: "boom" }
      }),
    }
    resolveProviderForTest.mockReturnValue(provider)

    const refreshSpy = vi.spyOn(
      accountCheckinRunWorkflow,
      "refreshAccountsAfterSuccessfulCheckins",
    )

    await (autoCheckinScheduler as any).runRetryCheckins(
      TEMP_WINDOW_REQUEST_SOURCES.Background,
      RETRY_EXECUTION,
    )

    expect(provider.checkIn).toHaveBeenCalledTimes(2)
    for (const call of provider.checkIn.mock.calls) {
      expect(call[1]).toEqual({
        tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Background,
        protectionBypassExecution: RETRY_EXECUTION,
      })
    }
    expect(schedulerTestState.storedStatus.perAccount.disabled).toMatchObject({
      status: "skipped",
      reasonCode: "account_disabled",
    })
    expect(schedulerTestState.storedStatus.perAccount.success).toMatchObject({
      status: "success",
    })
    expect(schedulerTestState.storedStatus.perAccount.failed).toMatchObject({
      status: "failed",
    })
    expect(schedulerTestState.storedStatus.retryState).toEqual({
      day: "2024-01-01",
      pendingAccountIds: ["failed"],
      // A skipped account spends nothing and is not recorded; a settled one
      // keeps what it spent, because the ledger is the day, not the queue.
      attemptsByAccount: {
        success: 2,
        failed: 2,
      },
    })
    expect(schedulerTestState.storedStatus.retryState).not.toHaveProperty(
      "tempWindowRequestSource",
    )
    expect(schedulerTestState.storedStatus.retryState).not.toHaveProperty(
      "protectionBypassExecution",
    )
    expect(schedulerTestState.storedStatus.pendingRetry).toBe(true)
    expect(refreshSpy).toHaveBeenCalledWith({
      accountIds: ["success"],
      force: true,
      tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Background,
      protectionBypassExecution: RETRY_EXECUTION,
    })
    expect(mockedBrowserApi.sendRuntimeMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        action: RuntimeActionIds.AutoCheckinRunCompleted,
        runKind: "retry",
        updatedAccountIds: ["success"],
      }),
      { maxAttempts: 1 },
    )

    vi.useRealTimers()
  })

  it("keeps already-checked and uncertain retry outcomes distinct in notifications", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2024, 0, 1, 9, 30, 0))
    mockedUserPreferences.getPreferences.mockResolvedValue({
      autoCheckin: {
        ...DEFAULT_PREFERENCES.autoCheckin!,
        globalEnabled: true,
        notifyUiOnCompletion: false,
        retryStrategy: {
          enabled: true,
          intervalMinutes: 30,
          maxAttemptsPerDay: 3,
        },
      },
    })
    const accounts = ["already", "uncertain"].map((id) => ({
      id,
      site_name: id,
      site_type: SITE_TYPES.VELOERA,
      account_info: { username: id },
      checkIn: runnableCheckIn(),
    }))
    schedulerTestState.storedStatus = {
      lastDailyRunDay: "2024-01-01",
      retryState: {
        day: "2024-01-01",
        pendingAccountIds: ["already", "uncertain"],
        attemptsByAccount: { already: 1, uncertain: 1 },
      },
      perAccount: {},
    } as any
    mockedAccountStorage.getAllAccounts.mockResolvedValue(accounts)
    mockedAccountStorage.getAccountById.mockImplementation(async (id: string) =>
      accounts.find((account) => account.id === id),
    )
    resolveProviderForTest.mockReturnValue({
      getReadiness: vi.fn(() => ({ ready: true })),
      checkIn: vi.fn(async (account: any) =>
        account.id === "already"
          ? { status: "already_checked" }
          : {
              status: "uncertain",
              reconciliation: "unknown",
              retryable: false,
            },
      ),
    })
    await (autoCheckinScheduler as any).runRetryCheckins()
    expect(mockedNotifyTaskResult).toHaveBeenCalledWith({
      task: "autoCheckin",
      status: "partial_success",
      counts: {
        total: 2,
        success: 0,
        alreadyChecked: 1,
        failed: 0,
        uncertain: 1,
        skipped: 0,
      },
    })
    expect(schedulerTestState.storedStatus.perAccount.already.status).toBe(
      "already_checked",
    )
    expect(schedulerTestState.storedStatus.perAccount.uncertain.status).toBe(
      "uncertain",
    )
    // The work list is empty; the day's spent attempts are not forgotten.
    expect(
      schedulerTestState.storedStatus.retryState?.pendingAccountIds,
    ).toEqual([])
    vi.useRealTimers()
  })

  it("tracks retry completion with retry mode and updated result counts", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2024, 0, 1, 9, 30, 0))

    mockedUserPreferences.getPreferences.mockResolvedValue({
      autoCheckin: {
        ...(DEFAULT_PREFERENCES as any).autoCheckin,
        globalEnabled: true,
        notifyUiOnCompletion: false,
        retryStrategy: {
          enabled: true,
          intervalMinutes: 30,
          maxAttemptsPerDay: 3,
        },
      },
    })

    schedulerTestState.storedStatus = {
      lastDailyRunDay: "2024-01-01",
      retryState: {
        day: "2024-01-01",
        pendingAccountIds: ["success", "failed"],
        attemptsByAccount: { success: 1, failed: 1 },
      },
      perAccount: {
        success: {
          accountId: "success",
          accountName: "Success Site · success-user",
          status: "failed",
          timestamp: Date.now(),
        },
        failed: {
          accountId: "failed",
          accountName: "Failed Site · failed-user",
          status: "failed",
          timestamp: Date.now(),
        },
      },
      summary: {
        totalEligible: 2,
        executed: 2,
        successCount: 0,
        failedCount: 2,
        skippedCount: 0,
        needsRetry: true,
      },
    } as any

    const successAccount: any = {
      id: "success",
      disabled: false,
      site_name: "Success Site",
      site_type: SITE_TYPES.VELOERA,
      account_info: { username: "success-user" },
      checkIn: runnableCheckIn(),
    }
    const failedAccount: any = {
      id: "failed",
      disabled: false,
      site_name: "Failed Site",
      site_type: SITE_TYPES.VELOERA,
      account_info: { username: "failed-user" },
      checkIn: runnableCheckIn(),
    }

    mockedAccountStorage.getAllAccounts.mockResolvedValue([
      successAccount,
      failedAccount,
    ])
    mockedAccountStorage.getAccountById.mockImplementation(
      async (id: string) => (id === "success" ? successAccount : failedAccount),
    )

    const provider = {
      getReadiness: vi.fn(() => ({ ready: true })),
      checkIn: vi.fn(async (account: any) =>
        account.id === "success"
          ? { status: "success" }
          : { status: "failed", rawMessage: "boom" },
      ),
    }
    resolveProviderForTest.mockReturnValue(provider)

    await (autoCheckinScheduler as any).runRetryCheckins()

    expect(
      mockedProductAnalytics.trackProductAnalyticsActionCompleted,
    ).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AutoCheckin,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.RunAutoCheckinNow,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.BackgroundAutoCheckinScheduler,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Background,
      result: PRODUCT_ANALYTICS_RESULTS.Failure,
      durationMs: expect.any(Number),
      diagnostics: {
        context: {
          sourceKind: "auto",
          mode: "retry_failed",
        },
        execution: {
          backgroundExecution: true,
          retryAttempted: true,
          retryCount: 2,
        },
        failure: {
          category: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
          reason: PRODUCT_ANALYTICS_FAILURE_REASONS.Unknown,
          stage: PRODUCT_ANALYTICS_FAILURE_STAGES.Execute,
        },
        outcome: {
          itemCount: 2,
          successCount: 1,
          failureCount: 1,
          skippedCount: 0,
        },
      },
    })

    vi.useRealTimers()
  })

  it("keeps the day's counts when every queued account is already out of budget", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2024, 0, 1, 9, 30, 0))

    mockedUserPreferences.getPreferences.mockResolvedValue({
      autoCheckin: {
        ...(DEFAULT_PREFERENCES as any).autoCheckin,
        globalEnabled: true,
        notifyUiOnCompletion: true,
        retryStrategy: {
          enabled: true,
          intervalMinutes: 30,
          maxAttemptsPerDay: 3,
        },
      },
    })

    schedulerTestState.storedStatus = {
      lastDailyRunDay: "2024-01-01",
      retryState: {
        day: "2024-01-01",
        pendingAccountIds: ["exhausted"],
        attemptsByAccount: { exhausted: 3 },
      },
      perAccount: {
        exhausted: {
          accountId: "exhausted",
          accountName: "Exhausted Site · user",
          status: "failed",
          timestamp: Date.now() - 60_000,
        },
      },
      summary: {
        totalEligible: 1,
        executed: 1,
        successCount: 0,
        failedCount: 1,
        skippedCount: 0,
        needsRetry: true,
      },
      pendingRetry: true,
      accountsSnapshot: [
        {
          accountId: "exhausted",
          accountName: "Exhausted Site · user",
        },
      ],
    } as any

    mockedAccountStorage.getAllAccounts.mockResolvedValue([
      {
        id: "exhausted",
        disabled: false,
        site_name: "Exhausted Site",
        site_type: SITE_TYPES.VELOERA,
        account_info: { username: "user" },
        checkIn: runnableCheckIn(),
      },
    ])

    await (autoCheckinScheduler as any).runRetryCheckins()

    expect(mockedAccountStorage.getAccountById).not.toHaveBeenCalled()
    expect(resolveProviderForTest).not.toHaveBeenCalled()
    // The work list is empty; the day's spent attempts are not forgotten.
    expect(
      schedulerTestState.storedStatus.retryState?.pendingAccountIds,
    ).toEqual([])
    expect(schedulerTestState.storedStatus.pendingRetry).toBe(false)
    expect(schedulerTestState.storedStatus.lastRunResult).toBe("failed")
    expect(schedulerTestState.storedStatus.summary).toMatchObject({
      failedCount: 1,
      needsRetry: true,
    })
    expect(mockedBrowserApi.sendRuntimeMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        action: RuntimeActionIds.AutoCheckinRunCompleted,
        runKind: "retry",
        updatedAccountIds: [],
        summary: expect.objectContaining({
          failedCount: 1,
          needsRetry: true,
        }),
      }),
      { maxAttempts: 1 },
    )

    vi.useRealTimers()
  })
})
