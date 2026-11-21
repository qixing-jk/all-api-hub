import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { DAILY_BALANCE_HISTORY_ALARM_NAME } from "~/services/history/dailyBalanceHistory/constants"
import {
  dailyBalanceHistoryScheduler,
  resolveBalanceHistoryPruneMessage,
  resolveBalanceHistoryRefreshNowMessage,
  resolveBalanceHistoryUpdateSettingsMessage,
  setupDailyBalanceHistoryMessagingListeners,
} from "~/services/history/dailyBalanceHistory/scheduler"
import { PROTECTION_BYPASS_USER_COMMANDS } from "~/services/protectionBypass/contracts"
import { BalanceHistoryMessageTypes } from "~/services/runtimeMessaging/messageTypes"
import { DEFAULT_BALANCE_HISTORY_PREFERENCES } from "~/types/dailyBalanceHistory"
import {
  TASK_NOTIFICATION_STATUSES,
  TASK_NOTIFICATION_TASKS,
} from "~/types/taskNotifications"
import {
  automaticExecution,
  userCommandExecution,
} from "~~/tests/services/protectionBypass/fixtures"

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
  mockRunAfterRefreshSync,
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
  mockRunAfterRefreshSync: vi.fn(),
}))

const balanceHistoryMessageHandlers = vi.hoisted(
  () => new Map<string, (message: any) => Promise<unknown> | unknown>(),
)
const mockOnBalanceHistoryMessage = vi.hoisted(() => vi.fn())

vi.mock(
  "~/services/history/dailyBalanceHistory/messaging",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("~/services/history/dailyBalanceHistory/messaging")
      >()
    return {
      ...actual,
      onBalanceHistoryMessage: mockOnBalanceHistoryMessage.mockImplementation(
        (type, handler) => {
          balanceHistoryMessageHandlers.set(type, handler)
          return vi.fn()
        },
      ),
    }
  },
)

vi.mock("~/services/preferences/userPreferences", () => ({
  userPreferences: {
    getPreferences: mockGetPreferences,
    savePreferences: mockSavePreferences,
  },
}))

vi.mock("~/services/accounts/accountStorage/accountQueries", () => ({
  accountQueries: { getEnabledAccounts: mockGetEnabledAccounts },
}))
vi.mock("~/services/accounts/accountStorage/accountRefresh", () => ({
  accountRefresh: {
    refreshAccount: mockRefreshAccount,
    refreshAllAccounts: mockRefreshAllAccounts,
  },
}))

vi.mock("~/services/history/dailyBalanceHistory/storage", () => ({
  dailyBalanceHistoryStorage: {
    pruneAll: mockPruneAll,
  },
}))

vi.mock("~/services/history/usageHistory/scheduler", () => ({
  usageHistoryScheduler: {
    runAfterRefreshSync: mockRunAfterRefreshSync,
  },
}))

