// Install shared mocks before loading scheduler dependencies.
import "~~/tests/services/autoCheckin/schedulerTestHarness"

import { beforeEach, describe, expect, it, vi } from "vitest"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import { SITE_TYPES } from "~/constants/siteType"
import { DEFAULT_PREFERENCES } from "~/services/preferences/preferencesDefaults"
import { AUTO_CHECKIN_RUN_TYPE } from "~/types/autoCheckin"
import {
  mockedAccountStorage,
  mockedBrowserApi,
  mockedUserPreferences,
  noSelectedCheckIn,
  resolveProviderForTest,
  runCheckinsForTest,
  runnableCheckIn,
  schedulerTestState,
} from "~~/tests/services/autoCheckin/schedulerTestHarness"

describe("manualBatch", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedBrowserApi.hasAlarmsAPI.mockReturnValue(true)
  })
  it("does not hand a fresh budget to a manual run after the day's attempts are spent", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2024, 0, 1, 11, 0, 0))

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

    const account: any = {
      id: "spent",
      disabled: false,
      site_name: "Spent Site",
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

    // Today's scheduled run and its retries already used all three attempts.
    schedulerTestState.storedStatus = {
      lastDailyRunDay: "2024-01-01",
      retryState: {
        day: "2024-01-01",
        pendingAccountIds: [],
        attemptsByAccount: { spent: 3 },
      },
      pendingRetry: false,
    } as any

    await runCheckinsForTest({ runType: AUTO_CHECKIN_RUN_TYPE.MANUAL })

    // The user asked for this run, so it happens once. It just does not arm an
    // automatic retry the day's budget no longer covers.
    expect(provider.checkIn).toHaveBeenCalledTimes(1)
    expect(schedulerTestState.storedStatus.retryState).toEqual({
      day: "2024-01-01",
      pendingAccountIds: [],
      attemptsByAccount: { spent: 3 },
    })
    expect(schedulerTestState.storedStatus.pendingRetry).toBe(false)
    expect(schedulerTestState.storedStatus.lastDailyRunDay).toBe("2024-01-01")

    vi.useRealTimers()
  })

  it("stores a skipped-only summary when a manual run has no runnable accounts", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2024, 0, 1, 9, 0, 0))

    mockedUserPreferences.getPreferences.mockResolvedValue({
      autoCheckin: {
        ...(DEFAULT_PREFERENCES as any).autoCheckin,
        globalEnabled: true,
        notifyUiOnCompletion: true,
      },
    })

    const disabledAccount: any = {
      id: "disabled",
      disabled: true,
      site_name: "Disabled Site",
      site_type: SITE_TYPES.VELOERA,
      account_info: { username: "disabled-user" },
      checkIn: runnableCheckIn(),
    }
    const detectionDisabledAccount: any = {
      id: "detection-off",
      disabled: false,
      site_name: "Detection Off",
      site_type: SITE_TYPES.VELOERA,
      account_info: { username: "off-user" },
      checkIn: noSelectedCheckIn(),
    }

    mockedAccountStorage.getAllAccounts.mockResolvedValue([
      disabledAccount,
      detectionDisabledAccount,
    ])

    await runCheckinsForTest({
      runType: AUTO_CHECKIN_RUN_TYPE.MANUAL,
    })

    expect(resolveProviderForTest).not.toHaveBeenCalled()
    expect(schedulerTestState.storedStatus.lastRunResult).toBe("skipped")
    expect(schedulerTestState.storedStatus.summary).toEqual({
      totalEligible: 1,
      executed: 0,
      successCount: 0,
      failedCount: 0,
      skippedCount: 1,
      needsRetry: false,
    })
    expect(schedulerTestState.storedStatus.perAccount.disabled).toMatchObject({
      status: "skipped",
      reasonCode: "account_disabled",
    })
    expect(
      schedulerTestState.storedStatus.perAccount["detection-off"],
    ).toMatchObject({
      status: "skipped",
      reasonCode: "no_selected_method",
    })
    expect(mockedBrowserApi.sendRuntimeMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        action: RuntimeActionIds.AutoCheckinRunCompleted,
        runKind: "manual",
        updatedAccountIds: [],
        summary: {
          totalEligible: 1,
          executed: 0,
          successCount: 0,
          failedCount: 0,
          skippedCount: 1,
          needsRetry: false,
        },
      }),
      { maxAttempts: 1 },
    )

    vi.useRealTimers()
  })

  it("allows targeted manual check-in when the global scheduled feature is disabled", async () => {
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
      perAccount: {
        target: {
          accountId: "target",
          accountName: "Target Site · user",
          status: "skipped",
          messageKey: "autoCheckin:skipReasons.account_disabled",
          reasonCode: "account_disabled",
          timestamp: Date.now() - 60_000,
        },
      },
      summary: {
        totalEligible: 1,
        executed: 0,
        successCount: 0,
        failedCount: 0,
        skippedCount: 1,
        needsRetry: false,
      },
    } as any

    const targetAccount: any = {
      id: "target",
      disabled: false,
      site_name: "Target Site",
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
    expect(
      schedulerTestState.storedStatus.perAccount.target.reasonCode,
    ).toBeUndefined()
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

  it("allows unscoped manual batch check-in while preserving account-level opt-out", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2024, 0, 1, 9, 0, 0))

    mockedUserPreferences.getPreferences.mockResolvedValue({
      autoCheckin: {
        ...(DEFAULT_PREFERENCES as any).autoCheckin,
        globalEnabled: false,
        notifyUiOnCompletion: true,
      },
    })

    const manuallyIncludedAccount: any = {
      id: "manual-included",
      disabled: false,
      site_name: "Manual Included",
      site_type: SITE_TYPES.VELOERA,
      account_info: { username: "included-user" },
      checkIn: runnableCheckIn(true),
    }
    const accountLevelOptOut: any = {
      id: "account-level-opt-out",
      disabled: false,
      site_name: "Account Level Opt Out",
      site_type: SITE_TYPES.VELOERA,
      account_info: { username: "opt-out-user" },
      checkIn: runnableCheckIn(false),
    }
    mockedAccountStorage.getAllAccounts.mockResolvedValue([
      manuallyIncludedAccount,
      accountLevelOptOut,
    ])

    const provider = {
      getReadiness: vi.fn(() => ({ ready: true })),
      checkIn: vi.fn(async () => ({ status: "success" })),
    }
    resolveProviderForTest.mockReturnValue(provider)

    await runCheckinsForTest({
      runType: AUTO_CHECKIN_RUN_TYPE.MANUAL,
    })

    expect(provider.checkIn).toHaveBeenCalledTimes(1)
    expect(schedulerTestState.storedStatus.perAccount).toMatchObject({
      "manual-included": {
        status: "success",
      },
      "account-level-opt-out": {
        status: "skipped",
        reasonCode: "auto_checkin_disabled",
      },
    })
    expect(schedulerTestState.storedStatus.summary).toMatchObject({
      totalEligible: 2,
      executed: 1,
      successCount: 1,
      failedCount: 0,
      skippedCount: 1,
      needsRetry: false,
    })
    expect(schedulerTestState.storedStatus.pendingRetry).toBe(false)
    expect(schedulerTestState.storedStatus.retryState).toBeUndefined()

    vi.useRealTimers()
  })

  it("preserves targeted manual history when runCheckins fails before execution", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2024, 0, 1, 9, 15, 0))

    mockedUserPreferences.getPreferences.mockResolvedValue({
      autoCheckin: {
        ...(DEFAULT_PREFERENCES as any).autoCheckin,
        globalEnabled: true,
        notifyUiOnCompletion: true,
      },
    })

    schedulerTestState.storedStatus = {
      perAccount: {
        legacy: {
          accountId: "legacy",
          accountName: "Legacy Site · user",
          status: "failed",
          timestamp: Date.now() - 60_000,
        },
      },
      retryState: {
        day: "2024-01-01",
        pendingAccountIds: ["legacy"],
        attemptsByAccount: { legacy: 1 },
      },
      pendingRetry: true,
      summary: {
        totalEligible: 1,
        executed: 1,
        successCount: 0,
        failedCount: 1,
        skippedCount: 0,
        needsRetry: true,
      },
    } as any

    mockedAccountStorage.getAllAccounts.mockRejectedValueOnce(
      new Error("storage exploded"),
    )

    await expect(
      runCheckinsForTest({
        runType: AUTO_CHECKIN_RUN_TYPE.MANUAL,
        targetAccountIds: ["legacy"],
      }),
    ).resolves.toBeUndefined()

    expect(schedulerTestState.storedStatus.lastRunResult).toBe("failed")
    expect(schedulerTestState.storedStatus.perAccount).toEqual({
      legacy: expect.objectContaining({
        accountId: "legacy",
        status: "failed",
      }),
    })
    expect(schedulerTestState.storedStatus.retryState).toEqual({
      day: "2024-01-01",
      pendingAccountIds: ["legacy"],
      attemptsByAccount: { legacy: 1 },
    })
    expect(schedulerTestState.storedStatus.pendingRetry).toBe(false)
    expect(mockedBrowserApi.sendRuntimeMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        action: RuntimeActionIds.AutoCheckinRunCompleted,
        runKind: "manual",
        updatedAccountIds: [],
      }),
      { maxAttempts: 1 },
    )

    vi.useRealTimers()
  })

  it("recovers notify-ui preference after a transient preferences read failure", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2024, 0, 1, 9, 15, 0))

    mockedUserPreferences.getPreferences
      .mockRejectedValueOnce(new Error("prefs exploded"))
      .mockResolvedValueOnce({
        autoCheckin: {
          ...(DEFAULT_PREFERENCES as any).autoCheckin,
          globalEnabled: true,
          notifyUiOnCompletion: true,
        },
      })

    schedulerTestState.storedStatus = {
      retryState: {
        day: "2024-01-01",
        pendingAccountIds: ["legacy"],
        attemptsByAccount: { legacy: 1 },
      },
      pendingRetry: true,
      perAccount: {
        legacy: {
          accountId: "legacy",
          accountName: "Legacy Site · user",
          status: "failed",
          timestamp: Date.now() - 60_000,
        },
      },
    } as any

    await expect(
      runCheckinsForTest({
        runType: AUTO_CHECKIN_RUN_TYPE.MANUAL,
      }),
    ).resolves.toBeUndefined()

    expect(mockedAccountStorage.getAllAccounts).not.toHaveBeenCalled()
    expect(schedulerTestState.storedStatus.lastRunResult).toBe("failed")
    expect(schedulerTestState.storedStatus.perAccount).toEqual({})
    expect(schedulerTestState.storedStatus.retryState).toEqual({
      day: "2024-01-01",
      pendingAccountIds: ["legacy"],
      attemptsByAccount: { legacy: 1 },
    })
    expect(schedulerTestState.storedStatus.pendingRetry).toBe(false)
    expect(mockedBrowserApi.sendRuntimeMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        action: RuntimeActionIds.AutoCheckinRunCompleted,
        runKind: "manual",
        updatedAccountIds: [],
      }),
      { maxAttempts: 1 },
    )

    vi.useRealTimers()
  })
})
