// Install shared mocks before loading scheduler dependencies.
import "~~/tests/services/autoCheckin/schedulerTestHarness"

import { beforeEach, describe, expect, it, vi } from "vitest"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import { SITE_TYPES } from "~/constants/siteType"
import { DEFAULT_PREFERENCES } from "~/services/preferences/preferencesDefaults"
import { AUTO_CHECKIN_RUN_TYPE } from "~/types/autoCheckin"
import { TEMP_WINDOW_REQUEST_SOURCES } from "~/types/tempWindowFetch"
import {
  manualExecution,
  mockedAccountStorage,
  mockedBrowserApi,
  mockedUserPreferences,
  noSelectedCheckIn,
  resolveProviderForTest,
  runCheckinsForTest,
  runnableCheckIn,
  schedulerTestState,
} from "~~/tests/services/autoCheckin/schedulerTestHarness"

describe("autoCheckinScheduler targeting support", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("merges skipped-only targeted manual runs into existing history without wiping prior results", async () => {
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

    schedulerTestState.storedStatus = {
      perAccount: {
        legacy: {
          accountId: "legacy",
          accountName: "Legacy Site · legacy-user",
          status: "success",
          timestamp: Date.now() - 1000,
        },
      },
      summary: {
        totalEligible: 2,
        executed: 1,
        successCount: 1,
        failedCount: 0,
        skippedCount: 1,
        needsRetry: false,
      },
      accountsSnapshot: [
        {
          accountId: "legacy",
          accountName: "Legacy Site · legacy-user",
        },
        {
          accountId: "disabled",
          accountName: "Disabled Site · disabled-user",
        },
      ],
      retryState: {
        day: "2024-01-01",
        pendingAccountIds: ["legacy"],
        attemptsByAccount: { legacy: 1 },
      },
      pendingRetry: true,
    } as any

    const disabledAccount: any = {
      id: "disabled",
      disabled: true,
      site_name: "Disabled Site",
      site_type: SITE_TYPES.VELOERA,
      account_info: { username: "disabled-user" },
      checkIn: runnableCheckIn(),
    }
    const detectionDisabledAccount: any = {
      id: "detection-disabled",
      disabled: false,
      site_name: "Detection Disabled Site",
      site_type: SITE_TYPES.VELOERA,
      account_info: { username: "detection-user" },
      checkIn: noSelectedCheckIn(),
    }

    mockedAccountStorage.getAllAccounts.mockResolvedValue([
      disabledAccount,
      detectionDisabledAccount,
    ])

    await runCheckinsForTest({
      runType: AUTO_CHECKIN_RUN_TYPE.MANUAL,
      targetAccountIds: ["disabled", "detection-disabled"],
    })

    expect(schedulerTestState.storedStatus.perAccount.legacy).toMatchObject({
      status: "success",
    })
    expect(schedulerTestState.storedStatus.perAccount.disabled).toMatchObject({
      status: "skipped",
      reasonCode: "account_disabled",
    })
    expect(
      schedulerTestState.storedStatus.perAccount["detection-disabled"],
    ).toMatchObject({
      status: "skipped",
      reasonCode: "no_selected_method",
    })
    expect(schedulerTestState.storedStatus.summary).toEqual({
      totalEligible: 2,
      executed: 1,
      successCount: 1,
      failedCount: 0,
      skippedCount: 2,
      needsRetry: false,
    })
    expect(schedulerTestState.storedStatus.pendingRetry).toBe(true)
    expect(schedulerTestState.storedStatus.retryState).toEqual({
      day: "2024-01-01",
      pendingAccountIds: ["legacy"],
      attemptsByAccount: { legacy: 1 },
    })
    expect(mockedBrowserApi.sendRuntimeMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        action: RuntimeActionIds.AutoCheckinRunCompleted,
        runKind: "manual",
        updatedAccountIds: [],
        summary: {
          totalEligible: 2,
          executed: 1,
          successCount: 1,
          failedCount: 0,
          skippedCount: 2,
          needsRetry: false,
        },
      }),
      { maxAttempts: 1 },
    )

    vi.useRealTimers()
  })

  it("shrinks today's retry queue when a targeted manual rerun succeeds", async () => {
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

    schedulerTestState.storedStatus = {
      perAccount: {
        target: {
          accountId: "target",
          accountName: "Retry Target · user",
          status: "failed",
          timestamp: Date.now() - 1000,
        },
        other: {
          accountId: "other",
          accountName: "Other Retry · other",
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
      accountsSnapshot: [
        {
          accountId: "target",
          accountName: "Retry Target · user",
        },
        {
          accountId: "other",
          accountName: "Other Retry · other",
        },
      ],
      retryState: {
        day: "2024-01-01",
        pendingAccountIds: ["target", "other"],
        attemptsByAccount: { target: 1, other: 2 },
      },
      pendingRetry: true,
    } as any

    const targetAccount: any = {
      id: "target",
      disabled: false,
      site_name: "Retry Target",
      site_type: SITE_TYPES.VELOERA,
      account_info: { username: "user" },
      checkIn: runnableCheckIn(),
    }
    const otherAccount: any = {
      id: "other",
      disabled: false,
      site_name: "Other Retry",
      site_type: SITE_TYPES.VELOERA,
      account_info: { username: "other" },
      checkIn: runnableCheckIn(),
    }

    mockedAccountStorage.getAllAccounts.mockResolvedValue([
      targetAccount,
      otherAccount,
    ])

    const provider = {
      getReadiness: vi.fn(() => ({ ready: true })),
      checkIn: vi.fn(async () => ({ status: "success" })),
    }
    resolveProviderForTest.mockReturnValue(provider)

    await runCheckinsForTest({
      runType: AUTO_CHECKIN_RUN_TYPE.MANUAL,
      targetAccountIds: ["target"],
    })

    expect(provider.checkIn).toHaveBeenCalledTimes(1)
    expect(provider.checkIn).toHaveBeenCalledWith(
      expect.objectContaining({ id: "target" }),
      {
        tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Background,
        protectionBypassExecution: manualExecution(
          TEMP_WINDOW_REQUEST_SOURCES.Background,
        ),
      },
    )
    expect(schedulerTestState.storedStatus.perAccount.target).toMatchObject({
      status: "success",
    })
    expect(schedulerTestState.storedStatus.perAccount.other).toMatchObject({
      status: "failed",
    })
    expect(schedulerTestState.storedStatus.lastRunResult).toBe("partial")
    expect(schedulerTestState.storedStatus.retryState).toEqual({
      day: "2024-01-01",
      pendingAccountIds: ["other"],
      attemptsByAccount: { target: 1, other: 2 },
    })
    expect(schedulerTestState.storedStatus.pendingRetry).toBe(true)
    expect(schedulerTestState.storedStatus.summary).toMatchObject({
      totalEligible: 2,
      executed: 2,
      successCount: 1,
      failedCount: 1,
      needsRetry: true,
    })

    vi.useRealTimers()
  })

  it("clears today's retry queue when the last targeted pending account succeeds", async () => {
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

    schedulerTestState.storedStatus = {
      perAccount: {
        target: {
          accountId: "target",
          accountName: "Final Retry Target · user",
          status: "failed",
          timestamp: Date.now() - 1000,
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
          accountId: "target",
          accountName: "Final Retry Target · user",
        },
      ],
      retryState: {
        day: "2024-01-01",
        pendingAccountIds: ["target"],
        attemptsByAccount: { target: 1 },
      },
      pendingRetry: true,
    } as any

    const targetAccount: any = {
      id: "target",
      disabled: false,
      site_name: "Final Retry Target",
      site_type: SITE_TYPES.VELOERA,
      account_info: { username: "user" },
      checkIn: runnableCheckIn(),
    }

    mockedAccountStorage.getAllAccounts.mockResolvedValue([targetAccount])
    const provider = {
      getReadiness: vi.fn(() => ({ ready: true })),
      checkIn: vi.fn(async () => ({ status: "success" })),
    }
    resolveProviderForTest.mockReturnValue(provider)

    await runCheckinsForTest({
      runType: AUTO_CHECKIN_RUN_TYPE.MANUAL,
      targetAccountIds: ["target"],
    })

    expect(provider.checkIn).toHaveBeenCalledTimes(1)
    expect(schedulerTestState.storedStatus.perAccount.target).toMatchObject({
      status: "success",
    })
    // The work list is empty; the day's spent attempts are not forgotten.
    expect(
      schedulerTestState.storedStatus.retryState?.pendingAccountIds,
    ).toEqual([])
    expect(schedulerTestState.storedStatus.pendingRetry).toBe(false)
    expect(schedulerTestState.storedStatus.summary).toMatchObject({
      totalEligible: 1,
      executed: 1,
      successCount: 1,
      failedCount: 0,
      skippedCount: 0,
      needsRetry: false,
    })

    vi.useRealTimers()
  })

  it("executes only targeted accounts when targetAccountIds is provided", async () => {
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
      checkIn: vi.fn(async (account: any) => {
        void account
        return { status: "success" }
      }),
    }
    resolveProviderForTest.mockReturnValue(provider)

    await runCheckinsForTest({
      runType: AUTO_CHECKIN_RUN_TYPE.MANUAL,
      targetAccountIds: ["a"],
    })

    expect(provider.checkIn).toHaveBeenCalledTimes(1)
    expect(provider.checkIn).toHaveBeenCalledWith(
      expect.objectContaining({ id: "a" }),
      {
        tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Background,
        protectionBypassExecution: manualExecution(
          TEMP_WINDOW_REQUEST_SOURCES.Background,
        ),
      },
    )

    vi.useRealTimers()
  })

  it("uses globally disambiguated account names in per-account results", async () => {
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

    const accountA: any = {
      id: "a",
      disabled: false,
      site_name: "Same Name",
      site_type: SITE_TYPES.VELOERA,
      account_info: { username: "alice" },
      checkIn: runnableCheckIn(),
    }
    const accountB: any = {
      id: "b",
      disabled: false,
      site_name: "same   name",
      site_type: SITE_TYPES.VELOERA,
      account_info: { username: "bob" },
      checkIn: runnableCheckIn(),
    }

    mockedAccountStorage.getAllAccounts.mockResolvedValue([accountA, accountB])

    const provider = {
      getReadiness: vi.fn(() => ({ ready: true })),
      checkIn: vi.fn(async () => ({ status: "success" })),
    }
    resolveProviderForTest.mockReturnValue(provider)

    await runCheckinsForTest({
      runType: AUTO_CHECKIN_RUN_TYPE.MANUAL,
    })

    expect(schedulerTestState.storedStatus.perAccount.a.accountName).toBe(
      "Same Name · alice",
    )
    expect(schedulerTestState.storedStatus.perAccount.b.accountName).toBe(
      "same   name · bob",
    )

    vi.useRealTimers()
  })

  it("uses globally disambiguated account names in targeted manual runs", async () => {
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

    const accountA: any = {
      id: "a",
      disabled: false,
      site_name: "Same Name",
      site_type: SITE_TYPES.VELOERA,
      account_info: { username: "alice" },
      checkIn: runnableCheckIn(),
    }
    const accountB: any = {
      id: "b",
      disabled: false,
      site_name: "same   name",
      site_type: SITE_TYPES.VELOERA,
      account_info: { username: "bob" },
      checkIn: runnableCheckIn(),
    }

    mockedAccountStorage.getAllAccounts.mockResolvedValue([accountA, accountB])

    const provider = {
      getReadiness: vi.fn(() => ({ ready: true })),
      checkIn: vi.fn(async () => ({ status: "success" })),
    }
    resolveProviderForTest.mockReturnValue(provider)

    await runCheckinsForTest({
      runType: AUTO_CHECKIN_RUN_TYPE.MANUAL,
      targetAccountIds: ["a"],
    })

    expect(schedulerTestState.storedStatus.perAccount.a.accountName).toBe(
      "Same Name · alice",
    )
    expect(schedulerTestState.storedStatus.perAccount.b).toBeUndefined()

    vi.useRealTimers()
  })
})
