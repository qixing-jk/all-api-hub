import { beforeEach, describe, expect, it, vi } from "vitest"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import { accountStorage } from "~/services/accounts/accountStorage"
import {
  handleUsageHistoryMessage,
  usageHistoryScheduler,
} from "~/services/history/usageHistory/scheduler"
import { usageHistoryStorage } from "~/services/history/usageHistory/storage"
import { syncUsageHistoryForAccount } from "~/services/history/usageHistory/sync"
import {
  DEFAULT_PREFERENCES,
  userPreferences,
} from "~/services/preferences/userPreferences"
import {
  TASK_NOTIFICATION_STATUSES,
  TASK_NOTIFICATION_TASKS,
} from "~/types/taskNotifications"
import {
  DEFAULT_USAGE_HISTORY_PREFERENCES,
  USAGE_HISTORY_SCHEDULE_MODE,
} from "~/types/usageHistory"
import {
  clearAlarm,
  createAlarm,
  hasAlarmsAPI,
  onAlarm,
} from "~/utils/browser/browserApi"

const registeredAlarmListeners: Array<
  (alarm: { name: string }) => Promise<void> | void
> = []
const notifyTaskResultMock = vi.fn()

vi.mock("~/services/accounts/accountStorage", () => ({
  accountStorage: {
    getAccountById: vi.fn(),
    getEnabledAccounts: vi.fn(),
  },
}))

vi.mock("~/services/history/usageHistory/storage", () => ({
  usageHistoryStorage: {
    pruneAllAccounts: vi.fn(),
  },
}))

vi.mock("~/services/history/usageHistory/sync", () => ({
  syncUsageHistoryForAccount: vi.fn(),
}))

vi.mock("~/services/preferences/userPreferences", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("~/services/preferences/userPreferences")
    >()

  return {
    ...actual,
    userPreferences: {
      getPreferences: vi.fn(),
      savePreferences: vi.fn(),
    },
  }
})

vi.mock("~/utils/browser/browserApi", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/utils/browser/browserApi")>()

  return {
    ...actual,
    clearAlarm: vi.fn(),
    createAlarm: vi.fn(),
    hasAlarmsAPI: vi.fn(),
    onAlarm: vi.fn((listener) => {
      registeredAlarmListeners.push(listener)
    }),
  }
})

vi.mock("~/services/notifications/taskNotificationService", () => ({
  notifyTaskResult: (...args: unknown[]) => notifyTaskResultMock(...args),
}))

const createUsageHistoryConfig = (overrides = {}) => ({
  ...DEFAULT_USAGE_HISTORY_PREFERENCES,
  enabled: true,
  scheduleMode: USAGE_HISTORY_SCHEDULE_MODE.ALARM,
  syncIntervalMinutes: 45,
  retentionDays: 30,
  ...overrides,
})