vi.mock("~/utils/browser/alarms", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/utils/browser/alarms")>()
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

const refreshAllExecution = userCommandExecution(
  PROTECTION_BYPASS_USER_COMMANDS.RefreshAllAccounts,
)

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
      balanceHistoryCapturedCount: 2,
    })
    mockRefreshAccount.mockResolvedValue({
      refreshed: true,
      balanceHistoryCaptured: true,
    })
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

  it("saves longer retention and still honors the user's period", async () => {
    await dailyBalanceHistoryScheduler.updateSettings({ retentionDays: 7300 })
    expect(mockSavePreferences).toHaveBeenCalledWith({
      balanceHistory: expect.objectContaining({ retentionDays: 7300 }),
    })
    expect(mockPruneAll).toHaveBeenCalledWith({ retentionDays: 7300 })
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
        retentionDays: 9999,
      },
    })
    expect(mockPruneAll).toHaveBeenCalledWith({ retentionDays: 9999 })
    expect(mockClearAlarm).toHaveBeenCalledWith(
      DAILY_BALANCE_HISTORY_ALARM_NAME,
    )
  })

  it("refreshes all accounts when no account ids are provided", async () => {
    const result = await dailyBalanceHistoryScheduler.refreshNow(
      refreshAllExecution,
      undefined,
    )

    expect(mockRefreshAllAccounts).toHaveBeenCalledWith(true, {
      protectionBypassExecution: refreshAllExecution,
    })
    expect(result).toEqual({
      success: 2,
      failed: 1,
      refreshedCount: 1,
    })
  })

  it("counts only persisted history receipts in a bulk refresh", async () => {
    mockRefreshAllAccounts.mockResolvedValueOnce({
      success: 2,
      failed: 1,
      refreshedCount: 2,
      balanceHistoryCapturedCount: 1,
    })
    expect(
      await dailyBalanceHistoryScheduler.refreshNow(refreshAllExecution),
    ).toEqual({ success: 1, failed: 2, refreshedCount: 2 })
  })

  it("keeps account refresh counts independent from missing or failed history captures", async () => {
    mockRefreshAccount
      .mockResolvedValueOnce({ refreshed: true, balanceHistoryCaptured: true })
      .mockResolvedValueOnce({ refreshed: true, balanceHistoryCaptured: false })
      .mockResolvedValueOnce({ refreshed: false })
    expect(
      await dailyBalanceHistoryScheduler.refreshNow(refreshAllExecution, [
        "captured",
        "write-failed",
        "legacy",
      ]),
    ).toEqual({ success: 1, failed: 2, refreshedCount: 2 })
  })

  it("reports alarm coverage gaps even when both accounts refreshed successfully", async () => {
    let handler: ((alarm: { name: string }) => Promise<void>) | undefined
    mockOnAlarm.mockImplementation((value) => {
      handler = value
    })
    mockGetEnabledAccounts.mockResolvedValue([
      { id: "captured" },
      { id: "legacy" },
    ])
    mockRefreshAccount
      .mockResolvedValueOnce({ refreshed: true, balanceHistoryCaptured: true })
      .mockResolvedValueOnce({ refreshed: true, balanceHistoryCaptured: false })
    await dailyBalanceHistoryScheduler.initialize()
    await handler?.({ name: DAILY_BALANCE_HISTORY_ALARM_NAME })
    expect(mockNotifyTaskResult).toHaveBeenCalledWith(
      expect.objectContaining({
        counts: { total: 2, success: 1, failed: 1, skipped: 0 },
      }),
    )
  })

  it("refreshes only valid requested ids and counts failures separately", async () => {
    mockRefreshAccount
      .mockResolvedValueOnce({ refreshed: true, balanceHistoryCaptured: true })
      .mockResolvedValueOnce({ refreshed: false })
      .mockRejectedValueOnce(new Error("boom"))

    const result = await dailyBalanceHistoryScheduler.refreshNow(
      refreshAllExecution,
      ["acc-1", " ", "acc-2", "acc-3"],
    )

    expect(mockRefreshAccount).toHaveBeenCalledTimes(3)
    expect(mockRefreshAccount).toHaveBeenNthCalledWith(1, "acc-1", true, {
      protectionBypassExecution: refreshAllExecution,
    })
    expect(mockRefreshAccount).toHaveBeenNthCalledWith(2, "acc-2", true, {
      protectionBypassExecution: refreshAllExecution,
    })
    expect(mockRefreshAccount).toHaveBeenNthCalledWith(3, "acc-3", true, {
      protectionBypassExecution: refreshAllExecution,
    })
    expect(result).toEqual({
      success: 1,
      failed: 2,
      refreshedCount: 1,
    })
  })

  it("returns zero counts when an explicit id list contains no usable ids", async () => {
    const result = await dailyBalanceHistoryScheduler.refreshNow(
      refreshAllExecution,
      ["", "   "],
    )

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
      .mockResolvedValueOnce({ refreshed: true, balanceHistoryCaptured: true })
      .mockResolvedValueOnce({ refreshed: false })
      .mockRejectedValueOnce(new Error("failed"))

    const result = await dailyBalanceHistoryScheduler.runEndOfDayCapture({
      trigger: "alarm",
    })

    expect(mockRefreshAccount).toHaveBeenCalledTimes(3)
    expect(mockRefreshAccount).toHaveBeenNthCalledWith(1, "a", true, {
      includeTodayCashflow: true,
      balanceHistoryCaptureSource: "alarm",
      protectionBypassExecution: automaticExecution(
        "balance_history",
        "scheduled",
      ),
    })
    expect(result).toEqual({
      started: true,
      trigger: "alarm",
      totals: {
        success: 1,
        failed: 2,
        refreshed: 1,
      },
    })
    expect(mockCreateAlarm).toHaveBeenCalledWith(
      DAILY_BALANCE_HISTORY_ALARM_NAME,
      {
        when: getExpectedEndOfDayCaptureTime(),
      },
    )
    expect(mockRunAfterRefreshSync).not.toHaveBeenCalled()
  })

  it("returns null on capture failure and resets the running guard", async () => {
    mockGetPreferences.mockRejectedValueOnce(new Error("prefs failed"))
    const first = await dailyBalanceHistoryScheduler.runEndOfDayCapture({
      trigger: "alarm",
    })
    expect(first).toBeNull()

    mockGetEnabledAccounts.mockResolvedValue([{ id: "a" }])
    mockRefreshAccount.mockResolvedValueOnce({
      refreshed: true,
      balanceHistoryCaptured: true,
    })
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
        protectionBypassExecution: refreshAllExecution,
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
  })

  it("rejects malformed scoped refresh payloads instead of refreshing every account", async () => {
    const response = await resolveBalanceHistoryRefreshNowMessage({
      accountIds: "not-an-array" as any,
      protectionBypassExecution: refreshAllExecution,
    })

    expect(response).toEqual({
      success: false,
      error: "accountIds must be an array when provided",
    })
    expect(mockRefreshAllAccounts).not.toHaveBeenCalled()
    expect(mockRefreshAccount).not.toHaveBeenCalled()
  })

  it("rejects refresh requests without an execution at the runtime boundary", async () => {
    const response = await resolveBalanceHistoryRefreshNowMessage(undefined)

    expect(response).toEqual({
      success: false,
      error: "Invalid protection bypass execution",
    })
    expect(mockRefreshAllAccounts).not.toHaveBeenCalled()
    expect(mockRefreshAccount).not.toHaveBeenCalled()
  })

  it.each([
    {
      version: 1,
      kind: "user_command",
      command: "refresh_all_accounts",
      surface: "options",
    },
    {
      version: 2,
      kind: "user_command",
      command: "unknown",
      surface: "options",
    },
    {
      version: 2,
      kind: "automatic",
      feature: "account_refresh",
      trigger: "invalid",
      surface: "background",
    },
  ])("rejects malformed execution metadata: %j", async (execution) => {
    const response = await resolveBalanceHistoryRefreshNowMessage({
      protectionBypassExecution: execution as any,
    })

    expect(response).toEqual({
      success: false,
      error: "Invalid protection bypass execution",
    })
    expect(mockRefreshAllAccounts).not.toHaveBeenCalled()
    expect(mockRefreshAccount).not.toHaveBeenCalled()
  })

  it("rejects a well-formed refresh command from another workflow", async () => {
    const response = await resolveBalanceHistoryRefreshNowMessage({
      protectionBypassExecution: userCommandExecution(
        PROTECTION_BYPASS_USER_COMMANDS.ManualCheckin,
      ),
    })

    expect(response).toEqual({
      success: false,
      error: "Invalid protection bypass execution",
    })
    expect(mockRefreshAllAccounts).not.toHaveBeenCalled()
    expect(mockRefreshAccount).not.toHaveBeenCalled()
  })

  it("rejects another workflow at the serialized refresh listener", async () => {
    setupDailyBalanceHistoryMessagingListeners()
    const handler = balanceHistoryMessageHandlers.get(
      BalanceHistoryMessageTypes.RefreshNow,
    )

    await expect(
      handler?.({
        data: {
          protectionBypassExecution: userCommandExecution(
            PROTECTION_BYPASS_USER_COMMANDS.ManualCheckin,
          ),
        },
      }),
    ).resolves.toEqual({
      success: false,
      error: "Invalid protection bypass execution",
    })
    expect(mockRefreshAllAccounts).not.toHaveBeenCalled()
    expect(mockRefreshAccount).not.toHaveBeenCalled()
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
      protectionBypassExecution: refreshAllExecution,
    })

    expect(mockRefreshAllAccounts).toHaveBeenCalledWith(true, {
      protectionBypassExecution: refreshAllExecution,
    })
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
    mockRefreshAccount.mockResolvedValue({
      refreshed: true,
      balanceHistoryCaptured: true,
    })

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
