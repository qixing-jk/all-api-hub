import { beforeEach, describe, expect, it, vi } from "vitest"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import { DAILY_BALANCE_HISTORY_ALARM_NAME } from "~/services/history/dailyBalanceHistory/constants"
import {
  dailyBalanceHistoryScheduler,
  handleDailyBalanceHistoryMessage,
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
    mockPruneAll.mockResolvedValue(true)
    mockHasAlarmsAPI.mockReturnValue(true)
    mockGetAlarm.mockResolvedValue(undefined)
    mockCreateAlarm.mockResolvedValue(undefined)
    mockClearAlarm.mockResolvedValue(true)
    mockNotifyTaskResult.mockResolvedValue(true)
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

  it("reuses a preserved future alarm instead of creating a new one", async () => {
    mockGetAlarm.mockResolvedValue({
      name: DAILY_BALANCE_HISTORY_ALARM_NAME,
      scheduledTime: Date.now() + 5 * 60_000,
    })

    await dailyBalanceHistoryScheduler.initialize()

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
    const updateResponse = vi.fn()
    await handleDailyBalanceHistoryMessage(
      {
        action: RuntimeActionIds.BalanceHistoryUpdateSettings,
        settings: { retentionDays: 7 },
      },
      updateResponse,
    )
    expect(updateResponse).toHaveBeenCalledWith({
      success: true,
      data: { warning: undefined },
    })

    const refreshResponse = vi.fn()
    await handleDailyBalanceHistoryMessage(
      {
        action: RuntimeActionIds.BalanceHistoryRefreshNow,
        accountIds: ["a"],
      },
      refreshResponse,
    )
    expect(refreshResponse).toHaveBeenCalledWith({
      success: true,
      data: {
        success: 1,
        failed: 0,
        refreshedCount: 1,
      },
    })

    const pruneResponse = vi.fn()
    await handleDailyBalanceHistoryMessage(
      {
        action: RuntimeActionIds.BalanceHistoryPrune,
      },
      pruneResponse,
    )
    expect(pruneResponse).toHaveBeenCalledWith({ success: true })

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
