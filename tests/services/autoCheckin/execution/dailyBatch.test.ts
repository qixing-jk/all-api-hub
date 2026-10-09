// Install shared mocks before loading scheduler dependencies.
import "~~/tests/services/autoCheckin/schedulerTestHarness"

import { beforeEach, describe, expect, it, vi } from "vitest"

import { AUTO_CHECKIN_METHOD_IDS } from "~/constants/checkIn"
import { RuntimeActionIds } from "~/constants/runtimeActions"
import { SITE_TYPES } from "~/constants/siteType"
import { accountCheckinRunWorkflow } from "~/services/checkin/autoCheckin/execution/runAccountWorkflow"
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
import { AUTO_CHECKIN_RUN_TYPE } from "~/types/autoCheckin"
import { TEMP_WINDOW_REQUEST_SOURCES } from "~/types/tempWindowFetch"
import {
  createDeferred,
  expectRecordedRetryDecision,
  mockedAccountStorage,
  mockedBrowserApi,
  mockedMethods,
  mockedProductAnalytics,
  mockedUserPreferences,
  resolveProviderForTest,
  runCheckinsForTest,
  runnableCheckIn,
  SCHEDULED_EXECUTION,
  schedulerTestState,
} from "~~/tests/services/autoCheckin/schedulerTestHarness"

