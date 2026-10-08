// Install shared mocks before loading scheduler dependencies.
import "~~/tests/services/autoCheckin/schedulerTestHarness"

import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { autoCheckinAlarmSchedule } from "~/services/checkin/autoCheckin/scheduling/alarmSchedule"
import { DEFAULT_PREFERENCES } from "~/services/preferences/preferencesDefaults"
import { TEMP_WINDOW_REQUEST_SOURCES } from "~/types/tempWindowFetch"
import {
  mockedAccountStorage,
  mockedAutoCheckinStorage,
  mockedUserPreferences,
  resolveProviderForTest,
  retryAccountExecution,
  retryAccountForTest,
  runnableCheckIn,
  schedulerTestState,
} from "~~/tests/services/autoCheckin/schedulerTestHarness"

describe("autoCheckinScheduler.retryAccount", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
  })

  it("throws when retrying an account that no longer exists", async () => {
    mockedAccountStorage.getAllAccounts.mockResolvedValueOnce([])

    await expect(retryAccountForTest("missing-account")).rejects.toThrow()
  })

  it("skips disabled accounts with an explicit skip reason", async () => {
    mockedAccountStorage.getAllAccounts.mockResolvedValueOnce([
      {
        id: "disabled-1",
        disabled: true,
        site_name: "Disabled",
        account_info: { username: "user" },
      },
    ])
    mockedAutoCheckinStorage.getStatus.mockResolvedValueOnce({
      perAccount: {},
      summary: {
        executed: 0,
        skippedCount: 0,
        successCount: 0,
        failedCount: 0,
      },
    } as any)

    const result = await retryAccountForTest("disabled-1")

    expect(result.result.status).toBe("skipped")
    expect(result.result.reasonCode).toBe("account_disabled")
    expect(schedulerTestState.statusWriteCount).toBeGreaterThan(0)
  })

  it("returns a fallback summary when retry status persistence fails", async () => {
    mockedAccountStorage.getAllAccounts.mockResolvedValueOnce([
      {
        id: "disabled-1",
        disabled: true,
        site_name: "Disabled",
        account_info: { username: "user" },
      },
    ])
    mockedAutoCheckinStorage.updateStatus.mockResolvedValueOnce({
      ok: false,
      result: null,
    })
    vi.spyOn(
      autoCheckinAlarmSchedule as any,
      "scheduleRetryAlarm",
    ).mockResolvedValueOnce(undefined)

    const result = await retryAccountForTest("disabled-1")

    expect(result.summary).toMatchObject({
      executed: 0,
      failedCount: 0,
      skippedCount: 1,
    })
    expect(result.pendingRetry).toBe(false)
  })

  it("removes a disabled queued account from today's retry queue", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-01-23T09:00:00"))

    const disabledAccount: any = {
      id: "disabled-1",
      disabled: true,
      site_name: "Disabled",
      site_type: SITE_TYPES.VELOERA,
      account_info: { username: "user" },
      checkIn: runnableCheckIn(),
    }

    mockedAccountStorage.getAllAccounts.mockResolvedValueOnce([disabledAccount])
    mockedUserPreferences.getPreferences.mockResolvedValue({
      autoCheckin: {
        ...(DEFAULT_PREFERENCES as any).autoCheckin,
        retryStrategy: {
          enabled: true,
          intervalMinutes: 30,
          maxAttemptsPerDay: 3,
        },
      },
    })

    schedulerTestState.storedStatus = {
      perAccount: {
        "disabled-1": {
          accountId: "disabled-1",
          accountName: "Disabled · user",
          status: "failed",
          timestamp: Date.now() - 1_000,
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
      retryState: {
        day: "2026-01-23",
        pendingAccountIds: ["disabled-1"],
        attemptsByAccount: { "disabled-1": 1 },
      },
      pendingRetry: true,
      accountsSnapshot: [
        {
          accountId: "disabled-1",
          accountName: "Disabled · user",
        },
      ],
    } as any

    const scheduleRetrySpy = vi
      .spyOn(autoCheckinAlarmSchedule as any, "scheduleRetryAlarm")
      .mockResolvedValue(undefined)

    const result = await retryAccountForTest("disabled-1")

    expect(result.result.status).toBe("skipped")
    expect(result.result.reasonCode).toBe("account_disabled")
    expect(result.pendingRetry).toBe(false)
    expect(schedulerTestState.storedStatus.lastRunResult).toBe("skipped")
    // The work list is empty; the day's spent attempts are not forgotten.
    expect(
      schedulerTestState.storedStatus.retryState?.pendingAccountIds,
    ).toEqual([])
    expect(schedulerTestState.storedStatus.pendingRetry).toBe(false)
    expect(schedulerTestState.storedStatus.summary).toMatchObject({
      successCount: 0,
      failedCount: 0,
      skippedCount: 1,
      needsRetry: false,
    })
    expect(scheduleRetrySpy).toHaveBeenCalledTimes(1)

    vi.useRealTimers()
  })

  it("removes a successful manual retry from today's retry queue and clears pendingRetry when it was the last account", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-01-23T09:00:00"))

    const account: any = {
      id: "retry-1",
      disabled: false,
      site_name: "Retry Site",
      site_type: SITE_TYPES.VELOERA,
      account_info: { username: "user" },
      checkIn: runnableCheckIn(),
    }

    mockedAccountStorage.getAllAccounts.mockResolvedValueOnce([account])
    mockedUserPreferences.getPreferences.mockResolvedValue({
      autoCheckin: {
        ...(DEFAULT_PREFERENCES as any).autoCheckin,
        retryStrategy: {
          enabled: true,
          intervalMinutes: 30,
          maxAttemptsPerDay: 3,
        },
      },
    })

    schedulerTestState.storedStatus = {
      perAccount: {
        "retry-1": {
          accountId: "retry-1",
          accountName: "Retry Site · user",
          status: "failed",
          timestamp: Date.now() - 1_000,
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
      retryState: {
        day: "2026-01-23",
        pendingAccountIds: ["retry-1"],
        attemptsByAccount: { "retry-1": 1 },
      },
      pendingRetry: true,
      accountsSnapshot: [
        {
          accountId: "retry-1",
          accountName: "Retry Site · user",
        },
      ],
    } as any

    const provider = {
      getReadiness: vi.fn(() => ({ ready: true })),
      checkIn: vi.fn(async () => ({ status: "success" })),
    }
    resolveProviderForTest.mockReturnValue(provider)
    const scheduleRetrySpy = vi
      .spyOn(autoCheckinAlarmSchedule as any, "scheduleRetryAlarm")
      .mockResolvedValue(undefined)

    const result = await retryAccountForTest(
      "retry-1",
      TEMP_WINDOW_REQUEST_SOURCES.Popup,
    )

    expect(result.result.status).toBe("success")
    expect(result.pendingRetry).toBe(false)
    expect(schedulerTestState.storedStatus.lastRunResult).toBe("success")
    // The work list is empty; the day's spent attempts are not forgotten.
    expect(
      schedulerTestState.storedStatus.retryState?.pendingAccountIds,
    ).toEqual([])
    expect(schedulerTestState.storedStatus.pendingRetry).toBe(false)
    expect(schedulerTestState.storedStatus.summary).toMatchObject({
      successCount: 1,
      failedCount: 0,
      needsRetry: false,
    })
    expect(provider.checkIn).toHaveBeenCalledWith(account, {
      tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Popup,
      protectionBypassExecution: retryAccountExecution(
        TEMP_WINDOW_REQUEST_SOURCES.Popup,
      ),
    })
    expect(scheduleRetrySpy).toHaveBeenCalledWith(
      expect.objectContaining({
        retryStrategy: {
          enabled: true,
          intervalMinutes: 30,
          maxAttemptsPerDay: 3,
        },
      }),
    )

    vi.useRealTimers()
  })

  it("persists the successful retry result before surfacing a retry-reschedule failure", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-01-23T09:00:00"))

    const account: any = {
      id: "retry-1",
      disabled: false,
      site_name: "Retry Site",
      site_type: SITE_TYPES.VELOERA,
      account_info: { username: "user" },
      checkIn: runnableCheckIn(),
    }

    mockedAccountStorage.getAllAccounts.mockResolvedValueOnce([account])
    mockedUserPreferences.getPreferences.mockResolvedValue({
      autoCheckin: {
        ...(DEFAULT_PREFERENCES as any).autoCheckin,
        retryStrategy: {
          enabled: true,
          intervalMinutes: 30,
          maxAttemptsPerDay: 3,
        },
      },
    })

    schedulerTestState.storedStatus = {
      perAccount: {
        "retry-1": {
          accountId: "retry-1",
          accountName: "Retry Site · user",
          status: "failed",
          timestamp: Date.now() - 1_000,
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
      retryState: {
        day: "2026-01-23",
        pendingAccountIds: ["retry-1"],
        attemptsByAccount: { "retry-1": 1 },
      },
      pendingRetry: true,
      accountsSnapshot: [
        {
          accountId: "retry-1",
          accountName: "Retry Site · user",
        },
      ],
    } as any

    const provider = {
      getReadiness: vi.fn(() => ({ ready: true })),
      checkIn: vi.fn(async () => ({ status: "success" })),
    }
    resolveProviderForTest.mockReturnValue(provider)

    vi.spyOn(
      autoCheckinAlarmSchedule as any,
      "scheduleRetryAlarm",
    ).mockRejectedValueOnce(new Error("retry reschedule failed"))

    await expect(retryAccountForTest("retry-1")).rejects.toThrow(
      "retry reschedule failed",
    )

    expect(schedulerTestState.storedStatus.lastRunResult).toBe("success")
    // The work list is empty; the day's spent attempts are not forgotten.
    expect(
      schedulerTestState.storedStatus.retryState?.pendingAccountIds,
    ).toEqual([])
    expect(schedulerTestState.storedStatus.pendingRetry).toBe(false)
    expect(schedulerTestState.storedStatus.summary).toMatchObject({
      successCount: 1,
      failedCount: 0,
      needsRetry: false,
    })
    expect(schedulerTestState.statusWriteCount).toBeGreaterThan(0)

    vi.useRealTimers()
  })

  it("removes only the retried account from today's retry queue when other failures still need retry", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-01-23T09:00:00"))

    const account: any = {
      id: "retry-1",
      disabled: false,
      site_name: "Retry Site",
      site_type: SITE_TYPES.VELOERA,
      account_info: { username: "user" },
      checkIn: runnableCheckIn(),
    }
    const remainingAccount: any = {
      id: "retry-2",
      disabled: false,
      site_name: "Still Failing",
      site_type: SITE_TYPES.VELOERA,
      account_info: { username: "other" },
      checkIn: runnableCheckIn(),
    }

    mockedAccountStorage.getAllAccounts.mockResolvedValueOnce([
      account,
      remainingAccount,
    ])
    mockedUserPreferences.getPreferences.mockResolvedValue({
      autoCheckin: {
        ...(DEFAULT_PREFERENCES as any).autoCheckin,
        retryStrategy: {
          enabled: true,
          intervalMinutes: 30,
          maxAttemptsPerDay: 3,
        },
      },
    })

    schedulerTestState.storedStatus = {
      perAccount: {
        "retry-1": {
          accountId: "retry-1",
          accountName: "Retry Site · user",
          status: "failed",
          timestamp: Date.now() - 1_000,
        },
        "retry-2": {
          accountId: "retry-2",
          accountName: "Still Failing · other",
          status: "failed",
          timestamp: Date.now() - 500,
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
      retryState: {
        day: "2026-01-23",
        pendingAccountIds: ["retry-1", "retry-2"],
        attemptsByAccount: { "retry-1": 1, "retry-2": 2 },
      },
      pendingRetry: true,
      accountsSnapshot: [
        {
          accountId: "retry-1",
          accountName: "Retry Site · user",
        },
        {
          accountId: "retry-2",
          accountName: "Still Failing · other",
        },
      ],
    } as any

    const provider = {
      getReadiness: vi.fn(() => ({ ready: true })),
      checkIn: vi.fn(async () => ({ status: "success" })),
    }
    resolveProviderForTest.mockReturnValue(provider)
    const scheduleRetrySpy = vi
      .spyOn(autoCheckinAlarmSchedule as any, "scheduleRetryAlarm")
      .mockResolvedValue(undefined)

    const result = await retryAccountForTest("retry-1")

    expect(result.result.status).toBe("success")
    expect(result.pendingRetry).toBe(true)
    expect(schedulerTestState.storedStatus.lastRunResult).toBe("partial")
    expect(schedulerTestState.storedStatus.retryState).toEqual({
      day: "2026-01-23",
      pendingAccountIds: ["retry-2"],
      attemptsByAccount: { "retry-1": 1, "retry-2": 2 },
    })
    expect(schedulerTestState.storedStatus.pendingRetry).toBe(true)
    expect(schedulerTestState.storedStatus.summary).toMatchObject({
      totalEligible: 2,
      successCount: 1,
      failedCount: 1,
      needsRetry: true,
    })
    expect(scheduleRetrySpy).toHaveBeenCalledTimes(1)

    vi.useRealTimers()
  })

  it("keeps a failed manual retry in today's retry queue and preserves pendingRetry", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-01-23T09:00:00"))

    const account: any = {
      id: "retry-1",
      disabled: false,
      site_name: "Retry Site",
      site_type: SITE_TYPES.VELOERA,
      account_info: { username: "user" },
      checkIn: runnableCheckIn(),
    }

    mockedAccountStorage.getAllAccounts.mockResolvedValueOnce([account])
    mockedUserPreferences.getPreferences.mockResolvedValue({
      autoCheckin: {
        ...(DEFAULT_PREFERENCES as any).autoCheckin,
        retryStrategy: {
          enabled: true,
          intervalMinutes: 30,
          maxAttemptsPerDay: 3,
        },
      },
    })

    schedulerTestState.storedStatus = {
      perAccount: {
        "retry-1": {
          accountId: "retry-1",
          accountName: "Retry Site · user",
          status: "failed",
          timestamp: Date.now() - 1_000,
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
      retryState: {
        day: "2026-01-23",
        pendingAccountIds: ["retry-1", "retry-2"],
        attemptsByAccount: { "retry-1": 1, "retry-2": 2 },
      },
      pendingRetry: true,
      accountsSnapshot: [
        {
          accountId: "retry-1",
          accountName: "Retry Site · user",
        },
      ],
    } as any

    const provider = {
      getReadiness: vi.fn(() => ({ ready: true })),
      checkIn: vi.fn(async () => ({
        status: "failed",
        rawMessage: "retry still failing",
      })),
    }
    resolveProviderForTest.mockReturnValue(provider)
    const scheduleRetrySpy = vi
      .spyOn(autoCheckinAlarmSchedule as any, "scheduleRetryAlarm")
      .mockResolvedValue(undefined)

    const result = await retryAccountForTest("retry-1")

    expect(result.result.status).toBe("failed")
    expect(result.pendingRetry).toBe(true)
    expect(schedulerTestState.storedStatus.lastRunResult).toBe("failed")
    expect(schedulerTestState.storedStatus.retryState).toEqual({
      day: "2026-01-23",
      pendingAccountIds: ["retry-1", "retry-2"],
      attemptsByAccount: { "retry-1": 1, "retry-2": 2 },
    })
    expect(schedulerTestState.storedStatus.pendingRetry).toBe(true)
    expect(schedulerTestState.storedStatus.summary).toMatchObject({
      successCount: 0,
      failedCount: 1,
      needsRetry: true,
    })
    expect(scheduleRetrySpy).toHaveBeenCalledTimes(1)

    vi.useRealTimers()
  })

  it("does not mutate today's retry queue when manually retrying an account outside it", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-01-23T09:00:00"))

    const adhocAccount: any = {
      id: "adhoc-1",
      disabled: false,
      site_name: "Adhoc Retry",
      site_type: SITE_TYPES.VELOERA,
      account_info: { username: "adhoc" },
      checkIn: runnableCheckIn(),
    }
    const queuedAccount: any = {
      id: "retry-2",
      disabled: false,
      site_name: "Queued Retry",
      site_type: SITE_TYPES.VELOERA,
      account_info: { username: "queued" },
      checkIn: runnableCheckIn(),
    }

    mockedAccountStorage.getAllAccounts.mockResolvedValueOnce([
      adhocAccount,
      queuedAccount,
    ])
    mockedUserPreferences.getPreferences.mockResolvedValue({
      autoCheckin: {
        ...(DEFAULT_PREFERENCES as any).autoCheckin,
        retryStrategy: {
          enabled: true,
          intervalMinutes: 30,
          maxAttemptsPerDay: 3,
        },
      },
    })

    schedulerTestState.storedStatus = {
      perAccount: {
        "retry-2": {
          accountId: "retry-2",
          accountName: "Queued Retry · queued",
          status: "failed",
          timestamp: Date.now() - 1_000,
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
      retryState: {
        day: "2026-01-23",
        pendingAccountIds: ["retry-2"],
        attemptsByAccount: { "retry-2": 2 },
      },
      pendingRetry: true,
      accountsSnapshot: [
        {
          accountId: "retry-2",
          accountName: "Queued Retry · queued",
        },
      ],
    } as any

    const provider = {
      getReadiness: vi.fn(() => ({ ready: true })),
      checkIn: vi.fn(async () => ({ status: "success" })),
    }
    resolveProviderForTest.mockReturnValue(provider)
    const scheduleRetrySpy = vi
      .spyOn(autoCheckinAlarmSchedule as any, "scheduleRetryAlarm")
      .mockResolvedValue(undefined)

    const result = await retryAccountForTest("adhoc-1")

    expect(result.result.status).toBe("success")
    expect(result.pendingRetry).toBe(true)
    expect(schedulerTestState.storedStatus.lastRunResult).toBe("partial")
    expect(schedulerTestState.storedStatus.retryState).toEqual({
      day: "2026-01-23",
      pendingAccountIds: ["retry-2"],
      attemptsByAccount: { "retry-2": 2 },
    })
    expect(schedulerTestState.storedStatus.pendingRetry).toBe(true)
    expect(schedulerTestState.storedStatus.summary).toMatchObject({
      totalEligible: 1,
      successCount: 1,
      failedCount: 1,
      needsRetry: true,
    })
    expect(scheduleRetrySpy).toHaveBeenCalledTimes(1)

    vi.useRealTimers()
  })
})
