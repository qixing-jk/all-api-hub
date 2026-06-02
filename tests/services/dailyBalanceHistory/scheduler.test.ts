import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import { DAILY_BALANCE_HISTORY_ALARM_NAME } from "~/services/history/dailyBalanceHistory/constants"
import {
  dailyBalanceHistoryScheduler,
  handleDailyBalanceHistoryMessage,
  resolveBalanceHistoryPruneMessage,
  resolveBalanceHistoryRefreshNowMessage,
  resolveBalanceHistoryUpdateSettingsMessage,
} from "~/services/history/dailyBalanceHistory/scheduler"
import { DEFAULT_BALANCE_HISTORY_PREFERENCES } from "~/types/dailyBalanceHistory"
import {
  TASK_NOTIFICATION_STATUSES,
  TASK_NOTIFICATION_TASKS,
} from "~/types/taskNotifications"

const {
  mockGetPreferences,
  mockSavePreferences,
  mockGetEnabledAccounts,
  mockRefreshAccount,
  mockRefreshAllAccounts,
  mockUpsertSnapshot,
  mockPruneAll,
  mockCreateAlarm,
  mockClearAlarm,
  mockGetAlarm,
  mockHasAlarmsAPI,
  mockOnAlarm,
  mockNotifyTaskResult,
} = vi.hoisted(() => ({
  mockGetPreferences: vi.fn(),
  mockSavePreferences: vi.fn(),
  mockGetEnabledAccounts: vi.fn(),
  mockRefreshAccount: vi.fn(),
  mockRefreshAllAccounts: vi.fn(),
  mockUpsertSnapshot: vi.fn(),
  mockPruneAll: vi.fn(),
  mockCreateAlarm: vi.fn(),
  mockClearAlarm: vi.fn(),
  mockGetAlarm: vi.fn(),
  mockHasAlarmsAPI: vi.fn(),
  mockOnAlarm: vi.fn(),
  mockNotifyTaskResult: vi.fn(),
}))

vi.mock("~/services/preferences/userPreferences", () => ({
  userPreferences: {
    getPreferences: mockGetPreferences,
    savePreferences: mockSavePreferences,
  },
}))

vi.mock("~/services/accounts/accountStorage", () => ({
  accountStorage: {
    getEnabledAccounts: mockGetEnabledAccounts,
    refreshAccount: mockRefreshAccount,
    refreshAllAccounts: mockRefreshAllAccounts,
  },
}))

vi.mock("~/services/history/dailyBalanceHistory/storage", () => ({
  dailyBalanceHistoryStorage: {
    upsertSnapshot: mockUpsertSnapshot,
    pruneAll: mockPruneAll,
  },
}))

vi.mock("~/utils/browser/browserApi", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/utils/browser/browserApi")>()
  return {
    ...actual,
    createAlarm: mockCreateAlarm,
    clearAlarm: mockClearAlarm,
    getAlarm: mockGetAlarm,
    hasAlarmsAPI: mockHasAlarmsAPI,
    onAlarm: mockOnAlarm,
  }
})

vi.mock("~/services/notifications/taskNotificationService", () => ({
  notifyTaskResult: mockNotifyTaskResult,
}))