describe("dailyBatch", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedBrowserApi.hasAlarmsAPI.mockReturnValue(true)
  })
  it("tracks daily scheduled completion with sanitized product analytics counts", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2024, 0, 1, 9, 0, 0))

    mockedUserPreferences.getPreferences.mockResolvedValue({
      autoCheckin: {
        ...(DEFAULT_PREFERENCES as any).autoCheckin,
        globalEnabled: true,
        notifyUiOnCompletion: false,
        retryStrategy: {
          enabled: false,
          intervalMinutes: 30,
          maxAttemptsPerDay: 3,
        },
      },
    })

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
    const skippedAccount: any = {
      id: "skipped",
      disabled: false,
      site_name: "Skipped Site",
      site_type: SITE_TYPES.VELOERA,
      account_info: { username: "skipped-user" },
      checkIn: runnableCheckIn(false),
    }

    mockedAccountStorage.getAllAccounts.mockResolvedValue([
      successAccount,
      failedAccount,
      skippedAccount,
    ])

    const provider = {
      getReadiness: vi.fn(() => ({ ready: true })),
      checkIn: vi.fn(async (account: any) =>
        account.id === "success"
          ? { status: "success" }
          : { status: "failed", rawMessage: "boom" },
      ),
    }
    resolveProviderForTest.mockReturnValue(provider)

    await runCheckinsForTest({
      runType: AUTO_CHECKIN_RUN_TYPE.DAILY,
    })

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
          mode: "telemetry_auto",
        },
        execution: {
          backgroundExecution: true,
          retryAttempted: false,
          retryCount: 0,
        },
        failure: {
          category: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
          reason: PRODUCT_ANALYTICS_FAILURE_REASONS.Unknown,
          stage: PRODUCT_ANALYTICS_FAILURE_STAGES.Execute,
        },
        outcome: {
          itemCount: 3,
          successCount: 1,
          failureCount: 1,
          skippedCount: 1,
        },
      },
    })

    vi.useRealTimers()
  })

  it("builds retry queue from failed accounts only and does not skip isCheckedInToday accounts", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2024, 0, 1, 9, 0, 0))

    mockedUserPreferences.getPreferences.mockResolvedValue({
      autoCheckin: {
        globalEnabled: true,
        windowStart: "08:00",
        windowEnd: "10:00",
        scheduleMode: "random",
        deterministicTime: "08:00",
        retryStrategy: {
          enabled: true,
          intervalMinutes: 30,
          maxAttemptsPerDay: 3,
        },
      },
    })

    const accountA: any = {
      id: "a",
      disabled: false,
      site_name: "SiteA",
      site_type: SITE_TYPES.VELOERA,
      account_info: { username: "user-a" },
      checkIn: runnableCheckIn(),
    }
    const accountB: any = {
      id: "b",
      disabled: false,
      site_name: "SiteB",
      site_type: SITE_TYPES.VELOERA,
      account_info: { username: "user-b" },
      checkIn: runnableCheckIn(),
    }

    mockedAccountStorage.getAllAccounts.mockResolvedValue([accountA, accountB])

    const provider = {
      getReadiness: vi.fn(() => ({ ready: true })),
      checkIn: vi.fn(async (account: any, _context?: unknown) => {
        if (account.id === "a") {
          return { status: "already_checked" }
        }
        return { status: "failed", rawMessage: "boom" }
      }),
    }
    resolveProviderForTest.mockReturnValue(provider)

    await runCheckinsForTest({
      runType: AUTO_CHECKIN_RUN_TYPE.DAILY,
    })

    expect(provider.checkIn).toHaveBeenCalledTimes(2)
    expect(provider.checkIn.mock.calls.map((call) => call[0].id)).toEqual(
      expect.arrayContaining(["a", "b"]),
    )
    expect(provider.checkIn.mock.calls.map((call) => call[1])).toEqual([
      {
        tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Background,
        protectionBypassExecution: SCHEDULED_EXECUTION,
      },
      {
        tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Background,
        protectionBypassExecution: SCHEDULED_EXECUTION,
      },
    ])

    expect(schedulerTestState.storedStatus.lastDailyRunDay).toBe("2024-01-01")
    expect(schedulerTestState.storedStatus.perAccount.a.status).toBe(
      "already_checked",
    )
    expect(schedulerTestState.storedStatus.retryState.day).toBe("2024-01-01")
    expect(
      schedulerTestState.storedStatus.retryState.pendingAccountIds,
    ).toEqual(["b"])
    expect(
      schedulerTestState.storedStatus.retryState.attemptsByAccount,
    ).toEqual({ b: 1 })
    expect(schedulerTestState.storedStatus.pendingRetry).toBe(true)

    vi.useRealTimers()
  })

  it("does not enqueue a failed account when its method cannot be retried safely", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2024, 0, 1, 9, 0, 0))

    mockedUserPreferences.getPreferences.mockResolvedValue({
      autoCheckin: {
        globalEnabled: true,
        windowStart: "08:00",
        windowEnd: "10:00",
        scheduleMode: "random",
        deterministicTime: "08:00",
        retryStrategy: {
          enabled: true,
          intervalMinutes: 30,
          maxAttemptsPerDay: 3,
        },
      },
    })

    const account: any = {
      id: "no-safe-readback",
      disabled: false,
      site_name: "Example Site",
      site_type: SITE_TYPES.ANYROUTER,
      account_info: { username: "example-user" },
      checkIn: runnableCheckIn(true, SITE_TYPES.ANYROUTER),
    }
    mockedAccountStorage.getAllAccounts.mockResolvedValue([account])
    resolveProviderForTest.mockReturnValue({
      getReadiness: vi.fn(() => ({ ready: true })),
      checkIn: vi.fn(async () => ({
        status: "failed",
        rawMessage: "Example failure",
        retryable: false,
      })),
    })

    await runCheckinsForTest({ runType: AUTO_CHECKIN_RUN_TYPE.DAILY })

    expect(
      schedulerTestState.storedStatus.perAccount[account.id],
    ).toMatchObject({
      status: "failed",
      retryable: false,
    })
    expect(schedulerTestState.storedStatus.retryState).toBeUndefined()
    expect(schedulerTestState.storedStatus.pendingRetry).toBe(false)

    vi.useRealTimers()
  })

  it("dispatches every eligible account without a scheduler batch barrier", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2024, 0, 1, 9, 0, 0))

    mockedUserPreferences.getPreferences.mockResolvedValue({
      ...(DEFAULT_PREFERENCES as any),
      autoCheckin: {
        ...(DEFAULT_PREFERENCES as any).autoCheckin,
        globalEnabled: true,
        notifyUiOnCompletion: false,
        retryStrategy: {
          enabled: false,
          intervalMinutes: 30,
          maxAttemptsPerDay: 3,
        },
      },
    })

    const accounts = Array.from({ length: 5 }, (_, index) => ({
      id: `account-${index + 1}`,
      disabled: false,
      site_name: `Site ${index + 1}`,
      site_type: SITE_TYPES.VELOERA,
      account_info: { username: `user-${index + 1}` },
      checkIn: runnableCheckIn(),
    }))
    mockedAccountStorage.getAllAccounts.mockResolvedValue(accounts)

    const deferredCheckins: Array<
      ReturnType<typeof createDeferred<{ status: "success" }>>
    > = []
    const provider = {
      getReadiness: vi.fn(() => ({ ready: true })),
      checkIn: vi.fn(() => {
        const deferred = createDeferred<{ status: "success" }>()
        deferredCheckins.push(deferred)
        return deferred.promise
      }),
    }
    resolveProviderForTest.mockReturnValue(provider)

    const runPromise = runCheckinsForTest({
      runType: AUTO_CHECKIN_RUN_TYPE.DAILY,
    })

    try {
      await vi.waitFor(() => {
        expect(provider.checkIn).toHaveBeenCalledTimes(5)
      })
      deferredCheckins.forEach((deferred) => {
        deferred.resolve({ status: "success" })
      })
      await runPromise

      expect(schedulerTestState.storedStatus.summary).toMatchObject({
        executed: 5,
        successCount: 5,
        failedCount: 0,
      })
    } finally {
      vi.useRealTimers()
    }
  })

  it("isolates an unexpected account rejection without aborting the run", async () => {
    mockedUserPreferences.getPreferences.mockResolvedValue({
      autoCheckin: {
        ...(DEFAULT_PREFERENCES as any).autoCheckin,
        globalEnabled: true,
        notifyUiOnCompletion: false,
        retryStrategy: {
          enabled: false,
          intervalMinutes: 30,
          maxAttemptsPerDay: 3,
        },
      },
    })

    const accounts = Array.from({ length: 4 }, (_, index) => ({
      id: `account-${index + 1}`,
      disabled: false,
      site_name: `Site ${index + 1}`,
      site_type: SITE_TYPES.VELOERA,
      account_info: { username: `user-${index + 1}` },
      checkIn: runnableCheckIn(),
    }))
    mockedAccountStorage.getAllAccounts.mockResolvedValue(accounts)

    const provider = {
      getReadiness: vi.fn(() => ({ ready: true })),
      checkIn: vi.fn(async () => ({ status: "success" })),
    }
    resolveProviderForTest.mockReturnValue(provider)

    const runAccountCheckinSpy = vi
      .spyOn(accountCheckinRunWorkflow, "runAccountCheckin")
      .mockImplementation(async (...args: unknown[]) => {
        const account = args[0] as any
        const accountName = args[1] as string
        if (account.id === "account-2") {
          throw new Error("unexpected task failure")
        }
        return {
          result: {
            accountId: account.id,
            accountName,
            status: "success",
            timestamp: Date.now(),
          },
          successful: true,
        }
      })

    await runCheckinsForTest({
      runType: AUTO_CHECKIN_RUN_TYPE.DAILY,
    })

    expect(runAccountCheckinSpy).toHaveBeenCalledTimes(4)
    expect(schedulerTestState.storedStatus.lastRunResult).toBe("partial")
    expect(schedulerTestState.storedStatus.summary).toMatchObject({
      executed: 4,
      successCount: 3,
      failedCount: 1,
    })
    expect(
      schedulerTestState.storedStatus.perAccount["account-2"],
    ).toMatchObject({
      status: "failed",
      rawMessage: "Error: unexpected task failure",
    })

    runAccountCheckinSpy.mockRestore()
  })

  it("does not create a retry queue when daily failures already reached the max-attempts boundary", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2024, 0, 1, 9, 0, 0))

    mockedUserPreferences.getPreferences.mockResolvedValue({
      autoCheckin: {
        ...(DEFAULT_PREFERENCES as any).autoCheckin,
        globalEnabled: true,
        retryStrategy: {
          enabled: true,
          intervalMinutes: 30,
          maxAttemptsPerDay: 1,
        },
      },
    })

    const account: any = {
      id: "daily-fail-1",
      disabled: false,
      site_name: "Boundary Site",
      site_type: SITE_TYPES.VELOERA,
      account_info: { username: "user" },
      checkIn: runnableCheckIn(),
    }

    mockedAccountStorage.getAllAccounts.mockResolvedValue([account])

    const provider = {
      getReadiness: vi.fn(() => ({ ready: true })),
      checkIn: vi.fn(async () => ({ status: "failed", rawMessage: "boom" })),
    }
    resolveProviderForTest.mockReturnValue(provider)

    await runCheckinsForTest({
      runType: AUTO_CHECKIN_RUN_TYPE.DAILY,
    })

    expect(provider.checkIn).toHaveBeenCalledTimes(1)
    expect(schedulerTestState.storedStatus.lastDailyRunDay).toBe("2024-01-01")
    expect(schedulerTestState.storedStatus.lastRunResult).toBe("failed")
    expect(schedulerTestState.storedStatus.summary).toMatchObject({
      totalEligible: 1,
      executed: 1,
      successCount: 0,
      failedCount: 1,
      needsRetry: true,
    })
    // The work list is empty; the day's spent attempts are not forgotten.
    expect(
      schedulerTestState.storedStatus.retryState?.pendingAccountIds,
    ).toEqual([])
    expect(schedulerTestState.storedStatus.pendingRetry).toBe(false)

    vi.useRealTimers()
  })

  it.each([
    { reason: "network_error", retryable: true },
    { reason: "account_unavailable", retryable: false },
    // A status read that failed for any reason but authentication or
    // permission is worth another pass, so it keeps its place in the queue.
    { reason: "status_unavailable", retryable: true },
  ])(
    "persists blocked $reason as a failure with explicit retry policy",
    async ({ reason, retryable }) => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date(2024, 0, 1, 9, 30, 0))
      mockedUserPreferences.getPreferences.mockResolvedValue({
        autoCheckin: {
          ...DEFAULT_PREFERENCES.autoCheckin,
          globalEnabled: true,
          retryStrategy: {
            enabled: true,
            intervalMinutes: 30,
            maxAttemptsPerDay: 3,
          },
        },
      })
      const account = {
        id: "blocked-account",
        disabled: false,
        site_name: "Example Site",
        site_type: SITE_TYPES.VELOERA,
        account_info: { username: "example-user" },
        checkIn: runnableCheckIn(),
      }
      mockedAccountStorage.getAllAccounts.mockResolvedValue([account])
      resolveProviderForTest.mockReturnValue({
        getReadiness: vi.fn(() => ({ ready: true })),
        checkIn: vi.fn(),
      })
      mockedMethods.executeSelectedCheckIn.mockResolvedValueOnce({
        kind: "blocked",
        reason,
        retryable,
      })
      await runCheckinsForTest({ runType: AUTO_CHECKIN_RUN_TYPE.DAILY })
      expectRecordedRetryDecision(
        schedulerTestState.storedStatus.perAccount[account.id],
      )
      expect(
        schedulerTestState.storedStatus.perAccount[account.id],
      ).toMatchObject({
        status: "failed",
        reasonCode: reason,
        retryable,
        messageKey: `autoCheckin:skipReasons.${reason}`,
      })
      expect(
        schedulerTestState.storedStatus.retryState?.pendingAccountIds ?? [],
      ).toEqual(retryable ? [account.id] : [])
      vi.useRealTimers()
    },
  )

  it.each([
    {
      name: "a retryable cause the provider refused to flag",
      // What the execution layer decides for `session_busy` today.
      execution: {
        status: "failed",
        reasonCode: "session_busy",
        retryable: true,
      },
      queued: true,
    },
    {
      name: "a dead end the provider tried to flag as retryable",
      execution: {
        status: "failed",
        reasonCode: "authentication_required",
        retryable: false,
      },
      queued: false,
    },
    {
      name: "an uncertain outcome",
      execution: {
        status: "uncertain",
        reconciliation: "unavailable",
        retryable: true,
      },
      queued: true,
    },
  ])("stores one retry decision for $name", async ({ execution, queued }) => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2024, 0, 1, 9, 30, 0))
    mockedUserPreferences.getPreferences.mockResolvedValue({
      autoCheckin: {
        ...DEFAULT_PREFERENCES.autoCheckin,
        globalEnabled: true,
        retryStrategy: {
          enabled: true,
          intervalMinutes: 30,
          maxAttemptsPerDay: 3,
        },
      },
    })
    const account = {
      id: "decided-account",
      disabled: false,
      site_name: "Decided Site",
      site_type: SITE_TYPES.VELOERA,
      account_info: { username: "decided-user" },
      checkIn: runnableCheckIn(),
    }
    mockedAccountStorage.getAllAccounts.mockResolvedValue([account])
    resolveProviderForTest.mockReturnValue({
      getReadiness: vi.fn(() => ({ ready: true })),
      checkIn: vi.fn(),
    })
    mockedMethods.executeSelectedCheckIn.mockResolvedValueOnce({
      kind: "executed",
      methodId: AUTO_CHECKIN_METHOD_IDS.VeloeraDailyCheckIn,
      result: execution,
      retryable: execution.retryable,
    })

    await runCheckinsForTest({ runType: AUTO_CHECKIN_RUN_TYPE.DAILY })

    const stored = schedulerTestState.storedStatus.perAccount[account.id]
    expectRecordedRetryDecision(stored)
    expect(stored.retryable).toBe(execution.retryable)
    expect(
      schedulerTestState.storedStatus.retryState?.pendingAccountIds ?? [],
    ).toEqual(queued ? [account.id] : [])
    vi.useRealTimers()
  })

  it("does not count a runtime skip as a failure or enqueue a retry", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2024, 0, 1, 9, 0, 0))
    mockedUserPreferences.getPreferences.mockResolvedValue({
      autoCheckin: {
        ...(DEFAULT_PREFERENCES as any).autoCheckin,
        globalEnabled: true,
        retryStrategy: {
          enabled: true,
          intervalMinutes: 30,
          maxAttemptsPerDay: 3,
        },
      },
    })
    mockedAccountStorage.getAllAccounts.mockResolvedValue([
      {
        id: "runtime-skip",
        disabled: false,
        site_name: "Runtime Skip",
        site_type: SITE_TYPES.NEW_API,
        account_info: { username: "user" },
        checkIn: runnableCheckIn(true, SITE_TYPES.NEW_API),
      },
    ])
    resolveProviderForTest.mockReturnValue({
      getReadiness: vi.fn(() => ({ ready: true })),
      checkIn: vi.fn(),
    })
    mockedMethods.executeSelectedCheckIn.mockResolvedValueOnce({
      kind: "skipped",
      reason: "account_data_missing",
    })

    await runCheckinsForTest({ runType: AUTO_CHECKIN_RUN_TYPE.DAILY })

    expect(schedulerTestState.storedStatus.summary).toEqual({
      totalEligible: 1,
      executed: 0,
      successCount: 0,
      failedCount: 0,
      skippedCount: 1,
      needsRetry: false,
    })
    expect(
      schedulerTestState.storedStatus.perAccount["runtime-skip"],
    ).toMatchObject({
      status: "skipped",
      reasonCode: "account_data_missing",
    })
    expect(schedulerTestState.storedStatus.retryState).toBeUndefined()
    expect(schedulerTestState.storedStatus.pendingRetry).toBe(false)

    vi.useRealTimers()
  })

  it("persists an uncertain mutation without adding it to ordinary retry", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2024, 0, 1, 9, 0, 0))
    mockedUserPreferences.getPreferences.mockResolvedValue({
      autoCheckin: {
        ...(DEFAULT_PREFERENCES as any).autoCheckin,
        globalEnabled: true,
        retryStrategy: {
          enabled: true,
          intervalMinutes: 30,
          maxAttemptsPerDay: 3,
        },
      },
    })
    mockedAccountStorage.getAllAccounts.mockResolvedValue([
      {
        id: "uncertain-result",
        disabled: false,
        site_name: "Uncertain Result",
        site_type: SITE_TYPES.NEW_API,
        account_info: { username: "user" },
        checkIn: runnableCheckIn(true, SITE_TYPES.NEW_API),
      },
    ])
    resolveProviderForTest.mockReturnValue({
      getReadiness: vi.fn(() => ({ ready: true })),
      checkIn: vi.fn(),
    })
    mockedMethods.executeSelectedCheckIn.mockResolvedValueOnce({
      kind: "executed",
      methodId: "new-api:daily-checkin",
      result: { status: "uncertain", reconciliation: "unknown" },
      retryable: false,
    })

    await runCheckinsForTest({ runType: AUTO_CHECKIN_RUN_TYPE.DAILY })

    expect(
      schedulerTestState.storedStatus.perAccount["uncertain-result"],
    ).toMatchObject({
      status: "uncertain",
      methodId: "new-api:daily-checkin",
      reconciliation: "unknown",
    })
    expect(schedulerTestState.storedStatus.summary).toMatchObject({
      executed: 1,
      uncertainCount: 1,
      needsRetry: false,
    })
    expect(schedulerTestState.storedStatus.retryState).toBeUndefined()
    expect(schedulerTestState.storedStatus.pendingRetry).toBe(false)

    vi.useRealTimers()
  })

  it("keeps remote success confirmed when local method status persistence fails", async () => {
    mockedMethods.executeSelectedCheckIn.mockResolvedValueOnce({
      kind: "executed",
      methodId: "new-api:daily-checkin",
      result: { status: "success" },
      retryable: false,
    })
    mockedAccountStorage.markAccountAsSiteCheckedIn.mockResolvedValueOnce(false)

    await expect(
      accountCheckinRunWorkflow.runAccountCheckin(
        {
          id: "remote-success",
          site_name: "Remote Success",
          site_type: SITE_TYPES.NEW_API,
          disabled: false,
          account_info: {},
          checkIn: runnableCheckIn(true, SITE_TYPES.NEW_API),
        } as any,
        "Remote Success",
        TEMP_WINDOW_REQUEST_SOURCES.Background,
        SCHEDULED_EXECUTION,
      ),
    ).resolves.toMatchObject({
      result: {
        status: "success",
        methodId: "new-api:daily-checkin",
        accountStateDurability: "failed",
      },
    })
  })

  it("marks the day as attempted when a daily run has no runnable accounts", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2024, 0, 1, 9, 0, 0))

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

    const skippedAccount: any = {
      id: "paused-daily",
      disabled: false,
      site_name: "Paused Daily",
      site_type: SITE_TYPES.VELOERA,
      account_info: { username: "user" },
      checkIn: runnableCheckIn(false),
    }

    schedulerTestState.storedStatus = {
      retryState: {
        day: "2024-01-01",
        pendingAccountIds: ["legacy"],
        attemptsByAccount: { legacy: 1 },
      },
      pendingRetry: true,
      nextRetryScheduledAt: "2024-01-01T09:30:00.000Z",
      retryAlarmTargetDay: "2024-01-01",
    } as any

    mockedAccountStorage.getAllAccounts.mockResolvedValue([skippedAccount])
    const provider = {
      getReadiness: vi.fn(() => ({ ready: true })),
      checkIn: vi.fn(),
    }
    resolveProviderForTest.mockReturnValue(provider)

    await runCheckinsForTest({
      runType: AUTO_CHECKIN_RUN_TYPE.DAILY,
    })

    expect(provider.checkIn).not.toHaveBeenCalled()
    expect(schedulerTestState.storedStatus.lastDailyRunDay).toBe("2024-01-01")
    expect(schedulerTestState.storedStatus.lastRunResult).toBe("skipped")
    expect(
      schedulerTestState.storedStatus.perAccount["paused-daily"],
    ).toMatchObject({
      status: "skipped",
      reasonCode: "auto_checkin_disabled",
    })
    expect(schedulerTestState.storedStatus.summary).toMatchObject({
      totalEligible: 1,
      executed: 0,
      successCount: 0,
      failedCount: 0,
      skippedCount: 1,
      needsRetry: false,
    })
    expect(schedulerTestState.storedStatus.retryState).toBeUndefined()
    expect(schedulerTestState.storedStatus.pendingRetry).toBe(false)
    expect(schedulerTestState.storedStatus.nextRetryScheduledAt).toBeUndefined()
    expect(schedulerTestState.storedStatus.retryAlarmTargetDay).toBeUndefined()
    expect(mockedBrowserApi.sendRuntimeMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        action: RuntimeActionIds.AutoCheckinRunCompleted,
        runKind: "daily",
        updatedAccountIds: [],
        summary: expect.objectContaining({
          skippedCount: 1,
          needsRetry: false,
        }),
      }),
      { maxAttempts: 1 },
    )

    vi.useRealTimers()
  })

  it("returns early without touching status when a daily run finds the global feature disabled", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2024, 0, 1, 9, 0, 0))

    mockedUserPreferences.getPreferences.mockResolvedValue({
      autoCheckin: {
        ...(DEFAULT_PREFERENCES as any).autoCheckin,
        globalEnabled: false,
        notifyUiOnCompletion: true,
      },
    })

    schedulerTestState.storedStatus = {
      lastRunAt: "2024-01-01T08:00:00.000Z",
      lastRunResult: "success",
    } as any

    await expect(
      runCheckinsForTest({
        runType: AUTO_CHECKIN_RUN_TYPE.DAILY,
      }),
    ).resolves.toBeUndefined()

    expect(mockedAccountStorage.getAllAccounts).not.toHaveBeenCalled()
    expect(resolveProviderForTest).not.toHaveBeenCalled()
    expect(schedulerTestState.statusWriteCount).toBe(0)
    expect(mockedBrowserApi.sendRuntimeMessage).not.toHaveBeenCalled()
    expect(schedulerTestState.storedStatus).toEqual({
      lastRunAt: "2024-01-01T08:00:00.000Z",
      lastRunResult: "success",
    })

    vi.useRealTimers()
  })

  it("marks the day as attempted and clears retry scheduling when a daily run fails before execution", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2024, 0, 1, 9, 15, 0))

    mockedUserPreferences.getPreferences.mockResolvedValue({
      autoCheckin: {
        ...(DEFAULT_PREFERENCES as any).autoCheckin,
        globalEnabled: true,
        notifyUiOnCompletion: false,
      },
    })

    schedulerTestState.storedStatus = {
      retryState: {
        day: "2024-01-01",
        pendingAccountIds: ["stale"],
        attemptsByAccount: { stale: 1 },
      },
      pendingRetry: true,
      nextRetryScheduledAt: "2024-01-01T09:30:00.000Z",
      retryAlarmTargetDay: "2024-01-01",
    } as any

    mockedAccountStorage.getAllAccounts.mockRejectedValueOnce(
      new Error("storage exploded"),
    )

    await expect(
      runCheckinsForTest({
        runType: AUTO_CHECKIN_RUN_TYPE.DAILY,
      }),
    ).resolves.toBeUndefined()

    expect(schedulerTestState.storedStatus.lastRunResult).toBe("failed")
    expect(schedulerTestState.storedStatus.lastDailyRunDay).toBe("2024-01-01")
    expect(schedulerTestState.storedStatus.retryState).toBeUndefined()
    expect(schedulerTestState.storedStatus.pendingRetry).toBe(false)
    expect(schedulerTestState.storedStatus.nextRetryScheduledAt).toBeUndefined()
    expect(schedulerTestState.storedStatus.retryAlarmTargetDay).toBeUndefined()
    expect(mockedBrowserApi.sendRuntimeMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({
        action: RuntimeActionIds.AutoCheckinRunCompleted,
      }),
      { maxAttempts: 1 },
    )

    vi.useRealTimers()
  })
})