describe("usageHistoryScheduler", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    registeredAlarmListeners.length = 0
    ;(usageHistoryScheduler as any).isInitialized = false
    ;(usageHistoryScheduler as any).isRunning = false

    vi.mocked(userPreferences.getPreferences).mockResolvedValue({
      ...DEFAULT_PREFERENCES,
      usageHistory: createUsageHistoryConfig(),
    })
    vi.mocked(userPreferences.savePreferences).mockResolvedValue(true)
    vi.mocked(hasAlarmsAPI).mockReturnValue(true)
    vi.mocked(accountStorage.getEnabledAccounts).mockResolvedValue([
      { id: "account-1", disabled: false },
      { id: "account-2", disabled: false },
    ] as any)
    vi.mocked(accountStorage.getAccountById).mockImplementation(async (id) => {
      if (id === "missing") return null
      if (id === "disabled") return { id, disabled: true } as any
      return { id, disabled: false } as any
    })
    vi.mocked(syncUsageHistoryForAccount).mockImplementation(async (params) => {
      return {
        accountId: params.accountId,
        status: "success",
      } as any
    })
    vi.mocked(usageHistoryStorage.pruneAllAccounts).mockResolvedValue(true)
    notifyTaskResultMock.mockReset()
    notifyTaskResultMock.mockResolvedValue(true)
  })

  it("initializes once, schedules the alarm, and only syncs for the matching alarm name", async () => {
    await usageHistoryScheduler.initialize()
    await usageHistoryScheduler.initialize()

    expect(onAlarm).toHaveBeenCalledTimes(1)
    expect(createAlarm).toHaveBeenCalledWith("usageHistorySync", {
      periodInMinutes: 45,
      delayInMinutes: 1,
    })

    await registeredAlarmListeners[0]?.({ name: "other-alarm" })
    expect(syncUsageHistoryForAccount).not.toHaveBeenCalled()

    await registeredAlarmListeners[0]?.({ name: "usageHistorySync" })
    expect(syncUsageHistoryForAccount).toHaveBeenCalledTimes(2)
    expect(syncUsageHistoryForAccount).toHaveBeenNthCalledWith(1, {
      accountId: "account-1",
      trigger: "alarm",
      force: undefined,
      config: expect.objectContaining({
        enabled: true,
        scheduleMode: USAGE_HISTORY_SCHEDULE_MODE.ALARM,
      }),
    })
    expect(syncUsageHistoryForAccount).toHaveBeenNthCalledWith(2, {
      accountId: "account-2",
      trigger: "alarm",
      force: undefined,
      config: expect.objectContaining({
        enabled: true,
        scheduleMode: USAGE_HISTORY_SCHEDULE_MODE.ALARM,
      }),
    })
  })

  it("falls back to after-refresh scheduling when alarms are unavailable", async () => {
    vi.mocked(hasAlarmsAPI).mockReturnValue(false)

    await usageHistoryScheduler.initialize()

    expect(clearAlarm).toHaveBeenCalledWith("usageHistorySync")
    expect(createAlarm).not.toHaveBeenCalled()
    expect(userPreferences.savePreferences).toHaveBeenCalledWith({
      usageHistory: expect.objectContaining({
        enabled: true,
        scheduleMode: USAGE_HISTORY_SCHEDULE_MODE.AFTER_REFRESH,
        retentionDays: 30,
        syncIntervalMinutes: 45,
      }),
    })
  })

  it("clears any existing alarm when preferences already use after-refresh scheduling", async () => {
    vi.mocked(userPreferences.getPreferences).mockResolvedValue({
      ...DEFAULT_PREFERENCES,
      usageHistory: createUsageHistoryConfig({
        scheduleMode: USAGE_HISTORY_SCHEDULE_MODE.AFTER_REFRESH,
      }),
    })

    await usageHistoryScheduler.initialize()

    expect(clearAlarm).toHaveBeenCalledWith("usageHistorySync")
    expect(createAlarm).not.toHaveBeenCalled()
  })

  it("falls back to default usage-history preferences when stored config is missing", async () => {
    vi.mocked(userPreferences.getPreferences).mockResolvedValue({
      ...DEFAULT_PREFERENCES,
      usageHistory: undefined,
    })

    const result = await usageHistoryScheduler.updateSettings({
      retentionDays: Number.NaN,
      syncIntervalMinutes: Number.NaN,
    })

    expect(result).toEqual({ warning: undefined })
    expect(userPreferences.savePreferences).toHaveBeenCalledWith({
      usageHistory: expect.objectContaining({
        enabled: DEFAULT_USAGE_HISTORY_PREFERENCES.enabled,
        retentionDays: DEFAULT_USAGE_HISTORY_PREFERENCES.retentionDays,
        scheduleMode: DEFAULT_USAGE_HISTORY_PREFERENCES.scheduleMode,
        syncIntervalMinutes:
          DEFAULT_USAGE_HISTORY_PREFERENCES.syncIntervalMinutes,
      }),
    })
    expect(usageHistoryStorage.pruneAllAccounts).toHaveBeenCalledWith(
      DEFAULT_USAGE_HISTORY_PREFERENCES.retentionDays,
    )
    expect(clearAlarm).toHaveBeenCalledWith("usageHistorySync")
    expect(createAlarm).not.toHaveBeenCalled()
  })

  it("clamps settings updates and returns a warning when alarm scheduling is unsupported", async () => {
    vi.mocked(hasAlarmsAPI).mockReturnValue(false)

    const result = await usageHistoryScheduler.updateSettings({
      enabled: true,
      scheduleMode: USAGE_HISTORY_SCHEDULE_MODE.ALARM,
      retentionDays: 9999,
      syncIntervalMinutes: 0,
    })

    expect(result).toEqual({
      warning:
        "Alarms API not supported; falling back to after-refresh scheduling.",
    })
    expect(userPreferences.savePreferences).toHaveBeenCalledWith({
      usageHistory: expect.objectContaining({
        enabled: true,
        retentionDays: 365,
        scheduleMode: USAGE_HISTORY_SCHEDULE_MODE.AFTER_REFRESH,
        syncIntervalMinutes: 1,
      }),
    })
    expect(usageHistoryStorage.pruneAllAccounts).toHaveBeenCalledWith(365)
    expect(clearAlarm).toHaveBeenCalledWith("usageHistorySync")
  })

  it("skips non-forced runs when the feature is disabled or scheduled for a different trigger", async () => {
    vi.mocked(userPreferences.getPreferences)
      .mockResolvedValueOnce({
        ...DEFAULT_PREFERENCES,
        usageHistory: createUsageHistoryConfig({ enabled: false }),
      })
      .mockResolvedValueOnce({
        ...DEFAULT_PREFERENCES,
        usageHistory: createUsageHistoryConfig({
          scheduleMode: USAGE_HISTORY_SCHEDULE_MODE.ALARM,
        }),
      })

    const disabledResult = await usageHistoryScheduler.runAfterRefreshSync()
    const wrongScheduleResult =
      await usageHistoryScheduler.runAfterRefreshSync()

    expect(disabledResult).toEqual({
      totals: { success: 0, skipped: 0, error: 0, unsupported: 0 },
      perAccount: [],
    })
    expect(wrongScheduleResult).toEqual({
      totals: { success: 0, skipped: 0, error: 0, unsupported: 0 },
      perAccount: [],
    })
    expect(syncUsageHistoryForAccount).not.toHaveBeenCalled()
  })

  it("ignores alarm-triggered runs when preferences no longer use alarm scheduling", async () => {
    vi.mocked(userPreferences.getPreferences).mockResolvedValue({
      ...DEFAULT_PREFERENCES,
      usageHistory: createUsageHistoryConfig({
        scheduleMode: USAGE_HISTORY_SCHEDULE_MODE.AFTER_REFRESH,
      }),
    })

    await usageHistoryScheduler.initialize()
    await registeredAlarmListeners[0]?.({ name: "usageHistorySync" })

    expect(syncUsageHistoryForAccount).not.toHaveBeenCalled()
  })

  it("notifies failures from alarm-triggered sync exceptions", async () => {
    vi.mocked(syncUsageHistoryForAccount).mockRejectedValueOnce(
      new Error("sync failed"),
    )

    await usageHistoryScheduler.initialize()
    await registeredAlarmListeners[0]?.({ name: "usageHistorySync" })

    expect(notifyTaskResultMock).toHaveBeenCalledWith({
      task: TASK_NOTIFICATION_TASKS.UsageHistorySync,
      status: TASK_NOTIFICATION_STATUSES.Failure,
      message: "sync failed",
    })
  })

  it("runs manual sync for explicit account ids, filtering missing and disabled accounts", async () => {
    const result = await usageHistoryScheduler.runManualSync([
      "account-1",
      "missing",
      "disabled",
      "account-2",
    ])

    expect(accountStorage.getAccountById).toHaveBeenCalledTimes(4)
    expect(syncUsageHistoryForAccount).toHaveBeenCalledTimes(2)
    expect(syncUsageHistoryForAccount).toHaveBeenNthCalledWith(1, {
      accountId: "account-1",
      trigger: "manual",
      force: true,
      config: expect.objectContaining({
        enabled: true,
        scheduleMode: USAGE_HISTORY_SCHEDULE_MODE.ALARM,
      }),
    })
    expect(syncUsageHistoryForAccount).toHaveBeenNthCalledWith(2, {
      accountId: "account-2",
      trigger: "manual",
      force: true,
      config: expect.objectContaining({
        enabled: true,
        scheduleMode: USAGE_HISTORY_SCHEDULE_MODE.ALARM,
      }),
    })
    expect(result).toEqual({
      totals: { success: 2, skipped: 0, error: 0, unsupported: 0 },
      perAccount: [
        { accountId: "account-1", status: "success" },
        { accountId: "account-2", status: "success" },
      ],
    })
  })

  it("returns null when a run is already in progress and recovers from sync errors", async () => {
    ;(usageHistoryScheduler as any).isRunning = true
    await expect(usageHistoryScheduler.runManualSync()).resolves.toBeNull()
    ;(usageHistoryScheduler as any).isRunning = false
    vi.mocked(userPreferences.getPreferences).mockResolvedValue({
      ...DEFAULT_PREFERENCES,
      usageHistory: createUsageHistoryConfig({
        scheduleMode: USAGE_HISTORY_SCHEDULE_MODE.AFTER_REFRESH,
      }),
    })
    vi.mocked(syncUsageHistoryForAccount).mockRejectedValueOnce(
      new Error("sync exploded"),
    )

    await expect(
      usageHistoryScheduler.runAfterRefreshSync(),
    ).resolves.toBeNull()
    expect((usageHistoryScheduler as any).isRunning).toBe(false)
  })
})