describe("dailyBalanceHistoryScheduler", () => {
  const getExpectedEndOfDayCaptureTime = () => {
    const expected = new Date()
    expected.setHours(23, 55, 0, 0)
    return expected.getTime()
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-03-28T08:00:00.000Z"))
    ;(dailyBalanceHistoryScheduler as any).isInitialized = false
    ;(dailyBalanceHistoryScheduler as any).isRunning = false

    mockGetPreferences.mockResolvedValue({
      balanceHistory: {
        ...DEFAULT_BALANCE_HISTORY_PREFERENCES,
        enabled: true,
        endOfDayCapture: { enabled: true },
        retentionDays: 30,
      },
    })
    mockSavePreferences.mockResolvedValue(true)
    mockGetEnabledAccounts.mockResolvedValue([])
    mockRefreshAllAccounts.mockResolvedValue({
      success: 2,
      failed: 1,
      refreshedCount: 1,
    })
    mockRefreshAccount.mockResolvedValue({ refreshed: true })
    mockUpsertSnapshot.mockResolvedValue(true)
    mockPruneAll.mockResolvedValue(true)
    mockHasAlarmsAPI.mockReturnValue(true)
    mockGetAlarm.mockResolvedValue(undefined)
    mockCreateAlarm.mockResolvedValue(undefined)
    mockClearAlarm.mockResolvedValue(true)
    mockNotifyTaskResult.mockResolvedValue(true)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.useRealTimers()
  })

  it("initializes once, registers the alarm listener, and schedules the next capture", async () => {
    await dailyBalanceHistoryScheduler.initialize()
    await dailyBalanceHistoryScheduler.initialize()

    expect(mockOnAlarm).toHaveBeenCalledTimes(1)
    expect(mockCreateAlarm).toHaveBeenCalledWith(
      DAILY_BALANCE_HISTORY_ALARM_NAME,
      {
        when: getExpectedEndOfDayCaptureTime(),
      },
    )
  })

  it("schedules tomorrow when today's capture time has already passed", async () => {
    vi.setSystemTime(new Date(2026, 2, 28, 23, 56, 0, 0))
    const expected = new Date(Date.now())
    expected.setDate(expected.getDate() + 1)
    expected.setHours(23, 55, 0, 0)

    await dailyBalanceHistoryScheduler.initialize()

    expect(mockCreateAlarm).toHaveBeenCalledWith(
      DAILY_BALANCE_HISTORY_ALARM_NAME,
      { when: expected.getTime() },
    )
  })

  it("ignores unrelated alarms", async () => {
    let alarmHandler: ((alarm: { name: string }) => Promise<void>) | undefined
    mockOnAlarm.mockImplementation((handler) => {
      alarmHandler = handler
    })

    await dailyBalanceHistoryScheduler.initialize()
    await alarmHandler?.({ name: "other-alarm" })

    expect(mockGetEnabledAccounts).not.toHaveBeenCalled()
    expect(mockNotifyTaskResult).not.toHaveBeenCalled()
  })

  it("reuses a preserved future alarm instead of creating a new one", async () => {
    mockGetAlarm.mockResolvedValue({
      name: DAILY_BALANCE_HISTORY_ALARM_NAME,
      scheduledTime: Date.now() + 5 * 60_000,
    })

    await dailyBalanceHistoryScheduler.initialize()

    expect(mockCreateAlarm).not.toHaveBeenCalled()
  })

  it("clears the alarm when capture scheduling is disabled", async () => {
    mockGetPreferences.mockResolvedValue({
      balanceHistory: {
        ...DEFAULT_BALANCE_HISTORY_PREFERENCES,
        enabled: true,
        endOfDayCapture: { enabled: false },
        retentionDays: 30,
      },
    })

    await dailyBalanceHistoryScheduler.initialize()

    expect(mockClearAlarm).toHaveBeenCalledWith(
      DAILY_BALANCE_HISTORY_ALARM_NAME,
    )
    expect(mockCreateAlarm).not.toHaveBeenCalled()
  })

  it("disables end-of-day capture with a warning when alarms are unavailable", async () => {
    mockHasAlarmsAPI.mockReturnValue(false)

    const result = await dailyBalanceHistoryScheduler.updateSettings({
      enabled: true,
      endOfDayCapture: { enabled: true },
      retentionDays: 9999,
    })

    expect(result).toEqual({
      warning:
        "Alarms API not supported; end-of-day capture has been disabled.",
    })
    expect(mockSavePreferences).toHaveBeenCalledWith({
      balanceHistory: {
        enabled: true,
        endOfDayCapture: { enabled: false },
        estimatedTodayIncome: { enabled: false },
        retentionDays: 3650,
      },
    })
    expect(mockPruneAll).toHaveBeenCalledWith({ retentionDays: 3650 })
    expect(mockClearAlarm).toHaveBeenCalledWith(
      DAILY_BALANCE_HISTORY_ALARM_NAME,
    )
  })

  it("refreshes all accounts when no account ids are provided", async () => {
    const result = await dailyBalanceHistoryScheduler.refreshNow()

    expect(mockRefreshAllAccounts).toHaveBeenCalledWith(true)
    expect(result).toEqual({
      success: 2,
      failed: 1,
      refreshedCount: 1,
    })
  })

  it("refreshes only valid requested ids and counts failures separately", async () => {
    mockRefreshAccount
      .mockResolvedValueOnce({ refreshed: true })
      .mockResolvedValueOnce({ refreshed: false })
      .mockRejectedValueOnce(new Error("boom"))

    const result = await dailyBalanceHistoryScheduler.refreshNow([
      "acc-1",
      " ",
      "acc-2",
      "acc-3",
    ])

    expect(mockRefreshAccount).toHaveBeenCalledTimes(3)
    expect(mockRefreshAccount).toHaveBeenNthCalledWith(1, "acc-1", true)
    expect(mockRefreshAccount).toHaveBeenNthCalledWith(2, "acc-2", true)
    expect(mockRefreshAccount).toHaveBeenNthCalledWith(3, "acc-3", true)
    expect(result).toEqual({
      success: 2,
      failed: 1,
      refreshedCount: 1,
    })
  })

  it("returns zero counts when an explicit id list contains no usable ids", async () => {
    const result = await dailyBalanceHistoryScheduler.refreshNow(["", "   "])

    expect(result).toEqual({
      success: 0,
      failed: 0,
      refreshedCount: 0,
    })
    expect(mockRefreshAccount).not.toHaveBeenCalled()
  })

  it("skips end-of-day capture when the feature or schedule is disabled", async () => {
    mockGetPreferences.mockResolvedValue({
      balanceHistory: {
        enabled: false,
        endOfDayCapture: { enabled: true },
        retentionDays: 30,
      },
    })

    const result = await dailyBalanceHistoryScheduler.runEndOfDayCapture({
      trigger: "alarm",
    })

    expect(result).toEqual({ started: false, skipped: true })
    expect(mockGetEnabledAccounts).not.toHaveBeenCalled()
  })

  it("captures all enabled accounts, counts refreshed results, and reschedules", async () => {
    mockGetEnabledAccounts.mockResolvedValue([
      { id: "a" },
      { id: "b" },
      { id: "c" },
    ])
    mockRefreshAccount
      .mockResolvedValueOnce({ refreshed: true })
      .mockResolvedValueOnce({ refreshed: false })
      .mockRejectedValueOnce(new Error("failed"))

    const result = await dailyBalanceHistoryScheduler.runEndOfDayCapture({
      trigger: "alarm",
    })

    expect(mockRefreshAccount).toHaveBeenCalledTimes(3)
    expect(mockRefreshAccount).toHaveBeenNthCalledWith(1, "a", true, {
      includeTodayCashflow: true,
      balanceHistoryCaptureSource: "alarm",
    })
    expect(result).toEqual({
      started: true,
      trigger: "alarm",
      totals: {
        success: 2,
        failed: 1,
        refreshed: 1,
      },
    })
    expect(mockCreateAlarm).toHaveBeenCalledWith(
      DAILY_BALANCE_HISTORY_ALARM_NAME,
      {
        when: getExpectedEndOfDayCaptureTime(),
      },
    )
  })

  it("returns null on capture failure and resets the running guard", async () => {
    mockGetPreferences.mockRejectedValueOnce(new Error("prefs failed"))
    const first = await dailyBalanceHistoryScheduler.runEndOfDayCapture({
      trigger: "alarm",
    })
    expect(first).toBeNull()

    mockGetEnabledAccounts.mockResolvedValue([{ id: "a" }])
    mockRefreshAccount.mockResolvedValueOnce({ refreshed: true })
    const second = await dailyBalanceHistoryScheduler.runEndOfDayCapture({
      trigger: "refresh",
    })

    expect(second).toEqual({
      started: true,
      trigger: "refresh",
      totals: {
        success: 1,
        failed: 0,
        refreshed: 1,
      },
    })
  })

  it("swallows notification delivery failures for alarm-triggered capture errors", async () => {
    mockGetPreferences.mockRejectedValueOnce(new Error("prefs failed"))
    mockNotifyTaskResult.mockRejectedValueOnce(new Error("notify failed"))

    await expect(
      dailyBalanceHistoryScheduler.runEndOfDayCapture({
        trigger: "alarm",
      }),
    ).resolves.toBeNull()
  })

  it("routes runtime messages to the correct handlers", async () => {
    await expect(
      resolveBalanceHistoryUpdateSettingsMessage({
        settings: { retentionDays: 7 },
      }),
    ).resolves.toEqual({
      success: true,
      data: { warning: undefined },
    })

    await expect(
      resolveBalanceHistoryRefreshNowMessage({
        accountIds: ["a"],
      }),
    ).resolves.toEqual({
      success: true,
      data: {
        success: 1,
        failed: 0,
        refreshedCount: 1,
      },
    })

    await expect(resolveBalanceHistoryPruneMessage()).resolves.toEqual({
      success: true,
      data: undefined,
    })

    const unknownResponse = vi.fn()
    await handleDailyBalanceHistoryMessage(
      { action: "balanceHistory:unknown" },
      unknownResponse,
    )
    expect(unknownResponse).toHaveBeenCalledWith({
      success: false,
      error: "Unknown action",
    })
  })

  it("rejects malformed scoped refresh payloads instead of refreshing every account", async () => {
    const response = await resolveBalanceHistoryRefreshNowMessage({
      accountIds: "not-an-array" as any,
    })

    expect(response).toEqual({
      success: false,
      error: "accountIds must be an array when provided",
    })
    expect(mockRefreshAllAccounts).not.toHaveBeenCalled()
    expect(mockRefreshAccount).not.toHaveBeenCalled()
  })

  it("seeds development snapshots for enabled accounts that can be estimated", async () => {
    mockGetEnabledAccounts.mockResolvedValue([
      {
        id: "included",
        account_info: {
          quota: 12_000_000,
          today_income: 500_000,
          today_quota_consumption: 1_000_000,
        },
        exchange_rate: 7,
      },
      {
        id: "excluded",
        excludeFromTodayIncome: true,
        account_info: {
          quota: 20_000_000,
          today_income: 1_000_000,
          today_quota_consumption: 2_000_000,
        },
        exchange_rate: 7,
      },
      {
        id: "manual",
        manualBalanceUsd: "12.34",
        account_info: {
          quota: 30_000_000,
          today_income: 1_000_000,
          today_quota_consumption: 2_000_000,
        },
        exchange_rate: 7,
      },
    ])

    const result =
      await dailyBalanceHistoryScheduler.debugSeedEstimateSnapshots()

    expect(mockUpsertSnapshot).toHaveBeenCalledTimes(2)
    expect(mockUpsertSnapshot).toHaveBeenNthCalledWith(1, {
      accountId: "included",
      dayKey: "2026-03-27",
      retentionDays: 30,
      snapshot: {
        quota: 11_500_000,
        today_income: 0,
        today_quota_consumption: 0,
        capturedAt: Date.now() - 24 * 60 * 60 * 1000,
        source: "refresh",
      },
    })
    expect(mockUpsertSnapshot).toHaveBeenNthCalledWith(2, {
      accountId: "included",
      dayKey: "2026-03-28",
      retentionDays: 30,
      snapshot: {
        quota: 12_000_000,
        today_income: 500_000,
        today_quota_consumption: 1_000_000,
        capturedAt: Date.now(),
        source: "refresh",
      },
    })
    expect(result).toEqual({
      seeded: 1,
      skipped: 2,
      todayKey: "2026-03-28",
      yesterdayKey: "2026-03-27",
    })
  })

  it("uses default seed cashflow values and skips invalid quotas", async () => {
    mockGetEnabledAccounts.mockResolvedValue([
      {
        id: "defaulted",
        account_info: {
          quota: 12_000_000,
          today_income: Number.NaN,
          today_quota_consumption: Number.NaN,
        },
        exchange_rate: 7,
      },
      {
        id: "invalid",
        account_info: {
          quota: 0,
          today_income: 500_000,
          today_quota_consumption: 1_000_000,
        },
        exchange_rate: 7,
      },
    ])

    const result =
      await dailyBalanceHistoryScheduler.debugSeedEstimateSnapshots()

    expect(mockUpsertSnapshot).toHaveBeenCalledTimes(2)
    expect(mockUpsertSnapshot).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        accountId: "defaulted",
        snapshot: expect.objectContaining({
          quota: 12_000_000,
          today_income: 0,
          today_quota_consumption: 0,
        }),
      }),
    )
    expect(mockUpsertSnapshot).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        accountId: "defaulted",
        snapshot: expect.objectContaining({
          quota: 12_000_000,
          today_income: 0,
          today_quota_consumption: 1_000_000,
        }),
      }),
    )
    expect(result).toEqual({
      seeded: 1,
      skipped: 1,
      todayKey: "2026-03-28",
      yesterdayKey: "2026-03-27",
    })
  })

  it("counts failed snapshot writes as skipped during development seeding", async () => {
    mockGetEnabledAccounts.mockResolvedValue([
      {
        id: "failed",
        account_info: {
          quota: 12_000_000,
          today_income: 500_000,
          today_quota_consumption: 1_000_000,
        },
        exchange_rate: 7,
      },
    ])
    mockUpsertSnapshot.mockResolvedValueOnce(true).mockResolvedValueOnce(false)

    const result =
      await dailyBalanceHistoryScheduler.debugSeedEstimateSnapshots()

    expect(result).toEqual({
      seeded: 0,
      skipped: 1,
      todayKey: "2026-03-28",
      yesterdayKey: "2026-03-27",
    })
  })

  it("keeps both seeded days even when the configured retention is one day", async () => {
    mockGetPreferences.mockResolvedValue({
      balanceHistory: {
        ...DEFAULT_BALANCE_HISTORY_PREFERENCES,
        enabled: true,
        endOfDayCapture: { enabled: true },
        retentionDays: 1,
      },
    })
    mockGetEnabledAccounts.mockResolvedValue([
      {
        id: "included",
        account_info: {
          quota: 12_000_000,
          today_income: 500_000,
          today_quota_consumption: 1_000_000,
        },
        exchange_rate: 7,
      },
    ])

    const result =
      await dailyBalanceHistoryScheduler.debugSeedEstimateSnapshots()

    expect(mockUpsertSnapshot).toHaveBeenCalledTimes(2)
    expect(mockUpsertSnapshot).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ retentionDays: 2 }),
    )
    expect(mockUpsertSnapshot).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ retentionDays: 2 }),
    )
    expect(result).toEqual({
      seeded: 1,
      skipped: 0,
      todayKey: "2026-03-28",
      yesterdayKey: "2026-03-27",
    })
  })

  it("routes the development snapshot seed runtime message", async () => {
    vi.stubEnv("MODE", "development")
    mockGetEnabledAccounts.mockResolvedValue([
      {
        id: "included",
        account_info: {
          quota: 12_000_000,
          today_income: 500_000,
          today_quota_consumption: 1_000_000,
        },
        exchange_rate: 7,
      },
    ])

    const response = vi.fn()
    await handleDailyBalanceHistoryMessage(
      {
        action: RuntimeActionIds.BalanceHistoryDebugSeedEstimateSnapshots,
      },
      response,
    )

    expect(response).toHaveBeenCalledWith({
      success: true,
      data: expect.objectContaining({ seeded: 1, skipped: 0 }),
    })
  })

  it("rejects the snapshot seed runtime message outside development mode", async () => {
    vi.stubEnv("MODE", "production")

    const response = vi.fn()
    await handleDailyBalanceHistoryMessage(
      {
        action: RuntimeActionIds.BalanceHistoryDebugSeedEstimateSnapshots,
      },
      response,
    )

    expect(mockUpsertSnapshot).not.toHaveBeenCalled()
    expect(response).toHaveBeenCalledWith({
      success: false,
      error: "Debug action unavailable",
    })
  })

  it("returns null immediately when a capture run is already active", async () => {
    ;(dailyBalanceHistoryScheduler as any).isRunning = true

    const result = await dailyBalanceHistoryScheduler.runEndOfDayCapture({
      trigger: "refresh",
    })

    expect(result).toBeNull()
    expect(mockGetPreferences).not.toHaveBeenCalled()
  })

  it("routes omitted refresh message account ids to a full refresh", async () => {
    const response = await resolveBalanceHistoryRefreshNowMessage({
      accountIds: undefined,
    })

    expect(mockRefreshAllAccounts).toHaveBeenCalledWith(true)
    expect(response).toEqual({
      success: true,
      data: {
        success: 2,
        failed: 1,
        refreshedCount: 1,
      },
    })
  })

  it("returns a runtime error response when message handling throws", async () => {
    mockPruneAll.mockRejectedValueOnce(new Error("storage closed"))

    await expect(resolveBalanceHistoryPruneMessage()).resolves.toEqual({
      success: false,
      error: "storage closed",
    })
  })

  it("notifies successful alarm captures when at least one account was processed", async () => {
    let alarmHandler: ((alarm: { name: string }) => Promise<void>) | undefined
    mockOnAlarm.mockImplementation((handler) => {
      alarmHandler = handler
    })
    mockGetEnabledAccounts.mockResolvedValue([{ id: "a" }])
    mockRefreshAccount.mockResolvedValue({ refreshed: true })

    await dailyBalanceHistoryScheduler.initialize()
    await alarmHandler?.({ name: DAILY_BALANCE_HISTORY_ALARM_NAME })

    expect(mockNotifyTaskResult).toHaveBeenCalledWith({
      task: TASK_NOTIFICATION_TASKS.BalanceHistoryCapture,
      status: TASK_NOTIFICATION_STATUSES.Success,
      counts: {
        total: 1,
        success: 1,
        failed: 0,
        skipped: 0,
      },
    })
  })

  it("skips alarm notifications when the capture did not process any accounts", async () => {
    let alarmHandler: ((alarm: { name: string }) => Promise<void>) | undefined
    mockOnAlarm.mockImplementation((handler) => {
      alarmHandler = handler
    })
    mockGetEnabledAccounts.mockResolvedValue([])

    await dailyBalanceHistoryScheduler.initialize()
    await alarmHandler?.({ name: DAILY_BALANCE_HISTORY_ALARM_NAME })

    expect(mockNotifyTaskResult).not.toHaveBeenCalled()
  })

  it("notifies alarm failures when the capture run throws", async () => {
    let alarmHandler: ((alarm: { name: string }) => Promise<void>) | undefined
    mockOnAlarm.mockImplementation((handler) => {
      alarmHandler = handler
    })
    mockGetEnabledAccounts.mockResolvedValue([{ id: "a" }])
    mockRefreshAccount.mockRejectedValue(new Error("refresh failed"))

    await dailyBalanceHistoryScheduler.initialize()
    await alarmHandler?.({ name: DAILY_BALANCE_HISTORY_ALARM_NAME })

    expect(mockNotifyTaskResult).toHaveBeenCalledWith({
      task: TASK_NOTIFICATION_TASKS.BalanceHistoryCapture,
      status: TASK_NOTIFICATION_STATUSES.Failure,
      counts: {
        total: 1,
        success: 0,
        failed: 1,
        skipped: 0,
      },
    })
  })
})
