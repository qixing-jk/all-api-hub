// Install shared mocks before loading scheduler dependencies.
import "~~/tests/services/autoCheckin/schedulerTestHarness"

import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { accountCheckinRunWorkflow } from "~/services/checkin/autoCheckin/execution/runAccountWorkflow"
import { autoCheckinScheduler } from "~/services/checkin/autoCheckin/scheduling/schedulerCore"
import { DEFAULT_PREFERENCES } from "~/services/preferences/preferencesDefaults"
import { TEMP_WINDOW_REQUEST_SOURCES } from "~/types/tempWindowFetch"
import {
  mockedAccountStorage,
  mockedBrowserApi,
  mockedMethods,
  mockedUserPreferences,
  resolveProviderForTest,
  RETRY_EXECUTION,
  runnableCheckIn,
  schedulerTestState,
} from "~~/tests/services/autoCheckin/schedulerTestHarness"
import { buildSiteAccount } from "~~/tests/test-utils/factories"

describe("execution/retryRuns", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedBrowserApi.hasAlarmsAPI.mockReturnValue(true)
  })
  it("keeps a newer manual success when an older retry result is persisted", async () => {
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
    const account = buildSiteAccount({
      id: "recovering",
      site_type: SITE_TYPES.VELOERA,
      checkIn: runnableCheckIn(),
    })
    mockedAccountStorage.getAllAccounts.mockResolvedValue([account])
    mockedAccountStorage.getAccountById.mockResolvedValue(account)
    resolveProviderForTest.mockReturnValue({
      getReadiness: () => ({ ready: true }),
    })
    const failure = {
      accountId: account.id,
      accountName: "Recovering",
      status: "failed" as const,
      retryable: true,
      timestamp: Date.now(),
    }
    const success = {
      ...failure,
      status: "success" as const,
      retryable: false,
      timestamp: Date.now() + 1,
    }
    schedulerTestState.storedStatus = {
      retryState: {
        day: "2024-01-01",
        pendingAccountIds: [account.id],
        attemptsByAccount: { [account.id]: 1 },
      },
      perAccount: { [account.id]: failure },
      accountsSnapshot: [{ accountId: account.id, lastResult: failure }],
    }
    vi.spyOn(
      accountCheckinRunWorkflow,
      "runAccountCheckin",
    ).mockImplementationOnce(async () => {
      // Another run publishes recovery after this attempt observed its failure.
      schedulerTestState.storedStatus.perAccount[account.id] = success
      return { result: failure }
    })
    await (autoCheckinScheduler as any).runRetryCheckins()
    const status = schedulerTestState.storedStatus
    expect(status.perAccount[account.id]).toEqual(success)
    expect(status.accountsSnapshot[0].lastResult).toEqual(success)
    expect(status.summary).toMatchObject({
      successCount: 1,
      failedCount: 0,
      needsRetry: false,
    })
    expect(status.retryState).toMatchObject({
      pendingAccountIds: [],
      attemptsByAccount: { [account.id]: 2 },
    })
    vi.useRealTimers()
  })
  it("retries only queued accounts and stops when maxAttemptsPerDay is reached", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2024, 0, 1, 9, 30, 0))

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

    schedulerTestState.storedStatus = {
      lastDailyRunDay: "2024-01-01",
      retryState: {
        day: "2024-01-01",
        pendingAccountIds: ["b"],
        attemptsByAccount: { b: 2 },
      },
      perAccount: {
        b: {
          accountId: "b",
          accountName: "SiteB - user-b",
          status: "failed",
          timestamp: Date.now(),
        },
      },
    }

    const accountB: any = {
      id: "b",
      disabled: false,
      site_name: "SiteB",
      site_type: SITE_TYPES.VELOERA,
      account_info: { username: "user-b" },
      checkIn: runnableCheckIn(),
    }
    mockedAccountStorage.getAccountById.mockResolvedValue(accountB)
    mockedAccountStorage.getAllAccounts.mockResolvedValue([accountB])

    const provider = {
      getReadiness: vi.fn(() => ({ ready: true })),
      checkIn: vi.fn(async () => ({ status: "failed", rawMessage: "boom" })),
    }
    resolveProviderForTest.mockReturnValue(provider)

    await (autoCheckinScheduler as any).handleRetryAlarm({
      name: "autoCheckinRetry",
      scheduledTime: Date.now(),
    })

    expect(provider.checkIn).toHaveBeenCalledTimes(1)
    expect(provider.checkIn).toHaveBeenCalledWith(
      expect.objectContaining({ id: "b" }),
      {
        tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Background,
        protectionBypassExecution: RETRY_EXECUTION,
      },
    )
    expect(mockedMethods.executeSelectedCheckIn).toHaveBeenCalledWith(
      expect.objectContaining({
        account: expect.objectContaining({ id: "b" }),
        requireStatusConfirmationBeforeMutation: true,
      }),
    )
    // The work list is empty; the day's spent attempts are not forgotten.
    expect(
      schedulerTestState.storedStatus.retryState?.pendingAccountIds,
    ).toEqual([])
    expect(schedulerTestState.storedStatus.pendingRetry).toBe(false)
    expect(schedulerTestState.alarmStore.autoCheckinRetry).toBeUndefined()

    vi.useRealTimers()
  })

  it("keeps a bounded retry queued when authoritative status is temporarily unavailable", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2024, 0, 1, 9, 30, 0))

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

    schedulerTestState.storedStatus = {
      lastDailyRunDay: "2024-01-01",
      retryState: {
        day: "2024-01-01",
        pendingAccountIds: ["temporary-readback-failure"],
        attemptsByAccount: { "temporary-readback-failure": 1 },
      },
      perAccount: {
        "temporary-readback-failure": {
          accountId: "temporary-readback-failure",
          accountName: "Example Site",
          status: "failed",
          retryable: true,
          timestamp: Date.now(),
        },
      },
    }

    const account: any = {
      id: "temporary-readback-failure",
      disabled: false,
      site_name: "Example Site",
      site_type: SITE_TYPES.VELOERA,
      account_info: { username: "example-user" },
      checkIn: runnableCheckIn(),
    }
    mockedAccountStorage.getAccountById.mockResolvedValue(account)
    mockedAccountStorage.getAllAccounts.mockResolvedValue([account])
    resolveProviderForTest.mockReturnValue({
      getReadiness: vi.fn(() => ({ ready: true })),
      checkIn: vi.fn(),
    })
    mockedMethods.executeSelectedCheckIn.mockResolvedValueOnce({
      kind: "blocked",
      reason: "network_error",
      retryable: true,
    })

    await (autoCheckinScheduler as any).handleRetryAlarm({
      name: "autoCheckinRetry",
      scheduledTime: Date.now(),
    })

    expect(
      schedulerTestState.storedStatus.perAccount[account.id],
    ).toMatchObject({
      status: "failed",
      reasonCode: "network_error",
      retryable: true,
    })
    expect(schedulerTestState.storedStatus.retryState).toMatchObject({
      pendingAccountIds: [account.id],
      attemptsByAccount: { [account.id]: 2 },
    })
    expect(schedulerTestState.storedStatus.pendingRetry).toBe(true)
    expect(schedulerTestState.alarmStore.autoCheckinRetry).toBeDefined()

    vi.useRealTimers()
  })
})