describe("handleUsageHistoryMessage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(userPreferences.getPreferences).mockResolvedValue({
      ...DEFAULT_PREFERENCES,
      usageHistory: createUsageHistoryConfig({ retentionDays: 14 }),
    })
  })

  it("routes update, manual sync, prune, and unknown actions", async () => {
    vi.spyOn(usageHistoryScheduler, "updateSettings").mockResolvedValue({
      warning: "warning",
    })
    vi.spyOn(usageHistoryScheduler, "runManualSync").mockResolvedValue({
      totals: { success: 1, skipped: 0, error: 0, unsupported: 0 },
      perAccount: [],
    })
    vi.mocked(usageHistoryStorage.pruneAllAccounts).mockResolvedValue(true)

    const updateResponse = vi.fn()
    await handleUsageHistoryMessage(
      {
        action: RuntimeActionIds.UsageHistoryUpdateSettings,
        settings: { enabled: false },
      },
      updateResponse,
    )
    expect(updateResponse).toHaveBeenCalledWith({
      success: true,
      data: { warning: "warning" },
    })

    const syncResponse = vi.fn()
    await handleUsageHistoryMessage(
      {
        action: RuntimeActionIds.UsageHistorySyncNow,
        accountIds: ["account-1"],
      },
      syncResponse,
    )
    expect(syncResponse).toHaveBeenCalledWith({
      success: true,
      data: {
        totals: { success: 1, skipped: 0, error: 0, unsupported: 0 },
        perAccount: [],
      },
    })

    const pruneResponse = vi.fn()
    await handleUsageHistoryMessage(
      { action: RuntimeActionIds.UsageHistoryPrune },
      pruneResponse,
    )
    expect(pruneResponse).toHaveBeenCalledWith({ success: true })
    expect(usageHistoryStorage.pruneAllAccounts).toHaveBeenCalledWith(14)

    const unknownResponse = vi.fn()
    await handleUsageHistoryMessage(
      { action: "unknown-action" },
      unknownResponse,
    )
    expect(unknownResponse).toHaveBeenCalledWith({
      success: false,
      error: "Unknown action",
    })
  })

  it("treats non-array sync-now accountIds as a full manual sync request", async () => {
    vi.spyOn(usageHistoryScheduler, "runManualSync").mockResolvedValue({
      totals: { success: 2, skipped: 0, error: 0, unsupported: 0 },
      perAccount: [],
    })

    const sendResponse = vi.fn()
    await handleUsageHistoryMessage(
      {
        action: RuntimeActionIds.UsageHistorySyncNow,
        accountIds: "account-1",
      },
      sendResponse,
    )

    expect(usageHistoryScheduler.runManualSync).toHaveBeenCalledWith(undefined)
    expect(sendResponse).toHaveBeenCalledWith({
      success: true,
      data: {
        totals: { success: 2, skipped: 0, error: 0, unsupported: 0 },
        perAccount: [],
      },
    })
  })

  it("returns an error response when the scheduler throws", async () => {
    vi.spyOn(usageHistoryScheduler, "updateSettings").mockRejectedValue(
      new Error("scheduler exploded"),
    )

    const sendResponse = vi.fn()
    await handleUsageHistoryMessage(
      {
        action: RuntimeActionIds.UsageHistoryUpdateSettings,
      },
      sendResponse,
    )

    expect(sendResponse).toHaveBeenCalledWith({
      success: false,
      error: "scheduler exploded",
    })
  })
})
