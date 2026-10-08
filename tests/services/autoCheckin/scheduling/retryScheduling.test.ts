// Install shared mocks before loading scheduler dependencies.
import "~~/tests/services/autoCheckin/schedulerTestHarness"

import { beforeEach, describe, expect, it, vi } from "vitest"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import { SITE_TYPES } from "~/constants/siteType"
import { autoCheckinAlarmSchedule } from "~/services/checkin/autoCheckin/scheduling/alarmSchedule"
import { computeNextRetryTriggerTime } from "~/services/checkin/autoCheckin/scheduling/dailyPlanning"
import { autoCheckinScheduler } from "~/services/checkin/autoCheckin/scheduling/schedulerCore"
import { DEFAULT_PREFERENCES } from "~/services/preferences/preferencesDefaults"
import {
  mockedAccountStorage,
  mockedBrowserApi,
  mockedUserPreferences,
  resolveProviderForTest,
  runnableCheckIn,
  schedulerTestState,
} from "~~/tests/services/autoCheckin/schedulerTestHarness"

describe("autoCheckinScheduler retry scheduling", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns a short fallback delay when retry timing inputs are invalid", () => {
    vi.useFakeTimers()
    const now = new Date(2024, 0, 1, 9, 30, 0)
    vi.setSystemTime(now)

    const nextRetryTime = computeNextRetryTriggerTime(
      {
        ...(DEFAULT_PREFERENCES as any).autoCheckin,
        retryStrategy: {
          enabled: true,
          intervalMinutes: 0,
          maxAttemptsPerDay: 3,
        },
      },
      {
        lastRunAt: "not-a-date",
      },
      now,
    )

    expect(nextRetryTime.getTime()).toBe(now.getTime() + 15_000)

    vi.useRealTimers()
  })

  it("clears the retry alarm without persisting when no status exists", async () => {
    schedulerTestState.storedStatus = null

    await expect(
      (autoCheckinAlarmSchedule as any).clearRetryAlarmAndState(),
    ).resolves.toBeUndefined()

    expect(mockedBrowserApi.clearAlarm).toHaveBeenCalledWith("autoCheckinRetry")
    expect(schedulerTestState.statusWriteCount).toBe(0)
  })

  it("clears daily schedule metadata without persisting when no status exists", async () => {
    schedulerTestState.storedStatus = null

    await expect(
      (autoCheckinAlarmSchedule as any).clearDailyScheduleStatus(),
    ).resolves.toBeUndefined()

    expect(schedulerTestState.storedStatus).toBeNull()
    expect(schedulerTestState.statusWriteCount).toBe(0)
  })

  it("keeps persisted results when clearing the retry schedule", async () => {
    schedulerTestState.storedStatus = {
      lastRunAt: "2024-01-01T09:00:00.000Z",
      lastRunResult: "partial",
      perAccount: { a: { accountId: "a", status: "success" } },
      retryState: {
        day: "2024-01-01",
        pendingAccountIds: ["a"],
        attemptsByAccount: { a: 1 },
      },
      pendingRetry: true,
    }

    await (autoCheckinAlarmSchedule as any).clearRetryAlarmAndState()

    expect(schedulerTestState.storedStatus.lastRunResult).toBe("partial")
    expect(schedulerTestState.storedStatus.perAccount).toEqual({
      a: { accountId: "a", status: "success" },
    })
    expect(schedulerTestState.storedStatus.retryState).toBeUndefined()
    expect(schedulerTestState.storedStatus.pendingRetry).toBe(false)
  })

  it("clears retry alarm and retains ledger when maxAttempts is omitted", async () => {
    schedulerTestState.storedStatus = {
      retryState: {
        day: "2024-01-01",
        pendingAccountIds: ["a"],
        attemptsByAccount: { a: 1 },
      },
      pendingRetry: true,
    }

    await (autoCheckinAlarmSchedule as any).clearRetryAlarm()

    expect(mockedBrowserApi.clearAlarm).toHaveBeenCalledWith("autoCheckinRetry")
    expect(schedulerTestState.storedStatus.pendingRetry).toBe(false)
    expect(schedulerTestState.storedStatus.retryState).toEqual({
      day: "2024-01-01",
      pendingAccountIds: ["a"],
      attemptsByAccount: { a: 1 },
    })
  })

  it("syncs a preserved same-day retry alarm back into stored state", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2024, 0, 1, 9, 0, 0))

    const scheduledTime = new Date(2024, 0, 1, 9, 45, 0)
    schedulerTestState.storedStatus = {
      lastDailyRunDay: "2024-01-01",
      retryState: {
        day: "2024-01-01",
        pendingAccountIds: ["a", "b"],
        attemptsByAccount: {
          a: 1,
          b: 3,
        },
      },
      pendingRetry: false,
    } as any
    schedulerTestState.alarmStore.autoCheckinRetry = {
      name: "autoCheckinRetry",
      scheduledTime: scheduledTime.getTime(),
    }

    await (autoCheckinAlarmSchedule as any).scheduleRetryAlarm(
      {
        ...(DEFAULT_PREFERENCES as any).autoCheckin,
        retryStrategy: {
          enabled: true,
          intervalMinutes: 30,
          maxAttemptsPerDay: 3,
        },
      },
      {
        preserveExisting: true,
      },
    )

    expect(mockedBrowserApi.createAlarm).not.toHaveBeenCalled()
    expect(mockedBrowserApi.clearAlarm).not.toHaveBeenCalled()
    expect(schedulerTestState.storedStatus.nextRetryScheduledAt).toBe(
      scheduledTime.toISOString(),
    )
    expect(schedulerTestState.storedStatus.retryAlarmTargetDay).toBe(
      "2024-01-01",
    )
    expect(schedulerTestState.storedStatus.pendingRetry).toBe(true)
    expect(
      schedulerTestState.storedStatus.retryState.pendingAccountIds,
    ).toEqual(["a"])
    // b is out of the work list, out of budget, and still remembered.
    expect(
      schedulerTestState.storedStatus.retryState.attemptsByAccount,
    ).toEqual({ a: 1, b: 3 })

    vi.useRealTimers()
  })

  it.each([
    {
      name: "no retry queue exists",
      status: { lastRunResult: "success" },
      maxAttempts: 3,
    },
    {
      name: "the retry queue is exhausted",
      status: {
        retryState: {
          day: "2024-01-01",
          pendingAccountIds: ["a"],
          attemptsByAccount: { a: 3 },
        },
      },
      maxAttempts: 3,
    },
    {
      name: "the retry schedule is already synchronized",
      status: {
        nextRetryScheduledAt: "2024-01-01T09:45:00.000Z",
        retryAlarmTargetDay: "2024-01-01",
        pendingRetry: true,
        retryState: {
          day: "2024-01-01",
          pendingAccountIds: ["a"],
          attemptsByAccount: { a: 1 },
        },
      },
      maxAttempts: 3,
    },
  ])("does not rewrite status when $name", async ({ status, maxAttempts }) => {
    schedulerTestState.storedStatus = status

    await (autoCheckinAlarmSchedule as any).syncRetryScheduleStatus({
      scheduledIso: "2024-01-01T09:45:00.000Z",
      day: "2024-01-01",
      maxAttempts,
    })

    expect(schedulerTestState.statusWriteCount).toBe(0)
  })

  it("clears an empty retry queue without creating a new schedule", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2024, 0, 1, 9, 0, 0))
    schedulerTestState.storedStatus = {
      lastDailyRunDay: "2024-01-01",
      retryState: {
        day: "2024-01-01",
        pendingAccountIds: [],
        attemptsByAccount: {},
      },
      pendingRetry: true,
    }

    await (autoCheckinAlarmSchedule as any).scheduleRetryAlarm({
      ...(DEFAULT_PREFERENCES as any).autoCheckin,
      retryStrategy: {
        enabled: true,
        intervalMinutes: 30,
        maxAttemptsPerDay: 3,
      },
    })

    expect(schedulerTestState.storedStatus.retryState).toBeUndefined()
    expect(schedulerTestState.storedStatus.pendingRetry).toBe(false)
    expect(mockedBrowserApi.createAlarm).not.toHaveBeenCalledWith(
      "autoCheckinRetry",
      expect.anything(),
    )

    vi.useRealTimers()
  })

  it("clears a preserved retry alarm when its target day is stale", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2024, 0, 2, 9, 0, 0))

    schedulerTestState.storedStatus = {
      lastDailyRunDay: "2024-01-02",
      retryState: {
        day: "2024-01-02",
        pendingAccountIds: ["a"],
        attemptsByAccount: {
          a: 1,
        },
      },
      pendingRetry: true,
    } as any
    schedulerTestState.alarmStore.autoCheckinRetry = {
      name: "autoCheckinRetry",
      scheduledTime: new Date(2024, 0, 1, 23, 30, 0).getTime(),
    }

    await (autoCheckinAlarmSchedule as any).scheduleRetryAlarm(
      {
        ...(DEFAULT_PREFERENCES as any).autoCheckin,
        retryStrategy: {
          enabled: true,
          intervalMinutes: 30,
          maxAttemptsPerDay: 3,
        },
      },
      {
        preserveExisting: true,
      },
    )

    expect(mockedBrowserApi.clearAlarm).toHaveBeenCalledWith("autoCheckinRetry")
    expect(mockedBrowserApi.createAlarm).not.toHaveBeenCalled()
    expect(schedulerTestState.storedStatus.nextRetryScheduledAt).toBeUndefined()
    expect(schedulerTestState.storedStatus.retryAlarmTargetDay).toBeUndefined()
    expect(schedulerTestState.storedStatus.retryState).toBeUndefined()
    expect(schedulerTestState.storedStatus.pendingRetry).toBe(false)

    vi.useRealTimers()
  })

  it("recreates a missing preserved retry alarm from today's retry state", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2024, 0, 1, 9, 0, 0))

    const expectedRetryTime = new Date(2024, 0, 1, 9, 20, 0)
    schedulerTestState.storedStatus = {
      lastRunAt: new Date(2024, 0, 1, 8, 50, 0).toISOString(),
      lastDailyRunDay: "2024-01-01",
      retryState: {
        day: "2024-01-01",
        pendingAccountIds: ["a", "b"],
        attemptsByAccount: {
          a: 1,
          b: 3,
        },
      },
      pendingRetry: true,
      nextRetryScheduledAt: new Date(2024, 0, 1, 8, 55, 0).toISOString(),
      retryAlarmTargetDay: "2024-01-01",
    } as any

    await (autoCheckinAlarmSchedule as any).scheduleRetryAlarm(
      {
        ...(DEFAULT_PREFERENCES as any).autoCheckin,
        retryStrategy: {
          enabled: true,
          intervalMinutes: 30,
          maxAttemptsPerDay: 3,
        },
      },
      {
        preserveExisting: true,
      },
    )

    expect(mockedBrowserApi.clearAlarm).toHaveBeenCalledWith("autoCheckinRetry")
    expect(mockedBrowserApi.createAlarm).toHaveBeenCalledWith(
      "autoCheckinRetry",
      {
        when: expectedRetryTime.getTime(),
      },
    )
    expect(schedulerTestState.storedStatus.nextRetryScheduledAt).toBe(
      expectedRetryTime.toISOString(),
    )
    expect(schedulerTestState.storedStatus.retryAlarmTargetDay).toBe(
      "2024-01-01",
    )
    expect(schedulerTestState.storedStatus.pendingRetry).toBe(true)
    expect(
      schedulerTestState.storedStatus.retryState.pendingAccountIds,
    ).toEqual(["a"])
    // b is out of the work list, out of budget, and still remembered.
    expect(
      schedulerTestState.storedStatus.retryState.attemptsByAccount,
    ).toEqual({ a: 1, b: 3 })

    vi.useRealTimers()
  })

  it("drops retry state instead of scheduling across the day boundary", async () => {
    vi.useFakeTimers()
    const now = new Date(2024, 0, 1, 23, 59, 55)
    vi.setSystemTime(now)

    schedulerTestState.storedStatus = {
      lastRunAt: now.toISOString(),
      lastDailyRunDay: "2024-01-01",
      retryState: {
        day: "2024-01-01",
        pendingAccountIds: ["a"],
        attemptsByAccount: {
          a: 1,
        },
      },
      pendingRetry: true,
    } as any

    await (autoCheckinAlarmSchedule as any).scheduleRetryAlarm({
      ...(DEFAULT_PREFERENCES as any).autoCheckin,
      retryStrategy: {
        enabled: true,
        intervalMinutes: 30,
        maxAttemptsPerDay: 3,
      },
    })

    expect(mockedBrowserApi.createAlarm).not.toHaveBeenCalled()
    expect(schedulerTestState.storedStatus.nextRetryScheduledAt).toBeUndefined()
    expect(schedulerTestState.storedStatus.retryAlarmTargetDay).toBeUndefined()
    expect(schedulerTestState.storedStatus.retryState).toBeUndefined()
    expect(schedulerTestState.storedStatus.pendingRetry).toBe(false)

    vi.useRealTimers()
  })

  it("ignores stale retry alarms and clears retry state without retrying", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2024, 0, 2, 9, 0, 0))

    schedulerTestState.storedStatus = {
      retryAlarmTargetDay: "2024-01-01",
      retryState: {
        day: "2024-01-01",
        pendingAccountIds: ["a"],
        attemptsByAccount: {
          a: 1,
        },
      },
      pendingRetry: true,
    } as any

    const runRetrySpy = vi.spyOn(
      autoCheckinScheduler as any,
      "runRetryCheckins",
    )

    await (autoCheckinScheduler as any).handleRetryAlarm({
      name: "autoCheckinRetry",
      scheduledTime: Date.now(),
    })

    expect(runRetrySpy).not.toHaveBeenCalled()
    expect(schedulerTestState.storedStatus.retryState).toBeUndefined()
    expect(schedulerTestState.storedStatus.pendingRetry).toBe(false)

    vi.useRealTimers()
  })

  it("clears retry state when retry execution is disabled by config", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2024, 0, 1, 9, 0, 0))

    mockedUserPreferences.getPreferences.mockResolvedValue({
      autoCheckin: {
        ...(DEFAULT_PREFERENCES as any).autoCheckin,
        globalEnabled: true,
        retryStrategy: {
          enabled: false,
          intervalMinutes: 30,
          maxAttemptsPerDay: 3,
        },
      },
    })

    schedulerTestState.storedStatus = {
      lastDailyRunDay: "2024-01-01",
      retryState: {
        day: "2024-01-01",
        pendingAccountIds: ["a"],
        attemptsByAccount: { a: 1 },
      },
      pendingRetry: true,
    } as any

    await (autoCheckinScheduler as any).runRetryCheckins()

    expect(mockedBrowserApi.clearAlarm).toHaveBeenCalledWith("autoCheckinRetry")
    expect(mockedAccountStorage.getAccountById).not.toHaveBeenCalled()
    expect(resolveProviderForTest).not.toHaveBeenCalled()
    expect(mockedBrowserApi.sendRuntimeMessage).not.toHaveBeenCalled()
    expect(schedulerTestState.storedStatus.retryState).toBeUndefined()
    expect(schedulerTestState.storedStatus.pendingRetry).toBe(false)

    vi.useRealTimers()
  })

  it("clears retry state and skips retry when retryState is from a different day", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2024, 0, 2, 9, 0, 0))

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

    schedulerTestState.storedStatus = {
      retryState: {
        day: "2024-01-01",
        pendingAccountIds: ["a"],
        attemptsByAccount: { a: 1 },
      },
      pendingRetry: true,
    } as any

    await (autoCheckinScheduler as any).runRetryCheckins()

    expect(mockedBrowserApi.clearAlarm).toHaveBeenCalledWith("autoCheckinRetry")
    expect(mockedAccountStorage.getAccountById).not.toHaveBeenCalled()
    expect(schedulerTestState.storedStatus.retryState).toBeUndefined()
    expect(schedulerTestState.storedStatus.pendingRetry).toBe(false)

    vi.useRealTimers()
  })

  it("retries a same-day queue that was not created by the daily run", async () => {
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

    schedulerTestState.storedStatus = {
      lastDailyRunDay: "2023-12-31",
      retryState: {
        day: "2024-01-01",
        pendingAccountIds: ["a"],
        attemptsByAccount: { a: 1 },
      },
      pendingRetry: true,
    } as any

    mockedAccountStorage.getAccountById.mockResolvedValue({
      id: "a",
      disabled: false,
      site_name: "Manual Queue",
      site_type: SITE_TYPES.ANYROUTER,
      account_info: { username: "user-a" },
      checkIn: runnableCheckIn(),
    })
    resolveProviderForTest.mockReturnValue({
      getReadiness: vi.fn(() => ({ ready: true })),
      checkIn: vi.fn(async () => ({ status: "success" })),
    })

    await (autoCheckinScheduler as any).runRetryCheckins()

    expect(mockedBrowserApi.clearAlarm).not.toHaveBeenCalledWith(
      "autoCheckinRetry",
    )
    expect(mockedAccountStorage.getAccountById).toHaveBeenCalled()
    // The work list is empty; the day's spent attempts are not forgotten.
    expect(
      schedulerTestState.storedStatus.retryState?.pendingAccountIds,
    ).toEqual([])

    vi.useRealTimers()
  })

  it("clears the retry alarm when there are no pending accounts left", async () => {
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

    schedulerTestState.storedStatus = {
      lastDailyRunDay: "2024-01-01",
      retryState: {
        day: "2024-01-01",
        pendingAccountIds: [],
        attemptsByAccount: {},
      },
      pendingRetry: true,
    } as any

    await (autoCheckinScheduler as any).runRetryCheckins()

    expect(mockedBrowserApi.clearAlarm).toHaveBeenCalledWith("autoCheckinRetry")
    expect(mockedAccountStorage.getAccountById).not.toHaveBeenCalled()
    expect(resolveProviderForTest).not.toHaveBeenCalled()
    expect(mockedBrowserApi.sendRuntimeMessage).not.toHaveBeenCalled()
    expect(schedulerTestState.storedStatus.retryState).toBeUndefined()
    expect(schedulerTestState.storedStatus.pendingRetry).toBe(false)

    vi.useRealTimers()
  })

  it("marks missing retry accounts as skipped and clears the retry queue", async () => {
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
        pendingAccountIds: ["missing"],
        attemptsByAccount: {},
      },
      perAccount: {
        missing: {
          accountId: "missing",
          accountName: "Missing Site",
          status: "failed",
          timestamp: Date.now(),
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
    } as any

    mockedAccountStorage.getAllAccounts.mockResolvedValue([])
    mockedAccountStorage.getAccountById.mockResolvedValue(null)

    await (autoCheckinScheduler as any).runRetryCheckins()

    expect(resolveProviderForTest).not.toHaveBeenCalled()
    expect(schedulerTestState.storedStatus.perAccount.missing).toMatchObject({
      accountId: "missing",
      accountName: "missing",
      status: "skipped",
      reasonCode: "account_disabled",
    })
    expect(schedulerTestState.storedStatus.summary).toMatchObject({
      totalEligible: 1,
      executed: 0,
      successCount: 0,
      failedCount: 0,
      skippedCount: 1,
      needsRetry: false,
    })
    // This run attempted nothing, so the day has nothing left to remember.
    expect(schedulerTestState.storedStatus.retryState).toBeUndefined()
    expect(schedulerTestState.storedStatus.pendingRetry).toBe(false)
    expect(mockedBrowserApi.sendRuntimeMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        action: RuntimeActionIds.AutoCheckinRunCompleted,
        runKind: "retry",
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

  it("marks retry accounts that are no longer auto-checkin eligible as skipped", async () => {
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
        pendingAccountIds: ["paused"],
        attemptsByAccount: {},
      },
      perAccount: {
        paused: {
          accountId: "paused",
          accountName: "Paused Site · user",
          status: "failed",
          timestamp: Date.now(),
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
      accountsSnapshot: [
        {
          accountId: "paused",
          accountName: "Paused Site · user",
        },
      ],
      pendingRetry: true,
    } as any

    const pausedAccount: any = {
      id: "paused",
      disabled: false,
      site_name: "Paused Site",
      site_type: SITE_TYPES.VELOERA,
      account_info: { username: "user" },
      checkIn: runnableCheckIn(false),
    }

    mockedAccountStorage.getAllAccounts.mockResolvedValue([pausedAccount])
    mockedAccountStorage.getAccountById.mockResolvedValue(pausedAccount)
    const provider = {
      getReadiness: vi.fn(() => ({ ready: true })),
      checkIn: vi.fn(),
    }
    resolveProviderForTest.mockReturnValue(provider)

    await (autoCheckinScheduler as any).runRetryCheckins()

    expect(provider.checkIn).not.toHaveBeenCalled()
    expect(schedulerTestState.storedStatus.perAccount.paused).toMatchObject({
      accountId: "paused",
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
    // This run attempted nothing, so the day has nothing left to remember.
    expect(schedulerTestState.storedStatus.retryState).toBeUndefined()
    expect(schedulerTestState.storedStatus.pendingRetry).toBe(false)
    expect(mockedBrowserApi.sendRuntimeMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        action: RuntimeActionIds.AutoCheckinRunCompleted,
        runKind: "retry",
        updatedAccountIds: [],
      }),
      { maxAttempts: 1 },
    )

    vi.useRealTimers()
  })

  it("stops scheduling a queue whose accounts spent the budget", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2024, 0, 1, 9, 0, 0))

    schedulerTestState.storedStatus = {
      lastDailyRunDay: "2024-01-01",
      retryState: {
        day: "2024-01-01",
        pendingAccountIds: ["a"],
        attemptsByAccount: { a: 3 },
      },
      pendingRetry: true,
    } as any

    await (autoCheckinAlarmSchedule as any).scheduleRetryAlarm({
      ...(DEFAULT_PREFERENCES as any).autoCheckin,
      retryStrategy: {
        enabled: true,
        intervalMinutes: 30,
        maxAttemptsPerDay: 3,
      },
    })

    expect(mockedBrowserApi.clearAlarm).toHaveBeenCalledWith("autoCheckinRetry")
    expect(mockedBrowserApi.createAlarm).not.toHaveBeenCalled()
    // The work list empties; the attempts it cost stay on the day's ledger so
    // the next run cannot hand the account a fresh budget.
    expect(schedulerTestState.storedStatus.retryState).toEqual({
      day: "2024-01-01",
      pendingAccountIds: [],
      attemptsByAccount: { a: 3 },
    })
    expect(schedulerTestState.storedStatus.pendingRetry).toBe(false)
    expect(schedulerTestState.storedStatus.nextRetryScheduledAt).toBeUndefined()

    vi.useRealTimers()
  })

  it("keeps an account that a manual retry queued while the run was executing", async () => {
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

    schedulerTestState.storedStatus = {
      lastDailyRunDay: "2024-01-01",
      retryState: {
        day: "2024-01-01",
        pendingAccountIds: ["a"],
        attemptsByAccount: { a: 1 },
      },
      pendingRetry: true,
    } as any

    mockedAccountStorage.getAccountById.mockResolvedValue({
      id: "a",
      disabled: false,
      site_name: "Race Site",
      site_type: SITE_TYPES.VELOERA,
      account_info: { username: "user-a" },
      checkIn: runnableCheckIn(),
    })
    resolveProviderForTest.mockReturnValue({
      getReadiness: vi.fn(() => ({ ready: true })),
      checkIn: vi.fn(async () => {
        // A manual single-account retry lands in the queue while this run is
        // between its snapshot read and its write.
        schedulerTestState.storedStatus = {
          ...schedulerTestState.storedStatus,
          retryState: {
            day: "2024-01-01",
            pendingAccountIds: ["a", "b"],
            attemptsByAccount: { a: 1, b: 1 },
          },
        }
        return { status: "success" }
      }),
    })

    await (autoCheckinScheduler as any).runRetryCheckins()

    // a is settled; b was never this run's business and must survive the write.
    expect(
      schedulerTestState.storedStatus.retryState?.pendingAccountIds,
    ).toEqual(["b"])
    expect(
      schedulerTestState.storedStatus.retryState?.attemptsByAccount,
    ).toEqual({ a: 2, b: 1 })

    vi.useRealTimers()
  })
})
