import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import { accountStorage } from "~/services/accounts/accountStorage"
import { resolveAutoCheckinProvider } from "~/services/checkin/autoCheckin/providers"
import {
  autoCheckinScheduler,
  handleAutoCheckinMessage,
} from "~/services/checkin/autoCheckin/scheduler"
import { autoCheckinStorage } from "~/services/checkin/autoCheckin/storage"
import {
  DEFAULT_PREFERENCES,
  userPreferences,
} from "~/services/preferences/userPreferences"
import { AUTO_CHECKIN_RUN_TYPE } from "~/types/autoCheckin"
import {
  clearAlarm,
  createAlarm,
  getAlarm,
  hasAlarmsAPI,
  isMessageReceiverUnavailableError,
  onAlarm,
  sendRuntimeMessage,
} from "~/utils/browser/browserApi"
import { getErrorMessage } from "~/utils/core/error"

vi.mock("~/services/preferences/userPreferences", () => ({
  DEFAULT_PREFERENCES: {
    autoCheckin: {
      globalEnabled: true,
      pretriggerDailyOnUiOpen: true,
      notifyUiOnCompletion: true,
      windowStart: "08:00",
      windowEnd: "10:00",
      scheduleMode: "random",
      deterministicTime: "08:00",
      retryStrategy: {
        enabled: false,
        intervalMinutes: 30,
        maxAttemptsPerDay: 3,
      },
    },
  },
  userPreferences: {
    getPreferences: vi.fn(),
    savePreferences: vi.fn(),
  },
}))

vi.mock("~/services/accounts/accountStorage", () => ({
  accountStorage: {
    getAllAccounts: vi.fn(),
    getEnabledAccounts: vi.fn(),
    updateAccount: vi.fn(),
    markAccountAsSiteCheckedIn: vi.fn(),
    refreshAccount: vi.fn(),
    getAccountById: vi.fn(),
    getDisplayDataById: vi.fn(),
    convertToDisplayData: vi.fn(),
  },
}))

vi.mock("~/services/checkin/autoCheckin/providers", () => ({
  resolveAutoCheckinProvider: vi.fn(),
}))

vi.mock("~/services/checkin/autoCheckin/storage", () => ({
  AUTO_CHECKIN_STATUS_STORAGE_LOCK: "all-api-hub:auto-checkin-status",
  autoCheckinStorage: {
    getStatus: vi.fn(),
    saveStatus: vi.fn(),
  },
}))

vi.mock("~/utils/browser/browserApi", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/utils/browser/browserApi")>()
  return {
    ...actual,
    clearAlarm: vi.fn(),
    createAlarm: vi.fn(),
    getAlarm: vi.fn(),
    hasAlarmsAPI: vi.fn(),
    isMessageReceiverUnavailableError: vi.fn(),
    onAlarm: vi.fn(),
    sendRuntimeMessage: vi.fn(),
  }
})

vi.mock("~/utils/core/error", () => ({
  getErrorMessage: vi.fn((e: unknown) => String(e)),
}))

const mockedUserPreferences = userPreferences as unknown as {
  getPreferences: ReturnType<typeof vi.fn>
  savePreferences: ReturnType<typeof vi.fn>
}

const mockedAutoCheckinStorage = autoCheckinStorage as unknown as {
  getStatus: ReturnType<typeof vi.fn>
  saveStatus: ReturnType<typeof vi.fn>
}

const mockedAccountStorage = accountStorage as unknown as {
  getAccountById: ReturnType<typeof vi.fn>
  getAllAccounts: ReturnType<typeof vi.fn>
  getDisplayDataById: ReturnType<typeof vi.fn>
  markAccountAsSiteCheckedIn: ReturnType<typeof vi.fn>
  refreshAccount: ReturnType<typeof vi.fn>
  convertToDisplayData: ReturnType<typeof vi.fn>
}

const mockedProviders = {
  resolveAutoCheckinProvider:
    resolveAutoCheckinProvider as unknown as ReturnType<typeof vi.fn>,
}

const mockedBrowserApi = {
  clearAlarm: clearAlarm as unknown as ReturnType<typeof vi.fn>,
  createAlarm: createAlarm as unknown as ReturnType<typeof vi.fn>,
  getAlarm: getAlarm as unknown as ReturnType<typeof vi.fn>,
  hasAlarmsAPI: hasAlarmsAPI as unknown as ReturnType<typeof vi.fn>,
  isMessageReceiverUnavailableError:
    isMessageReceiverUnavailableError as unknown as ReturnType<typeof vi.fn>,
  onAlarm: onAlarm as unknown as ReturnType<typeof vi.fn>,
  sendRuntimeMessage: sendRuntimeMessage as unknown as ReturnType<typeof vi.fn>,
}

let storedStatus: any = null
let alarmStore: Record<string, any> = {}

beforeEach(() => {
  storedStatus = null
  alarmStore = {}

  mockedAutoCheckinStorage.getStatus.mockImplementation(
    async () => storedStatus,
  )
  mockedAutoCheckinStorage.saveStatus.mockImplementation(
    async (status: any) => {
      storedStatus = status
      return true
    },
  )

  mockedBrowserApi.createAlarm.mockImplementation(
    async (name: string, alarmInfo: any) => {
      alarmStore[name] = { name, scheduledTime: alarmInfo.when }
    },
  )
  mockedBrowserApi.getAlarm.mockImplementation(
    async (name: string) => alarmStore[name],
  )
  mockedBrowserApi.clearAlarm.mockImplementation(async (name: string) => {
    delete alarmStore[name]
    return true
  })
})

describe("autoCheckinScheduler.initialize", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(autoCheckinScheduler as any).isInitialized = false
    mockedBrowserApi.hasAlarmsAPI.mockReturnValue(true)
    mockedUserPreferences.getPreferences.mockResolvedValue({
      autoCheckin: {
        ...(DEFAULT_PREFERENCES as any).autoCheckin,
        globalEnabled: true,
      },
    })
  })

  it("should set up alarm listener and schedule next run when alarms API is available", async () => {
    const scheduleSpy = vi.spyOn(autoCheckinScheduler as any, "scheduleNextRun")

    await autoCheckinScheduler.initialize()

    expect(mockedBrowserApi.onAlarm).toHaveBeenCalledTimes(1)
    expect(scheduleSpy).toHaveBeenCalled()
  })

  it("does not register duplicate listeners when initialize is called twice", async () => {
    const scheduleSpy = vi.spyOn(autoCheckinScheduler as any, "scheduleNextRun")

    await autoCheckinScheduler.initialize()
    await autoCheckinScheduler.initialize()

    expect(mockedBrowserApi.onAlarm).toHaveBeenCalledTimes(1)
    expect(scheduleSpy).toHaveBeenCalledTimes(1)
  })

  it("warns and skips scheduling when the alarms API is unavailable", async () => {
    mockedBrowserApi.hasAlarmsAPI.mockReturnValue(false)
    const scheduleSpy = vi.spyOn(autoCheckinScheduler as any, "scheduleNextRun")

    await autoCheckinScheduler.initialize()

    expect(mockedBrowserApi.onAlarm).not.toHaveBeenCalled()
    expect(scheduleSpy).not.toHaveBeenCalled()
    expect((autoCheckinScheduler as any).isInitialized).toBe(true)
  })

  it("keeps alarm callbacks best-effort when daily or retry handlers throw", async () => {
    const handleDailyAlarmSpy = vi
      .spyOn(autoCheckinScheduler as any, "handleDailyAlarm")
      .mockRejectedValueOnce(new Error("daily failed"))
    const handleRetryAlarmSpy = vi
      .spyOn(autoCheckinScheduler as any, "handleRetryAlarm")
      .mockRejectedValueOnce(new Error("retry failed"))

    await autoCheckinScheduler.initialize()

    const alarmListener = mockedBrowserApi.onAlarm.mock.calls[0]?.[0]
    expect(alarmListener).toBeTypeOf("function")

    await expect(
      alarmListener({
        name: "autoCheckinDaily",
        scheduledTime: Date.now(),
      }),
    ).resolves.toBeUndefined()
    await expect(
      alarmListener({
        name: "autoCheckinRetry",
        scheduledTime: Date.now() + 60_000,
      }),
    ).resolves.toBeUndefined()

    expect(handleDailyAlarmSpy).toHaveBeenCalledTimes(1)
    expect(handleRetryAlarmSpy).toHaveBeenCalledTimes(1)

    handleDailyAlarmSpy.mockRestore()
    handleRetryAlarmSpy.mockRestore()
  })

  it("routes daily and retry alarm events through the installed listener", async () => {
    const handleDailyAlarmSpy = vi
      .spyOn(autoCheckinScheduler as any, "handleDailyAlarm")
      .mockResolvedValue(undefined)
    const handleRetryAlarmSpy = vi
      .spyOn(autoCheckinScheduler as any, "handleRetryAlarm")
      .mockResolvedValue(undefined)

    await autoCheckinScheduler.initialize()

    const alarmListener = mockedBrowserApi.onAlarm.mock.calls[0]?.[0]
    expect(alarmListener).toBeTypeOf("function")

    const dailyAlarm = {
      name: "autoCheckinDaily",
      scheduledTime: Date.now(),
    }
    const retryAlarm = {
      name: "autoCheckinRetry",
      scheduledTime: Date.now() + 60_000,
    }

    await alarmListener(dailyAlarm)
    await alarmListener(retryAlarm)

    expect(handleDailyAlarmSpy).toHaveBeenCalledWith(dailyAlarm)
    expect(handleRetryAlarmSpy).toHaveBeenCalledWith(retryAlarm)

    handleDailyAlarmSpy.mockRestore()
    handleRetryAlarmSpy.mockRestore()
  })

  it("restores the schedule when the installed listener receives the legacy alarm", async () => {
    const scheduleSpy = vi
      .spyOn(autoCheckinScheduler as any, "scheduleNextRun")
      .mockResolvedValue(undefined)

    await autoCheckinScheduler.initialize()

    const alarmListener = mockedBrowserApi.onAlarm.mock.calls[0]?.[0]
    expect(alarmListener).toBeTypeOf("function")

    await alarmListener({
      name: "autoCheckin",
      scheduledTime: Date.now(),
    })

    expect(scheduleSpy).toHaveBeenCalledTimes(2)
    expect(scheduleSpy).toHaveBeenNthCalledWith(1, {
      preserveExisting: true,
      allowCatchUp: true,
    })
    expect(scheduleSpy).toHaveBeenNthCalledWith(2, {
      allowCatchUp: true,
    })

    scheduleSpy.mockRestore()
  })
})

describe("autoCheckinScheduler.scheduleNextRun", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedBrowserApi.hasAlarmsAPI.mockReturnValue(true)
  })

  it("returns without touching alarms when the alarms API is unavailable", async () => {
    mockedBrowserApi.hasAlarmsAPI.mockReturnValue(false)

    await autoCheckinScheduler.scheduleNextRun()

    expect(mockedBrowserApi.clearAlarm).not.toHaveBeenCalled()
    expect(mockedBrowserApi.createAlarm).not.toHaveBeenCalled()
    expect(mockedAutoCheckinStorage.saveStatus).not.toHaveBeenCalled()
  })

  it("should clear daily/retry alarms and clear schedules when globalEnabled is false", async () => {
    mockedUserPreferences.getPreferences.mockResolvedValue({
      autoCheckin: {
        ...(DEFAULT_PREFERENCES as any).autoCheckin,
        globalEnabled: false,
      },
    })
    storedStatus = {
      lastRunResult: "success",
      lastRunAt: "2024-01-01T00:00:00.000Z",
      perAccount: {},
      nextDailyScheduledAt: "2024-01-02T00:00:00.000Z",
      nextRetryScheduledAt: "2024-01-01T00:10:00.000Z",
      retryState: {
        day: "2024-01-01",
        pendingAccountIds: ["a"],
        attemptsByAccount: { a: 1 },
      },
    } as any

    await (autoCheckinScheduler as any).scheduleNextRun()

    expect(mockedBrowserApi.clearAlarm).toHaveBeenCalledWith("autoCheckin")
    expect(mockedBrowserApi.clearAlarm).toHaveBeenCalledWith("autoCheckinDaily")
    expect(mockedBrowserApi.clearAlarm).toHaveBeenCalledWith("autoCheckinRetry")
    expect(storedStatus.nextDailyScheduledAt).toBeUndefined()
    expect(storedStatus.nextRetryScheduledAt).toBeUndefined()
    expect(storedStatus.retryState).toBeUndefined()
    expect(storedStatus.pendingRetry).toBe(false)
  })

  it("schedules the daily alarm for the next day when it already ran today (random mode)", async () => {
    vi.useFakeTimers()
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0)
    vi.setSystemTime(new Date(2024, 0, 1, 9, 5, 0))

    mockedUserPreferences.getPreferences.mockResolvedValue({
      autoCheckin: {
        globalEnabled: true,
        windowStart: "08:00",
        windowEnd: "10:00",
        scheduleMode: "random",
        deterministicTime: "08:00",
        retryStrategy: {
          enabled: false,
          intervalMinutes: 30,
          maxAttemptsPerDay: 3,
        },
      },
    })

    storedStatus = { lastDailyRunDay: "2024-01-01" }

    await autoCheckinScheduler.scheduleNextRun()

    const expected = new Date(2024, 0, 2, 8, 0, 0, 0)
    expect(alarmStore.autoCheckinDaily.scheduledTime).toBe(expected.getTime())
    expect(storedStatus.nextDailyScheduledAt).toBe(expected.toISOString())
    expect(storedStatus.nextScheduledAt).toBe(expected.toISOString())

    randomSpy.mockRestore()
    vi.useRealTimers()
  })

  it("schedules tomorrow's deterministic time when startup restore misses the fixed time outside the window", async () => {
    vi.useFakeTimers()
    const now = new Date(2024, 0, 1, 10, 0, 0)
    vi.setSystemTime(now)

    mockedUserPreferences.getPreferences.mockResolvedValue({
      autoCheckin: {
        ...(DEFAULT_PREFERENCES as any).autoCheckin,
        globalEnabled: true,
        pretriggerDailyOnUiOpen: false,
        windowStart: "08:00",
        windowEnd: "09:00",
        scheduleMode: "deterministic",
        deterministicTime: "08:30",
        retryStrategy: {
          enabled: false,
          intervalMinutes: 30,
          maxAttemptsPerDay: 3,
        },
      },
    })

    const expectedTime = new Date(2024, 0, 2, 8, 30, 0, 0)
    const expectedTargetDay = (autoCheckinScheduler as any).getLocalDay(
      expectedTime,
    )

    await autoCheckinScheduler.scheduleNextRun({
      preserveExisting: true,
      allowCatchUp: true,
    })

    expect(alarmStore.autoCheckinDaily.scheduledTime).toBe(
      expectedTime.getTime(),
    )
    expect(storedStatus.nextDailyScheduledAt).toBe(expectedTime.toISOString())
    expect(storedStatus.dailyAlarmTargetDay).toBe(expectedTargetDay)
    expect(storedStatus.nextScheduledAt).toBe(expectedTime.toISOString())

    vi.useRealTimers()
  })

  it("schedules tomorrow's deterministic time when today's daily run already executed", async () => {
    vi.useFakeTimers()
    const now = new Date(2024, 0, 1, 10, 0, 0)
    vi.setSystemTime(now)

    mockedUserPreferences.getPreferences.mockResolvedValue({
      autoCheckin: {
        ...(DEFAULT_PREFERENCES as any).autoCheckin,
        globalEnabled: true,
        pretriggerDailyOnUiOpen: false,
        windowStart: "08:00",
        windowEnd: "09:00",
        scheduleMode: "deterministic",
        deterministicTime: "08:30",
        retryStrategy: {
          enabled: false,
          intervalMinutes: 30,
          maxAttemptsPerDay: 3,
        },
      },
    })

    const today = (autoCheckinScheduler as any).getLocalDay(now)
    const expectedTime = new Date(2024, 0, 2, 8, 30, 0, 0)
    const expectedTargetDay = (autoCheckinScheduler as any).getLocalDay(
      expectedTime,
    )
    storedStatus = { lastDailyRunDay: today }

    await autoCheckinScheduler.scheduleNextRun()

    expect(alarmStore.autoCheckinDaily.scheduledTime).toBe(
      expectedTime.getTime(),
    )
    expect(storedStatus.nextDailyScheduledAt).toBe(expectedTime.toISOString())
    expect(storedStatus.dailyAlarmTargetDay).toBe(expectedTargetDay)
    expect(storedStatus.nextScheduledAt).toBe(expectedTime.toISOString())

    vi.useRealTimers()
  })

  it("recreates a preserved same-day alarm when startup restore needs an earlier deterministic catch-up", async () => {
    vi.useFakeTimers()
    const now = new Date(2024, 0, 1, 10, 0, 0)
    const catchUpDelayMs = 60_000
    vi.setSystemTime(now)

    mockedUserPreferences.getPreferences.mockResolvedValue({
      autoCheckin: {
        ...(DEFAULT_PREFERENCES as any).autoCheckin,
        globalEnabled: true,
        pretriggerDailyOnUiOpen: false,
        windowStart: "08:00",
        windowEnd: "12:00",
        scheduleMode: "deterministic",
        deterministicTime: "08:30",
        retryStrategy: {
          enabled: false,
          intervalMinutes: 30,
          maxAttemptsPerDay: 3,
        },
      },
    })

    const today = (autoCheckinScheduler as any).getLocalDay(now)
    const staleTime = new Date(2024, 0, 1, 11, 30, 0, 0)
    const expectedTime = new Date(now.getTime() + catchUpDelayMs)
    alarmStore.autoCheckinDaily = {
      name: "autoCheckinDaily",
      scheduledTime: staleTime.getTime(),
    }
    storedStatus = {
      nextDailyScheduledAt: staleTime.toISOString(),
      dailyAlarmTargetDay: (autoCheckinScheduler as any).getLocalDay(staleTime),
      nextScheduledAt: staleTime.toISOString(),
    }

    await autoCheckinScheduler.scheduleNextRun({
      preserveExisting: true,
      allowCatchUp: true,
    })

    expect(alarmStore.autoCheckinDaily.scheduledTime).toBe(
      expectedTime.getTime(),
    )
    expect(storedStatus.nextDailyScheduledAt).toBe(expectedTime.toISOString())
    expect(storedStatus.dailyAlarmTargetDay).toBe(today)
    expect(storedStatus.nextScheduledAt).toBe(expectedTime.toISOString())
    expect(mockedBrowserApi.clearAlarm).toHaveBeenCalledWith("autoCheckinDaily")

    vi.useRealTimers()
  })

  it("reuses a preserved same-day alarm when deterministic catch-up would only postpone it", async () => {
    vi.useFakeTimers()
    const now = new Date(2024, 0, 1, 10, 0, 0)
    const preservedTime = new Date(now.getTime() + 30_000)
    const staleTime = new Date(2024, 0, 1, 11, 30, 0, 0)
    vi.setSystemTime(now)

    mockedUserPreferences.getPreferences.mockResolvedValue({
      autoCheckin: {
        ...(DEFAULT_PREFERENCES as any).autoCheckin,
        globalEnabled: true,
        pretriggerDailyOnUiOpen: false,
        windowStart: "08:00",
        windowEnd: "12:00",
        scheduleMode: "deterministic",
        deterministicTime: "08:30",
        retryStrategy: {
          enabled: false,
          intervalMinutes: 30,
          maxAttemptsPerDay: 3,
        },
      },
    })

    const expectedTargetDay = (autoCheckinScheduler as any).getLocalDay(
      preservedTime,
    )
    alarmStore.autoCheckinDaily = {
      name: "autoCheckinDaily",
      scheduledTime: preservedTime.getTime(),
    }
    storedStatus = {
      nextDailyScheduledAt: staleTime.toISOString(),
      dailyAlarmTargetDay: (autoCheckinScheduler as any).getLocalDay(staleTime),
      nextScheduledAt: staleTime.toISOString(),
    }

    await autoCheckinScheduler.scheduleNextRun({
      preserveExisting: true,
      allowCatchUp: true,
    })

    expect(alarmStore.autoCheckinDaily.scheduledTime).toBe(
      preservedTime.getTime(),
    )
    expect(storedStatus.nextDailyScheduledAt).toBe(preservedTime.toISOString())
    expect(storedStatus.dailyAlarmTargetDay).toBe(expectedTargetDay)
    expect(storedStatus.nextScheduledAt).toBe(preservedTime.toISOString())
    expect(mockedBrowserApi.clearAlarm).not.toHaveBeenCalledWith(
      "autoCheckinDaily",
    )

    vi.useRealTimers()
  })

  it("merges daily schedule updates into the latest status snapshot", async () => {
    const staleSnapshot = {
      lastRunAt: "2024-01-01T00:00:00.000Z",
      lastRunResult: "failed",
    }
    const freshStatus = {
      ...staleSnapshot,
      lastRunAt: "2024-01-02T00:00:00.000Z",
      nextRetryScheduledAt: "2024-01-02T00:10:00.000Z",
      pendingRetry: true,
    }
    const scheduledTime = new Date("2024-01-03T08:30:00.000Z")
    const targetDay = (autoCheckinScheduler as any).getLocalDay(scheduledTime)

    storedStatus = freshStatus

    await (autoCheckinScheduler as any).syncDailyScheduleStatus(
      staleSnapshot,
      scheduledTime,
      targetDay,
    )

    expect(storedStatus.lastRunAt).toBe(freshStatus.lastRunAt)
    expect(storedStatus.nextRetryScheduledAt).toBe(
      freshStatus.nextRetryScheduledAt,
    )
    expect(storedStatus.pendingRetry).toBe(true)
    expect(storedStatus.nextDailyScheduledAt).toBe(scheduledTime.toISOString())
    expect(storedStatus.dailyAlarmTargetDay).toBe(targetDay)
    expect(storedStatus.nextScheduledAt).toBe(scheduledTime.toISOString())
  })

  it("clears stored daily schedule metadata when daily alarm creation fails", async () => {
    vi.useFakeTimers()
    const now = new Date(2024, 0, 1, 9, 0, 0)
    vi.setSystemTime(now)

    mockedUserPreferences.getPreferences.mockResolvedValue({
      autoCheckin: {
        ...(DEFAULT_PREFERENCES as any).autoCheckin,
        globalEnabled: true,
        pretriggerDailyOnUiOpen: false,
        windowStart: "08:00",
        windowEnd: "10:00",
        scheduleMode: "random",
        deterministicTime: "08:00",
        retryStrategy: {
          enabled: false,
          intervalMinutes: 30,
          maxAttemptsPerDay: 3,
        },
      },
    })

    const staleTime = new Date(2024, 0, 1, 9, 30, 0, 0)
    storedStatus = {
      lastRunResult: "success",
      nextDailyScheduledAt: staleTime.toISOString(),
      dailyAlarmTargetDay: (autoCheckinScheduler as any).getLocalDay(staleTime),
      nextScheduledAt: staleTime.toISOString(),
    }
    mockedBrowserApi.createAlarm.mockRejectedValueOnce(
      new Error("daily create failed"),
    )

    await autoCheckinScheduler.scheduleNextRun()

    expect(storedStatus.lastRunResult).toBe("success")
    expect(storedStatus.nextDailyScheduledAt).toBeUndefined()
    expect(storedStatus.dailyAlarmTargetDay).toBeUndefined()
    expect(storedStatus.nextScheduledAt).toBeUndefined()

    vi.useRealTimers()
  })

  it("falls back to tomorrow's deterministic time when same-day catch-up is no longer possible", async () => {
    vi.useFakeTimers()
    const now = new Date(2024, 0, 1, 23, 59, 59, 999)
    vi.setSystemTime(now)

    mockedUserPreferences.getPreferences.mockResolvedValue({
      autoCheckin: {
        ...(DEFAULT_PREFERENCES as any).autoCheckin,
        globalEnabled: true,
        pretriggerDailyOnUiOpen: false,
        windowStart: "08:00",
        windowEnd: "09:00",
        scheduleMode: "deterministic",
        deterministicTime: "08:30",
        retryStrategy: {
          enabled: false,
          intervalMinutes: 30,
          maxAttemptsPerDay: 3,
        },
      },
    })

    const expectedTime = new Date(2024, 0, 2, 8, 30, 0, 0)
    const expectedTargetDay = (autoCheckinScheduler as any).getLocalDay(
      expectedTime,
    )

    await autoCheckinScheduler.scheduleNextRun()

    expect(alarmStore.autoCheckinDaily.scheduledTime).toBe(
      expectedTime.getTime(),
    )
    expect(storedStatus.nextDailyScheduledAt).toBe(expectedTime.toISOString())
    expect(storedStatus.dailyAlarmTargetDay).toBe(expectedTargetDay)
    expect(storedStatus.nextScheduledAt).toBe(expectedTime.toISOString())

    vi.useRealTimers()
  })

  it("allows startup-restore catch-up inside a cross-midnight window", async () => {
    vi.useFakeTimers()
    const now = new Date(2024, 0, 2, 1, 0, 0)
    const catchUpDelayMs = 60_000
    vi.setSystemTime(now)

    mockedUserPreferences.getPreferences.mockResolvedValue({
      autoCheckin: {
        ...(DEFAULT_PREFERENCES as any).autoCheckin,
        globalEnabled: true,
        pretriggerDailyOnUiOpen: false,
        windowStart: "23:00",
        windowEnd: "02:00",
        scheduleMode: "deterministic",
        deterministicTime: "00:30",
        retryStrategy: {
          enabled: false,
          intervalMinutes: 30,
          maxAttemptsPerDay: 3,
        },
      },
    })

    const today = (autoCheckinScheduler as any).getLocalDay(now)
    const expectedTime = new Date(now.getTime() + catchUpDelayMs)

    await autoCheckinScheduler.scheduleNextRun({
      preserveExisting: true,
      allowCatchUp: true,
    })

    expect(alarmStore.autoCheckinDaily.scheduledTime).toBe(
      expectedTime.getTime(),
    )
    expect(storedStatus.nextDailyScheduledAt).toBe(expectedTime.toISOString())
    expect(storedStatus.dailyAlarmTargetDay).toBe(today)
    expect(storedStatus.nextScheduledAt).toBe(expectedTime.toISOString())

    vi.useRealTimers()
  })
})

describe("autoCheckinScheduler.updateSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedBrowserApi.hasAlarmsAPI.mockReturnValue(true)
  })

  it("does not catch up today when settings enable deterministic scheduling after the fixed time", async () => {
    vi.useFakeTimers()
    const now = new Date(2024, 0, 1, 10, 0, 0)
    const deterministicTime = "08:30"
    vi.setSystemTime(now)

    const currentConfig = {
      ...(DEFAULT_PREFERENCES as any).autoCheckin,
      globalEnabled: true,
      pretriggerDailyOnUiOpen: false,
      windowStart: "08:00",
      windowEnd: "12:00",
      scheduleMode: "random",
      deterministicTime,
      retryStrategy: {
        enabled: false,
        intervalMinutes: 30,
        maxAttemptsPerDay: 3,
      },
    }
    const updatedConfig = {
      ...currentConfig,
      scheduleMode: "deterministic",
      deterministicTime,
    }

    mockedUserPreferences.getPreferences
      .mockResolvedValueOnce({ autoCheckin: currentConfig })
      .mockResolvedValueOnce({ autoCheckin: updatedConfig })

    const expectedTime = new Date(2024, 0, 2, 8, 30, 0, 0)
    const expectedTargetDay = (autoCheckinScheduler as any).getLocalDay(
      expectedTime,
    )

    await autoCheckinScheduler.updateSettings({
      scheduleMode: "deterministic",
      deterministicTime,
    })

    expect(mockedUserPreferences.savePreferences).toHaveBeenCalledWith({
      autoCheckin: updatedConfig,
    })
    expect(alarmStore.autoCheckinDaily.scheduledTime).toBe(
      expectedTime.getTime(),
    )
    expect(storedStatus.nextDailyScheduledAt).toBe(expectedTime.toISOString())
    expect(storedStatus.dailyAlarmTargetDay).toBe(expectedTargetDay)
    expect(storedStatus.nextScheduledAt).toBe(expectedTime.toISOString())

    vi.useRealTimers()
  })
})

describe("autoCheckinScheduler daily+retry behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedBrowserApi.hasAlarmsAPI.mockReturnValue(true)
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
      site_type: "veloera",
      account_info: { username: "user-a" },
      checkIn: {
        enableDetection: true,
        siteStatus: { isCheckedInToday: true },
      },
    }
    const accountB: any = {
      id: "b",
      disabled: false,
      site_name: "SiteB",
      site_type: "veloera",
      account_info: { username: "user-b" },
      checkIn: { enableDetection: true },
    }

    mockedAccountStorage.getAllAccounts.mockResolvedValue([accountA, accountB])

    const provider = {
      canCheckIn: vi.fn(() => true),
      checkIn: vi.fn(async (account: any) => {
        if (account.id === "a") {
          return { status: "already_checked" }
        }
        return { status: "failed", rawMessage: "boom" }
      }),
    }
    mockedProviders.resolveAutoCheckinProvider.mockReturnValue(provider)

    await autoCheckinScheduler.runCheckins({
      runType: AUTO_CHECKIN_RUN_TYPE.DAILY,
    })

    expect(provider.checkIn).toHaveBeenCalledTimes(2)
    expect(provider.checkIn.mock.calls.map((call) => call[0].id)).toEqual(
      expect.arrayContaining(["a", "b"]),
    )

    expect(storedStatus.lastDailyRunDay).toBe("2024-01-01")
    expect(storedStatus.perAccount.a.status).toBe("already_checked")
    expect(storedStatus.retryState.day).toBe("2024-01-01")
    expect(storedStatus.retryState.pendingAccountIds).toEqual(["b"])
    expect(storedStatus.retryState.attemptsByAccount).toEqual({ b: 1 })
    expect(storedStatus.pendingRetry).toBe(true)

    vi.useRealTimers()
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
      site_type: "veloera",
      account_info: { username: "user" },
      checkIn: {
        enableDetection: true,
        autoCheckInEnabled: true,
      },
    }

    mockedAccountStorage.getAllAccounts.mockResolvedValue([account])

    const provider = {
      canCheckIn: vi.fn(() => true),
      checkIn: vi.fn(async () => ({ status: "failed", rawMessage: "boom" })),
    }
    mockedProviders.resolveAutoCheckinProvider.mockReturnValue(provider)

    await autoCheckinScheduler.runCheckins({
      runType: AUTO_CHECKIN_RUN_TYPE.DAILY,
    })

    expect(provider.checkIn).toHaveBeenCalledTimes(1)
    expect(storedStatus.lastDailyRunDay).toBe("2024-01-01")
    expect(storedStatus.lastRunResult).toBe("failed")
    expect(storedStatus.summary).toMatchObject({
      totalEligible: 1,
      executed: 1,
      successCount: 0,
      failedCount: 1,
      needsRetry: true,
    })
    expect(storedStatus.retryState).toBeUndefined()
    expect(storedStatus.pendingRetry).toBe(false)

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

    storedStatus = {
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
      site_type: "veloera",
      account_info: { username: "user-b" },
      checkIn: { enableDetection: true },
    }
    mockedAccountStorage.getAccountById.mockResolvedValue(accountB)

    const provider = {
      canCheckIn: vi.fn(() => true),
      checkIn: vi.fn(async () => ({ status: "failed", rawMessage: "boom" })),
    }
    mockedProviders.resolveAutoCheckinProvider.mockReturnValue(provider)

    await (autoCheckinScheduler as any).handleRetryAlarm({
      name: "autoCheckinRetry",
      scheduledTime: Date.now(),
    })

    expect(provider.checkIn).toHaveBeenCalledTimes(1)
    expect(provider.checkIn).toHaveBeenCalledWith(
      expect.objectContaining({ id: "b" }),
    )
    expect(storedStatus.retryState).toBeUndefined()
    expect(storedStatus.pendingRetry).toBe(false)
    expect(alarmStore.autoCheckinRetry).toBeUndefined()

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
      site_type: "veloera",
      account_info: { username: "disabled-user" },
      checkIn: { enableDetection: true },
    }
    const detectionDisabledAccount: any = {
      id: "detection-off",
      disabled: false,
      site_name: "Detection Off",
      site_type: "veloera",
      account_info: { username: "off-user" },
      checkIn: { enableDetection: false, autoCheckInEnabled: true },
    }

    mockedAccountStorage.getAllAccounts.mockResolvedValue([
      disabledAccount,
      detectionDisabledAccount,
    ])

    await autoCheckinScheduler.runCheckins({
      runType: AUTO_CHECKIN_RUN_TYPE.MANUAL,
    })

    expect(mockedProviders.resolveAutoCheckinProvider).not.toHaveBeenCalled()
    expect(storedStatus.lastRunResult).toBe("success")
    expect(storedStatus.summary).toEqual({
      totalEligible: 0,
      executed: 0,
      successCount: 0,
      failedCount: 0,
      skippedCount: 0,
      needsRetry: false,
    })
    expect(storedStatus.perAccount.disabled).toMatchObject({
      status: "skipped",
      reasonCode: "account_disabled",
    })
    expect(storedStatus.perAccount["detection-off"]).toBeUndefined()
    expect(mockedBrowserApi.sendRuntimeMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        action: RuntimeActionIds.AutoCheckinRunCompleted,
        runKind: "manual",
        updatedAccountIds: [],
        summary: {
          totalEligible: 0,
          executed: 0,
          successCount: 0,
          failedCount: 0,
          skippedCount: 0,
          needsRetry: false,
        },
      }),
      { maxAttempts: 1 },
    )

    vi.useRealTimers()
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
      site_type: "veloera",
      account_info: { username: "user" },
      checkIn: { enableDetection: true, autoCheckInEnabled: false },
    }

    storedStatus = {
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
      canCheckIn: vi.fn(() => true),
      checkIn: vi.fn(),
    }
    mockedProviders.resolveAutoCheckinProvider.mockReturnValue(provider)

    await autoCheckinScheduler.runCheckins({
      runType: AUTO_CHECKIN_RUN_TYPE.DAILY,
    })

    expect(provider.checkIn).not.toHaveBeenCalled()
    expect(storedStatus.lastDailyRunDay).toBe("2024-01-01")
    expect(storedStatus.lastRunResult).toBe("success")
    expect(storedStatus.perAccount["paused-daily"]).toMatchObject({
      status: "skipped",
      reasonCode: "auto_checkin_disabled",
    })
    expect(storedStatus.summary).toMatchObject({
      totalEligible: 1,
      executed: 0,
      successCount: 0,
      failedCount: 0,
      skippedCount: 1,
      needsRetry: false,
    })
    expect(storedStatus.retryState).toBeUndefined()
    expect(storedStatus.pendingRetry).toBe(false)
    expect(storedStatus.nextRetryScheduledAt).toBeUndefined()
    expect(storedStatus.retryAlarmTargetDay).toBeUndefined()
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

  it("returns early without touching status when the global feature is disabled", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2024, 0, 1, 9, 0, 0))

    mockedUserPreferences.getPreferences.mockResolvedValue({
      autoCheckin: {
        ...(DEFAULT_PREFERENCES as any).autoCheckin,
        globalEnabled: false,
        notifyUiOnCompletion: true,
      },
    })

    storedStatus = {
      lastRunAt: "2024-01-01T08:00:00.000Z",
      lastRunResult: "success",
    } as any

    await expect(
      autoCheckinScheduler.runCheckins({
        runType: AUTO_CHECKIN_RUN_TYPE.MANUAL,
      }),
    ).resolves.toBeUndefined()

    expect(mockedAccountStorage.getAllAccounts).not.toHaveBeenCalled()
    expect(mockedProviders.resolveAutoCheckinProvider).not.toHaveBeenCalled()
    expect(mockedAutoCheckinStorage.saveStatus).not.toHaveBeenCalled()
    expect(mockedBrowserApi.sendRuntimeMessage).not.toHaveBeenCalled()
    expect(storedStatus).toEqual({
      lastRunAt: "2024-01-01T08:00:00.000Z",
      lastRunResult: "success",
    })

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

    storedStatus = {
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
      autoCheckinScheduler.runCheckins({
        runType: AUTO_CHECKIN_RUN_TYPE.MANUAL,
        targetAccountIds: ["legacy"],
      }),
    ).resolves.toBeUndefined()

    expect(storedStatus.lastRunResult).toBe("failed")
    expect(storedStatus.perAccount).toEqual({
      legacy: expect.objectContaining({
        accountId: "legacy",
        status: "failed",
      }),
    })
    expect(storedStatus.retryState).toEqual({
      day: "2024-01-01",
      pendingAccountIds: ["legacy"],
      attemptsByAccount: { legacy: 1 },
    })
    expect(storedStatus.pendingRetry).toBe(false)
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

    storedStatus = {
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
      autoCheckinScheduler.runCheckins({
        runType: AUTO_CHECKIN_RUN_TYPE.MANUAL,
      }),
    ).resolves.toBeUndefined()

    expect(mockedAccountStorage.getAllAccounts).not.toHaveBeenCalled()
    expect(storedStatus.lastRunResult).toBe("failed")
    expect(storedStatus.perAccount).toEqual({})
    expect(storedStatus.retryState).toEqual({
      day: "2024-01-01",
      pendingAccountIds: ["legacy"],
      attemptsByAccount: { legacy: 1 },
    })
    expect(storedStatus.pendingRetry).toBe(false)
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

    storedStatus = {
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
      autoCheckinScheduler.runCheckins({
        runType: AUTO_CHECKIN_RUN_TYPE.DAILY,
      }),
    ).resolves.toBeUndefined()

    expect(storedStatus.lastRunResult).toBe("failed")
    expect(storedStatus.lastDailyRunDay).toBe("2024-01-01")
    expect(storedStatus.retryState).toBeUndefined()
    expect(storedStatus.pendingRetry).toBe(false)
    expect(storedStatus.nextRetryScheduledAt).toBeUndefined()
    expect(storedStatus.retryAlarmTargetDay).toBeUndefined()
    expect(mockedBrowserApi.sendRuntimeMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({
        action: RuntimeActionIds.AutoCheckinRunCompleted,
      }),
      { maxAttempts: 1 },
    )

    vi.useRealTimers()
  })

  it("processes mixed retry outcomes and keeps only failed accounts queued", async () => {
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

    storedStatus = {
      lastDailyRunDay: "2024-01-01",
      retryState: {
        day: "2024-01-01",
        pendingAccountIds: ["disabled", "success", "failed"],
        attemptsByAccount: {},
      },
      perAccount: {
        disabled: {
          accountId: "disabled",
          accountName: "Disabled Site · disabled-user",
          status: "failed",
          timestamp: Date.now(),
        },
        success: {
          accountId: "success",
          accountName: "Success Site · success-user",
          status: "failed",
          timestamp: Date.now(),
        },
        failed: {
          accountId: "failed",
          accountName: "Failed Site · failed-user",
          status: "failed",
          timestamp: Date.now(),
        },
      },
      summary: {
        totalEligible: 3,
        executed: 3,
        successCount: 0,
        failedCount: 3,
        skippedCount: 0,
        needsRetry: true,
      },
      accountsSnapshot: [
        { accountId: "disabled", accountName: "Disabled Site · disabled-user" },
        { accountId: "success", accountName: "Success Site · success-user" },
        { accountId: "failed", accountName: "Failed Site · failed-user" },
      ],
    } as any

    const disabledAccount: any = {
      id: "disabled",
      disabled: true,
      site_name: "Disabled Site",
      site_type: "veloera",
      account_info: { username: "disabled-user" },
      checkIn: { enableDetection: true },
    }
    const successAccount: any = {
      id: "success",
      disabled: false,
      site_name: "Success Site",
      site_type: "veloera",
      account_info: { username: "success-user" },
      checkIn: { enableDetection: true, autoCheckInEnabled: true },
    }
    const failedAccount: any = {
      id: "failed",
      disabled: false,
      site_name: "Failed Site",
      site_type: "veloera",
      account_info: { username: "failed-user" },
      checkIn: { enableDetection: true, autoCheckInEnabled: true },
    }

    mockedAccountStorage.getAllAccounts.mockResolvedValue([
      disabledAccount,
      successAccount,
      failedAccount,
    ])
    mockedAccountStorage.getAccountById.mockImplementation(
      async (id: string) => {
        if (id === "disabled") return disabledAccount
        if (id === "success") return successAccount
        if (id === "failed") return failedAccount
        return null
      },
    )

    const provider = {
      canCheckIn: vi.fn(() => true),
      checkIn: vi.fn(async (account: any) => {
        if (account.id === "success") {
          return { status: "success", rawMessage: "ok" }
        }
        return { status: "failed", rawMessage: "boom" }
      }),
    }
    mockedProviders.resolveAutoCheckinProvider.mockReturnValue(provider)

    const refreshSpy = vi.spyOn(
      autoCheckinScheduler as any,
      "refreshAccountsAfterSuccessfulCheckins",
    )

    await (autoCheckinScheduler as any).runRetryCheckins()

    expect(provider.checkIn).toHaveBeenCalledTimes(2)
    expect(storedStatus.perAccount.disabled).toMatchObject({
      status: "skipped",
      reasonCode: "account_disabled",
    })
    expect(storedStatus.perAccount.success).toMatchObject({
      status: "success",
    })
    expect(storedStatus.perAccount.failed).toMatchObject({
      status: "failed",
    })
    expect(storedStatus.retryState).toEqual({
      day: "2024-01-01",
      pendingAccountIds: ["failed"],
      attemptsByAccount: {
        failed: 2,
      },
    })
    expect(storedStatus.pendingRetry).toBe(true)
    expect(refreshSpy).toHaveBeenCalledWith({
      accountIds: ["success"],
      force: true,
    })
    expect(mockedBrowserApi.sendRuntimeMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        action: RuntimeActionIds.AutoCheckinRunCompleted,
        runKind: "retry",
        updatedAccountIds: ["success"],
      }),
      { maxAttempts: 1 },
    )

    vi.useRealTimers()
  })

  it("clears retry state when every queued account is already at max attempts before execution", async () => {
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

    storedStatus = {
      lastDailyRunDay: "2024-01-01",
      retryState: {
        day: "2024-01-01",
        pendingAccountIds: ["exhausted"],
        attemptsByAccount: { exhausted: 3 },
      },
      perAccount: {
        exhausted: {
          accountId: "exhausted",
          accountName: "Exhausted Site · user",
          status: "failed",
          timestamp: Date.now() - 60_000,
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
      accountsSnapshot: [
        {
          accountId: "exhausted",
          accountName: "Exhausted Site · user",
        },
      ],
    } as any

    mockedAccountStorage.getAllAccounts.mockResolvedValue([
      {
        id: "exhausted",
        disabled: false,
        site_name: "Exhausted Site",
        site_type: "veloera",
        account_info: { username: "user" },
        checkIn: { enableDetection: true, autoCheckInEnabled: true },
      },
    ])

    await (autoCheckinScheduler as any).runRetryCheckins()

    expect(mockedAccountStorage.getAccountById).not.toHaveBeenCalled()
    expect(mockedProviders.resolveAutoCheckinProvider).not.toHaveBeenCalled()
    expect(storedStatus.retryState).toBeUndefined()
    expect(storedStatus.pendingRetry).toBe(false)
    expect(storedStatus.lastRunResult).toBe("failed")
    expect(storedStatus.summary).toMatchObject({
      failedCount: 1,
      needsRetry: true,
    })
    expect(mockedBrowserApi.sendRuntimeMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        action: RuntimeActionIds.AutoCheckinRunCompleted,
        runKind: "retry",
        updatedAccountIds: [],
        summary: expect.objectContaining({
          failedCount: 1,
          needsRetry: true,
        }),
      }),
      { maxAttempts: 1 },
    )

    vi.useRealTimers()
  })
})

describe("autoCheckinScheduler retry scheduling", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns a short fallback delay when retry timing inputs are invalid", () => {
    vi.useFakeTimers()
    const now = new Date(2024, 0, 1, 9, 30, 0)
    vi.setSystemTime(now)

    const nextRetryTime = (
      autoCheckinScheduler as any
    ).computeNextRetryTriggerTime(
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
    storedStatus = null

    await expect(
      (autoCheckinScheduler as any).clearRetryAlarmAndState(null),
    ).resolves.toBeUndefined()

    expect(mockedBrowserApi.clearAlarm).toHaveBeenCalledWith("autoCheckinRetry")
    expect(mockedAutoCheckinStorage.saveStatus).not.toHaveBeenCalled()
  })

  it("syncs a preserved same-day retry alarm back into stored state", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2024, 0, 1, 9, 0, 0))

    const scheduledTime = new Date(2024, 0, 1, 9, 45, 0)
    storedStatus = {
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
    alarmStore.autoCheckinRetry = {
      name: "autoCheckinRetry",
      scheduledTime: scheduledTime.getTime(),
    }

    await (autoCheckinScheduler as any).scheduleRetryAlarm(
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
    expect(storedStatus.nextRetryScheduledAt).toBe(scheduledTime.toISOString())
    expect(storedStatus.retryAlarmTargetDay).toBe("2024-01-01")
    expect(storedStatus.pendingRetry).toBe(true)
    expect(storedStatus.retryState.pendingAccountIds).toEqual(["a"])
    expect(storedStatus.retryState.attemptsByAccount).toEqual({ a: 1 })

    vi.useRealTimers()
  })

  it("clears a preserved retry alarm when its target day is stale", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2024, 0, 2, 9, 0, 0))

    storedStatus = {
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
    alarmStore.autoCheckinRetry = {
      name: "autoCheckinRetry",
      scheduledTime: new Date(2024, 0, 1, 23, 30, 0).getTime(),
    }

    await (autoCheckinScheduler as any).scheduleRetryAlarm(
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
    expect(storedStatus.nextRetryScheduledAt).toBeUndefined()
    expect(storedStatus.retryAlarmTargetDay).toBeUndefined()
    expect(storedStatus.retryState).toBeUndefined()
    expect(storedStatus.pendingRetry).toBe(false)

    vi.useRealTimers()
  })

  it("recreates a missing preserved retry alarm from today's retry state", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2024, 0, 1, 9, 0, 0))

    const expectedRetryTime = new Date(2024, 0, 1, 9, 20, 0)
    storedStatus = {
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

    await (autoCheckinScheduler as any).scheduleRetryAlarm(
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
    expect(storedStatus.nextRetryScheduledAt).toBe(
      expectedRetryTime.toISOString(),
    )
    expect(storedStatus.retryAlarmTargetDay).toBe("2024-01-01")
    expect(storedStatus.pendingRetry).toBe(true)
    expect(storedStatus.retryState.pendingAccountIds).toEqual(["a"])
    expect(storedStatus.retryState.attemptsByAccount).toEqual({ a: 1 })

    vi.useRealTimers()
  })

  it("drops retry state instead of scheduling across the day boundary", async () => {
    vi.useFakeTimers()
    const now = new Date(2024, 0, 1, 23, 59, 55)
    vi.setSystemTime(now)

    storedStatus = {
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

    await (autoCheckinScheduler as any).scheduleRetryAlarm({
      ...(DEFAULT_PREFERENCES as any).autoCheckin,
      retryStrategy: {
        enabled: true,
        intervalMinutes: 30,
        maxAttemptsPerDay: 3,
      },
    })

    expect(mockedBrowserApi.createAlarm).not.toHaveBeenCalled()
    expect(storedStatus.nextRetryScheduledAt).toBeUndefined()
    expect(storedStatus.retryAlarmTargetDay).toBeUndefined()
    expect(storedStatus.retryState).toBeUndefined()
    expect(storedStatus.pendingRetry).toBe(false)

    vi.useRealTimers()
  })

  it("ignores stale retry alarms and clears retry state without retrying", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2024, 0, 2, 9, 0, 0))

    storedStatus = {
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
    expect(storedStatus.retryState).toBeUndefined()
    expect(storedStatus.pendingRetry).toBe(false)

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

    storedStatus = {
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
    expect(mockedProviders.resolveAutoCheckinProvider).not.toHaveBeenCalled()
    expect(mockedBrowserApi.sendRuntimeMessage).not.toHaveBeenCalled()
    expect(storedStatus.retryState).toBeUndefined()
    expect(storedStatus.pendingRetry).toBe(false)

    vi.useRealTimers()
  })

  it("clears retry state when today's normal run has not happened", async () => {
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

    storedStatus = {
      lastDailyRunDay: "2023-12-31",
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
    expect(mockedProviders.resolveAutoCheckinProvider).not.toHaveBeenCalled()
    expect(storedStatus.retryState).toBeUndefined()
    expect(storedStatus.pendingRetry).toBe(false)

    vi.useRealTimers()
  })

  it("clears retry state when there are no pending accounts left", async () => {
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

    storedStatus = {
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
    expect(mockedProviders.resolveAutoCheckinProvider).not.toHaveBeenCalled()
    expect(mockedBrowserApi.sendRuntimeMessage).not.toHaveBeenCalled()
    expect(storedStatus.retryState).toBeUndefined()
    expect(storedStatus.pendingRetry).toBe(false)

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

    storedStatus = {
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

    expect(mockedProviders.resolveAutoCheckinProvider).not.toHaveBeenCalled()
    expect(storedStatus.perAccount.missing).toMatchObject({
      accountId: "missing",
      accountName: "missing",
      status: "skipped",
      reasonCode: "account_disabled",
    })
    expect(storedStatus.summary).toMatchObject({
      totalEligible: 1,
      executed: 0,
      successCount: 0,
      failedCount: 0,
      skippedCount: 1,
      needsRetry: false,
    })
    expect(storedStatus.retryState).toBeUndefined()
    expect(storedStatus.pendingRetry).toBe(false)
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

    storedStatus = {
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
      site_type: "veloera",
      account_info: { username: "user" },
      checkIn: { enableDetection: true, autoCheckInEnabled: false },
    }

    mockedAccountStorage.getAllAccounts.mockResolvedValue([pausedAccount])
    mockedAccountStorage.getAccountById.mockResolvedValue(pausedAccount)
    const provider = {
      canCheckIn: vi.fn(() => true),
      checkIn: vi.fn(),
    }
    mockedProviders.resolveAutoCheckinProvider.mockReturnValue(provider)

    await (autoCheckinScheduler as any).runRetryCheckins()

    expect(provider.checkIn).not.toHaveBeenCalled()
    expect(storedStatus.perAccount.paused).toMatchObject({
      accountId: "paused",
      status: "skipped",
      reasonCode: "auto_checkin_disabled",
    })
    expect(storedStatus.summary).toMatchObject({
      totalEligible: 1,
      executed: 0,
      successCount: 0,
      failedCount: 0,
      skippedCount: 1,
      needsRetry: false,
    })
    expect(storedStatus.retryState).toBeUndefined()
    expect(storedStatus.pendingRetry).toBe(false)
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

  it("clears exhausted retry queues instead of scheduling another retry alarm", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2024, 0, 1, 9, 0, 0))

    storedStatus = {
      lastDailyRunDay: "2024-01-01",
      retryState: {
        day: "2024-01-01",
        pendingAccountIds: ["a"],
        attemptsByAccount: { a: 3 },
      },
      pendingRetry: true,
    } as any

    await (autoCheckinScheduler as any).scheduleRetryAlarm({
      ...(DEFAULT_PREFERENCES as any).autoCheckin,
      retryStrategy: {
        enabled: true,
        intervalMinutes: 30,
        maxAttemptsPerDay: 3,
      },
    })

    expect(mockedBrowserApi.clearAlarm).toHaveBeenCalledWith("autoCheckinRetry")
    expect(mockedBrowserApi.createAlarm).not.toHaveBeenCalled()
    expect(storedStatus.retryState).toBeUndefined()
    expect(storedStatus.pendingRetry).toBe(false)
    expect(storedStatus.nextRetryScheduledAt).toBeUndefined()

    vi.useRealTimers()
  })
})

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

    storedStatus = {
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
      site_type: "veloera",
      account_info: { username: "disabled-user" },
      checkIn: { enableDetection: true, autoCheckInEnabled: true },
    }
    const detectionDisabledAccount: any = {
      id: "detection-disabled",
      disabled: false,
      site_name: "Detection Disabled Site",
      site_type: "veloera",
      account_info: { username: "detection-user" },
      checkIn: { enableDetection: false, autoCheckInEnabled: true },
    }

    mockedAccountStorage.getAllAccounts.mockResolvedValue([
      disabledAccount,
      detectionDisabledAccount,
    ])

    await autoCheckinScheduler.runCheckins({
      runType: AUTO_CHECKIN_RUN_TYPE.MANUAL,
      targetAccountIds: ["disabled", "detection-disabled"],
    })

    expect(storedStatus.perAccount.legacy).toMatchObject({
      status: "success",
    })
    expect(storedStatus.perAccount.disabled).toMatchObject({
      status: "skipped",
      reasonCode: "account_disabled",
    })
    expect(storedStatus.perAccount["detection-disabled"]).toBeUndefined()
    expect(storedStatus.summary).toEqual({
      totalEligible: 2,
      executed: 1,
      successCount: 1,
      failedCount: 0,
      skippedCount: 1,
      needsRetry: false,
    })
    expect(storedStatus.pendingRetry).toBe(true)
    expect(storedStatus.retryState).toEqual({
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
          skippedCount: 1,
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

    storedStatus = {
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
      site_type: "veloera",
      account_info: { username: "user" },
      checkIn: { enableDetection: true, autoCheckInEnabled: true },
    }
    const otherAccount: any = {
      id: "other",
      disabled: false,
      site_name: "Other Retry",
      site_type: "veloera",
      account_info: { username: "other" },
      checkIn: { enableDetection: true, autoCheckInEnabled: true },
    }

    mockedAccountStorage.getAllAccounts.mockResolvedValue([
      targetAccount,
      otherAccount,
    ])

    const provider = {
      canCheckIn: vi.fn(() => true),
      checkIn: vi.fn(async () => ({ status: "success" })),
    }
    mockedProviders.resolveAutoCheckinProvider.mockReturnValue(provider)

    await autoCheckinScheduler.runCheckins({
      runType: AUTO_CHECKIN_RUN_TYPE.MANUAL,
      targetAccountIds: ["target"],
    })

    expect(provider.checkIn).toHaveBeenCalledTimes(1)
    expect(provider.checkIn).toHaveBeenCalledWith(
      expect.objectContaining({ id: "target" }),
    )
    expect(storedStatus.perAccount.target).toMatchObject({
      status: "success",
    })
    expect(storedStatus.perAccount.other).toMatchObject({
      status: "failed",
    })
    expect(storedStatus.retryState).toEqual({
      day: "2024-01-01",
      pendingAccountIds: ["other"],
      attemptsByAccount: { target: 1, other: 2 },
    })
    expect(storedStatus.pendingRetry).toBe(true)
    expect(storedStatus.summary).toMatchObject({
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

    storedStatus = {
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
      site_type: "veloera",
      account_info: { username: "user" },
      checkIn: { enableDetection: true, autoCheckInEnabled: true },
    }

    mockedAccountStorage.getAllAccounts.mockResolvedValue([targetAccount])
    const provider = {
      canCheckIn: vi.fn(() => true),
      checkIn: vi.fn(async () => ({ status: "success" })),
    }
    mockedProviders.resolveAutoCheckinProvider.mockReturnValue(provider)

    await autoCheckinScheduler.runCheckins({
      runType: AUTO_CHECKIN_RUN_TYPE.MANUAL,
      targetAccountIds: ["target"],
    })

    expect(provider.checkIn).toHaveBeenCalledTimes(1)
    expect(storedStatus.perAccount.target).toMatchObject({
      status: "success",
    })
    expect(storedStatus.retryState).toBeUndefined()
    expect(storedStatus.pendingRetry).toBe(false)
    expect(storedStatus.summary).toMatchObject({
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
      site_type: "veloera",
      account_info: { username: "user-a" },
      checkIn: { enableDetection: true },
    }
    const accountB: any = {
      id: "b",
      disabled: false,
      site_name: "SiteB",
      site_type: "veloera",
      account_info: { username: "user-b" },
      checkIn: { enableDetection: true },
    }

    mockedAccountStorage.getAllAccounts.mockResolvedValue([accountA, accountB])

    const provider = {
      canCheckIn: vi.fn(() => true),
      checkIn: vi.fn(async (account: any) => {
        void account
        return { status: "success" }
      }),
    }
    mockedProviders.resolveAutoCheckinProvider.mockReturnValue(provider)

    await autoCheckinScheduler.runCheckins({
      runType: AUTO_CHECKIN_RUN_TYPE.MANUAL,
      targetAccountIds: ["a"],
    })

    expect(provider.checkIn).toHaveBeenCalledTimes(1)
    expect(provider.checkIn).toHaveBeenCalledWith(
      expect.objectContaining({ id: "a" }),
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
      site_type: "veloera",
      account_info: { username: "alice" },
      checkIn: { enableDetection: true },
    }
    const accountB: any = {
      id: "b",
      disabled: false,
      site_name: "same   name",
      site_type: "veloera",
      account_info: { username: "bob" },
      checkIn: { enableDetection: true },
    }

    mockedAccountStorage.getAllAccounts.mockResolvedValue([accountA, accountB])

    const provider = {
      canCheckIn: vi.fn(() => true),
      checkIn: vi.fn(async () => ({ status: "success" })),
    }
    mockedProviders.resolveAutoCheckinProvider.mockReturnValue(provider)

    await autoCheckinScheduler.runCheckins({
      runType: AUTO_CHECKIN_RUN_TYPE.MANUAL,
    })

    expect(storedStatus.perAccount.a.accountName).toBe("Same Name · alice")
    expect(storedStatus.perAccount.b.accountName).toBe("same   name · bob")

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
      site_type: "veloera",
      account_info: { username: "alice" },
      checkIn: { enableDetection: true },
    }
    const accountB: any = {
      id: "b",
      disabled: false,
      site_name: "same   name",
      site_type: "veloera",
      account_info: { username: "bob" },
      checkIn: { enableDetection: true },
    }

    mockedAccountStorage.getAllAccounts.mockResolvedValue([accountA, accountB])

    const provider = {
      canCheckIn: vi.fn(() => true),
      checkIn: vi.fn(async () => ({ status: "success" })),
    }
    mockedProviders.resolveAutoCheckinProvider.mockReturnValue(provider)

    await autoCheckinScheduler.runCheckins({
      runType: AUTO_CHECKIN_RUN_TYPE.MANUAL,
      targetAccountIds: ["a"],
    })

    expect(storedStatus.perAccount.a.accountName).toBe("Same Name · alice")
    expect(storedStatus.perAccount.b).toBeUndefined()

    vi.useRealTimers()
  })
})

describe("autoCheckinScheduler run-completed notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("emits autoCheckin:runCompleted when notifyUiOnCompletion is enabled", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2024, 0, 1, 9, 0, 0))

    const callOrder: string[] = []

    mockedBrowserApi.sendRuntimeMessage.mockImplementation(async () => {
      callOrder.push("send")
      return undefined as any
    })

    mockedUserPreferences.getPreferences.mockResolvedValue({
      autoCheckin: {
        globalEnabled: true,
        pretriggerDailyOnUiOpen: false,
        notifyUiOnCompletion: true,
        windowStart: "08:00",
        windowEnd: "10:00",
        scheduleMode: "random",
        deterministicTime: "08:00",
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
      site_type: "veloera",
      account_info: { username: "user-a" },
      checkIn: { enableDetection: true },
    }
    const accountB: any = {
      id: "b",
      disabled: false,
      site_name: "SiteB",
      site_type: "veloera",
      account_info: { username: "user-b" },
      checkIn: { enableDetection: true },
    }

    mockedAccountStorage.getAllAccounts.mockResolvedValue([accountA, accountB])
    mockedAccountStorage.refreshAccount.mockImplementation(
      async (id: string) => {
        callOrder.push("refresh")
        return {
          account: id === "a" ? accountA : accountB,
          refreshed: true,
        } as any
      },
    )

    const provider = {
      canCheckIn: vi.fn(() => true),
      checkIn: vi.fn(async (account: any) => {
        return account.id === "a"
          ? { status: "success" }
          : { status: "failed", rawMessage: "boom" }
      }),
    }
    mockedProviders.resolveAutoCheckinProvider.mockReturnValue(provider)

    await autoCheckinScheduler.runCheckins({
      runType: AUTO_CHECKIN_RUN_TYPE.MANUAL,
    })

    expect(mockedAccountStorage.refreshAccount).toHaveBeenCalledWith("a", true)
    expect(mockedBrowserApi.sendRuntimeMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        action: RuntimeActionIds.AutoCheckinRunCompleted,
        runKind: "manual",
        updatedAccountIds: ["a"],
        timestamp: expect.any(Number),
      }),
      { maxAttempts: 1 },
    )
    expect(callOrder).toEqual(["refresh", "send"])

    vi.useRealTimers()
  })

  it("still emits autoCheckin:runCompleted when post-checkin refresh fails", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2024, 0, 1, 9, 0, 0))

    const callOrder: string[] = []

    mockedBrowserApi.sendRuntimeMessage.mockImplementation(async () => {
      callOrder.push("send")
      return undefined as any
    })

    mockedUserPreferences.getPreferences.mockResolvedValue({
      autoCheckin: {
        globalEnabled: true,
        pretriggerDailyOnUiOpen: false,
        notifyUiOnCompletion: true,
        windowStart: "08:00",
        windowEnd: "10:00",
        scheduleMode: "random",
        deterministicTime: "08:00",
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
      site_type: "veloera",
      account_info: { username: "user-a" },
      checkIn: { enableDetection: true },
    }

    mockedAccountStorage.getAllAccounts.mockResolvedValue([accountA])
    mockedAccountStorage.refreshAccount.mockImplementation(async () => {
      callOrder.push("refresh")
      throw new Error("refresh boom")
    })

    const provider = {
      canCheckIn: vi.fn(() => true),
      checkIn: vi.fn(async () => ({ status: "success" })),
    }
    mockedProviders.resolveAutoCheckinProvider.mockReturnValue(provider)

    await autoCheckinScheduler.runCheckins({
      runType: AUTO_CHECKIN_RUN_TYPE.MANUAL,
    })

    expect(mockedAccountStorage.refreshAccount).toHaveBeenCalledWith("a", true)
    expect(mockedBrowserApi.sendRuntimeMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        action: RuntimeActionIds.AutoCheckinRunCompleted,
        runKind: "manual",
        updatedAccountIds: ["a"],
        timestamp: expect.any(Number),
      }),
      { maxAttempts: 1 },
    )
    expect(callOrder).toEqual(["refresh", "send"])

    vi.useRealTimers()
  })

  it("does not emit autoCheckin:runCompleted when notifyUiOnCompletion is disabled", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2024, 0, 1, 9, 0, 0))

    mockedBrowserApi.sendRuntimeMessage.mockResolvedValue(undefined as any)

    mockedUserPreferences.getPreferences.mockResolvedValue({
      autoCheckin: {
        globalEnabled: true,
        pretriggerDailyOnUiOpen: false,
        notifyUiOnCompletion: false,
        windowStart: "08:00",
        windowEnd: "10:00",
        scheduleMode: "random",
        deterministicTime: "08:00",
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
      site_type: "veloera",
      account_info: { username: "user-a" },
      checkIn: { enableDetection: true },
    }

    mockedAccountStorage.getAllAccounts.mockResolvedValue([accountA])
    mockedAccountStorage.refreshAccount.mockResolvedValue({
      account: accountA,
      refreshed: true,
    } as any)

    const provider = {
      canCheckIn: vi.fn(() => true),
      checkIn: vi.fn(async () => ({ status: "success" })),
    }
    mockedProviders.resolveAutoCheckinProvider.mockReturnValue(provider)

    await autoCheckinScheduler.runCheckins({
      runType: AUTO_CHECKIN_RUN_TYPE.MANUAL,
    })

    expect(mockedAccountStorage.refreshAccount).toHaveBeenCalledWith("a", true)
    expect(mockedBrowserApi.sendRuntimeMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({
        action: RuntimeActionIds.AutoCheckinRunCompleted,
      }),
    )

    vi.useRealTimers()
  })
})

describe("handleAutoCheckinMessage", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
  })

  it("should run checkins on autoCheckin:runNow", async () => {
    const runSpy = vi
      .spyOn(autoCheckinScheduler as any, "runCheckins")
      .mockResolvedValueOnce(undefined)
    const sendResponse = vi.fn()

    await handleAutoCheckinMessage(
      { action: RuntimeActionIds.AutoCheckinRunNow },
      sendResponse,
    )

    expect(runSpy).toHaveBeenCalledWith({
      runType: AUTO_CHECKIN_RUN_TYPE.MANUAL,
      targetAccountIds: undefined,
    })
    expect(sendResponse).toHaveBeenCalledWith({ success: true })
  })

  it("should pass accountIds for targeted manual runs", async () => {
    const runSpy = vi
      .spyOn(autoCheckinScheduler as any, "runCheckins")
      .mockResolvedValueOnce(undefined)
    const sendResponse = vi.fn()

    await handleAutoCheckinMessage(
      { action: RuntimeActionIds.AutoCheckinRunNow, accountIds: ["a"] },
      sendResponse,
    )

    expect(runSpy).toHaveBeenCalledWith({
      runType: AUTO_CHECKIN_RUN_TYPE.MANUAL,
      targetAccountIds: ["a"],
    })
    expect(sendResponse).toHaveBeenCalledWith({ success: true })
  })

  it("should trim and dedupe targeted accountIds before running", async () => {
    const runSpy = vi
      .spyOn(autoCheckinScheduler as any, "runCheckins")
      .mockResolvedValueOnce(undefined)
    const sendResponse = vi.fn()

    await handleAutoCheckinMessage(
      {
        action: RuntimeActionIds.AutoCheckinRunNow,
        accountIds: [" a ", "a", "b "],
      },
      sendResponse,
    )

    expect(runSpy).toHaveBeenCalledWith({
      runType: AUTO_CHECKIN_RUN_TYPE.MANUAL,
      targetAccountIds: ["a", "b"],
    })
    expect(sendResponse).toHaveBeenCalledWith({ success: true })
  })

  it("should return an error for invalid accountIds payload", async () => {
    const runSpy = vi
      .spyOn(autoCheckinScheduler as any, "runCheckins")
      .mockResolvedValueOnce(undefined)
    const sendResponse = vi.fn()

    await handleAutoCheckinMessage(
      { action: RuntimeActionIds.AutoCheckinRunNow, accountIds: [] },
      sendResponse,
    )

    expect(runSpy).not.toHaveBeenCalled()
    expect(sendResponse).toHaveBeenCalledWith({
      success: false,
      error: "Invalid payload: accountIds must be a non-empty string[]",
    })
  })

  it("should reject non-array accountIds payloads before running", async () => {
    const runSpy = vi
      .spyOn(autoCheckinScheduler as any, "runCheckins")
      .mockResolvedValueOnce(undefined)
    const sendResponse = vi.fn()

    await handleAutoCheckinMessage(
      {
        action: RuntimeActionIds.AutoCheckinRunNow,
        accountIds: "account-1",
      },
      sendResponse,
    )

    expect(runSpy).not.toHaveBeenCalled()
    expect(sendResponse).toHaveBeenCalledWith({
      success: false,
      error: "Invalid payload: accountIds must be a non-empty string[]",
    })
  })

  it("should reject targeted manual runs when accountIds contain blank or non-string values", async () => {
    const runSpy = vi
      .spyOn(autoCheckinScheduler as any, "runCheckins")
      .mockResolvedValueOnce(undefined)
    const sendResponse = vi.fn()

    await handleAutoCheckinMessage(
      {
        action: RuntimeActionIds.AutoCheckinRunNow,
        accountIds: ["account-1", " ", 42],
      },
      sendResponse,
    )

    expect(runSpy).not.toHaveBeenCalled()
    expect(sendResponse).toHaveBeenCalledWith({
      success: false,
      error: "Invalid payload: accountIds must be a non-empty string[]",
    })
  })

  it("should trigger daily alarm handler on autoCheckin:debugTriggerDailyAlarmNow", async () => {
    const debugSpy = vi
      .spyOn(autoCheckinScheduler as any, "debugTriggerDailyAlarmNow")
      .mockResolvedValueOnce(undefined)
    const sendResponse = vi.fn()

    await handleAutoCheckinMessage(
      { action: RuntimeActionIds.AutoCheckinDebugTriggerDailyAlarmNow },
      sendResponse,
    )

    expect(debugSpy).toHaveBeenCalled()
    expect(sendResponse).toHaveBeenCalledWith({ success: true })
  })

  it("should trigger retry alarm handler on autoCheckin:debugTriggerRetryAlarmNow", async () => {
    const debugSpy = vi
      .spyOn(autoCheckinScheduler as any, "debugTriggerRetryAlarmNow")
      .mockResolvedValueOnce(undefined)
    const sendResponse = vi.fn()

    await handleAutoCheckinMessage(
      { action: RuntimeActionIds.AutoCheckinDebugTriggerRetryAlarmNow },
      sendResponse,
    )

    expect(debugSpy).toHaveBeenCalled()
    expect(sendResponse).toHaveBeenCalledWith({ success: true })
  })

  it("should return status on autoCheckin:getStatus", async () => {
    const status = { lastRunResult: "success" }
    mockedAutoCheckinStorage.getStatus.mockResolvedValue(status as any)
    const sendResponse = vi.fn()

    await handleAutoCheckinMessage(
      { action: RuntimeActionIds.AutoCheckinGetStatus },
      sendResponse,
    )

    expect(sendResponse).toHaveBeenCalledWith({ success: true, data: status })
  })

  it("should retry a specific account on autoCheckin:retryAccount", async () => {
    const retrySpy = vi
      .spyOn(autoCheckinScheduler as any, "retryAccount")
      .mockResolvedValueOnce(undefined)
    const sendResponse = vi.fn()

    await handleAutoCheckinMessage(
      {
        action: RuntimeActionIds.AutoCheckinRetryAccount,
        accountId: "account-1",
      },
      sendResponse,
    )

    expect(retrySpy).toHaveBeenCalledWith("account-1")
    expect(sendResponse).toHaveBeenCalledWith({ success: true })
  })

  it("should surface retryAccount failures back to the caller", async () => {
    const retrySpy = vi
      .spyOn(autoCheckinScheduler as any, "retryAccount")
      .mockRejectedValueOnce(new Error("retry failed"))
    ;(
      getErrorMessage as unknown as ReturnType<typeof vi.fn>
    ).mockReturnValueOnce("retry failed")
    const sendResponse = vi.fn()

    await handleAutoCheckinMessage(
      {
        action: RuntimeActionIds.AutoCheckinRetryAccount,
        accountId: "account-1",
      },
      sendResponse,
    )

    expect(retrySpy).toHaveBeenCalledWith("account-1")
    expect(sendResponse).toHaveBeenCalledWith({
      success: false,
      error: "retry failed",
    })
  })

  it("should reject retry requests without an accountId", async () => {
    const retrySpy = vi.spyOn(autoCheckinScheduler as any, "retryAccount")
    const sendResponse = vi.fn()

    await handleAutoCheckinMessage(
      { action: RuntimeActionIds.AutoCheckinRetryAccount },
      sendResponse,
    )

    expect(retrySpy).not.toHaveBeenCalled()
    expect(sendResponse).toHaveBeenCalledWith({
      success: false,
      error: "Missing accountId",
    })
  })

  it("should return account display data on autoCheckin:getAccountInfo", async () => {
    const displayData = { id: "account-1", name: "Test Account" }
    const displaySpy = vi
      .spyOn(autoCheckinScheduler as any, "getAccountDisplayData")
      .mockResolvedValueOnce(displayData)
    const sendResponse = vi.fn()

    await handleAutoCheckinMessage(
      {
        action: RuntimeActionIds.AutoCheckinGetAccountInfo,
        accountId: "account-1",
      },
      sendResponse,
    )

    expect(displaySpy).toHaveBeenCalledWith("account-1", {
      includeDisabled: false,
    })
    expect(sendResponse).toHaveBeenCalledWith({
      success: true,
      data: displayData,
    })
  })

  it("should allow disabled account info lookup when includeDisabled is true", async () => {
    const displayData = { id: "disabled-1", name: "Disabled Account" }
    const displaySpy = vi
      .spyOn(autoCheckinScheduler as any, "getAccountDisplayData")
      .mockResolvedValueOnce(displayData)
    const sendResponse = vi.fn()

    await handleAutoCheckinMessage(
      {
        action: RuntimeActionIds.AutoCheckinGetAccountInfo,
        accountId: "disabled-1",
        includeDisabled: true,
      },
      sendResponse,
    )

    expect(displaySpy).toHaveBeenCalledWith("disabled-1", {
      includeDisabled: true,
    })
    expect(sendResponse).toHaveBeenCalledWith({
      success: true,
      data: displayData,
    })
  })

  it("should surface account info lookup failures back to the caller", async () => {
    const displaySpy = vi
      .spyOn(autoCheckinScheduler as any, "getAccountDisplayData")
      .mockRejectedValueOnce(new Error("lookup failed"))
    ;(
      getErrorMessage as unknown as ReturnType<typeof vi.fn>
    ).mockReturnValueOnce("lookup failed")
    const sendResponse = vi.fn()

    await handleAutoCheckinMessage(
      {
        action: RuntimeActionIds.AutoCheckinGetAccountInfo,
        accountId: "account-1",
      },
      sendResponse,
    )

    expect(displaySpy).toHaveBeenCalledWith("account-1", {
      includeDisabled: false,
    })
    expect(sendResponse).toHaveBeenCalledWith({
      success: false,
      error: "lookup failed",
    })
  })

  it("should reject account info requests without an accountId", async () => {
    const displaySpy = vi.spyOn(
      autoCheckinScheduler as any,
      "getAccountDisplayData",
    )
    const sendResponse = vi.fn()

    await handleAutoCheckinMessage(
      { action: RuntimeActionIds.AutoCheckinGetAccountInfo },
      sendResponse,
    )

    expect(displaySpy).not.toHaveBeenCalled()
    expect(sendResponse).toHaveBeenCalledWith({
      success: false,
      error: "Missing accountId",
    })
  })

  it("should update settings on autoCheckin:updateSettings", async () => {
    const updateSpy = vi
      .spyOn(autoCheckinScheduler as any, "updateSettings")
      .mockResolvedValueOnce(undefined)
    const sendResponse = vi.fn()
    const settings = { globalEnabled: false }

    await handleAutoCheckinMessage(
      { action: RuntimeActionIds.AutoCheckinUpdateSettings, settings },
      sendResponse,
    )

    expect(updateSpy).toHaveBeenCalledWith(settings)
    expect(sendResponse).toHaveBeenCalledWith({ success: true })
  })

  it("should pretrigger daily run on autoCheckin:pretriggerDailyOnUiOpen", async () => {
    const pretriggerSpy = vi
      .spyOn(autoCheckinScheduler as any, "pretriggerDailyOnUiOpen")
      .mockResolvedValueOnce({ started: false, eligible: false })
    const sendResponse = vi.fn()

    await handleAutoCheckinMessage(
      {
        action: RuntimeActionIds.AutoCheckinPretriggerDailyOnUiOpen,
        requestId: "req-1",
      },
      sendResponse,
    )

    expect(pretriggerSpy).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: "req-1" }),
    )
    expect(sendResponse).toHaveBeenCalledWith({
      success: true,
      started: false,
      eligible: false,
    })
  })

  it("should reset lastDailyRunDay on autoCheckin:debugResetLastDailyRunDay", async () => {
    const debugSpy = vi
      .spyOn(autoCheckinScheduler as any, "debugResetLastDailyRunDay")
      .mockResolvedValueOnce(undefined)
    const sendResponse = vi.fn()

    await handleAutoCheckinMessage(
      { action: RuntimeActionIds.AutoCheckinDebugResetLastDailyRunDay },
      sendResponse,
    )

    expect(debugSpy).toHaveBeenCalled()
    expect(sendResponse).toHaveBeenCalledWith({ success: true })
  })

  it("should schedule the daily alarm for today on autoCheckin:debugScheduleDailyAlarmForToday", async () => {
    const debugSpy = vi
      .spyOn(autoCheckinScheduler as any, "debugScheduleDailyAlarmForToday")
      .mockResolvedValueOnce(123)
    const sendResponse = vi.fn()

    await handleAutoCheckinMessage(
      {
        action: RuntimeActionIds.AutoCheckinDebugScheduleDailyAlarmForToday,
        minutesFromNow: 5,
      },
      sendResponse,
    )

    expect(debugSpy).toHaveBeenCalledWith({ minutesFromNow: 5 })
    expect(sendResponse).toHaveBeenCalledWith({
      success: true,
      scheduledTime: 123,
    })
  })

  it("should return error for unknown action", async () => {
    const sendResponse = vi.fn()

    await handleAutoCheckinMessage({ action: "unknown" }, sendResponse)

    expect(sendResponse).toHaveBeenCalledWith({
      success: false,
      error: "Unknown action",
    })
  })

  it("should catch errors and respond with error message", async () => {
    const error = new Error("boom")
    const runSpy = vi
      .spyOn(autoCheckinScheduler as any, "runCheckins")
      .mockRejectedValueOnce(error)
    ;(getErrorMessage as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      "boom",
    )
    const sendResponse = vi.fn()

    await handleAutoCheckinMessage(
      { action: RuntimeActionIds.AutoCheckinRunNow },
      sendResponse,
    )

    expect(runSpy).toHaveBeenCalled()
    expect(sendResponse).toHaveBeenCalledWith({ success: false, error: "boom" })
  })

  it("should still reschedule after a manual run failure", async () => {
    const runSpy = vi
      .spyOn(autoCheckinScheduler as any, "runCheckins")
      .mockRejectedValueOnce(new Error("boom"))
    const scheduleSpy = vi
      .spyOn(autoCheckinScheduler as any, "scheduleNextRun")
      .mockResolvedValueOnce(undefined)
    ;(getErrorMessage as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      "boom",
    )
    const sendResponse = vi.fn()

    await handleAutoCheckinMessage(
      { action: RuntimeActionIds.AutoCheckinRunNow },
      sendResponse,
    )

    expect(runSpy).toHaveBeenCalled()
    expect(scheduleSpy).toHaveBeenCalledWith({ preserveExisting: true })
    expect(sendResponse).toHaveBeenCalledWith({ success: false, error: "boom" })
  })

  it("should keep the manual run response successful when post-run rescheduling fails", async () => {
    const runSpy = vi
      .spyOn(autoCheckinScheduler as any, "runCheckins")
      .mockResolvedValueOnce(undefined)
    const scheduleSpy = vi
      .spyOn(autoCheckinScheduler as any, "scheduleNextRun")
      .mockRejectedValueOnce(new Error("reschedule failed"))
    const sendResponse = vi.fn()

    await handleAutoCheckinMessage(
      { action: RuntimeActionIds.AutoCheckinRunNow },
      sendResponse,
    )

    expect(runSpy).toHaveBeenCalledWith({
      runType: AUTO_CHECKIN_RUN_TYPE.MANUAL,
      targetAccountIds: undefined,
    })
    expect(scheduleSpy).toHaveBeenCalledWith({ preserveExisting: true })
    expect(sendResponse).toHaveBeenCalledWith({ success: true })
  })
})

describe("autoCheckinScheduler.retryAccount", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
  })

  it("throws when retrying an account that no longer exists", async () => {
    mockedAccountStorage.getAllAccounts.mockResolvedValueOnce([])

    await expect(
      autoCheckinScheduler.retryAccount("missing-account"),
    ).rejects.toThrow()
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

    const result = await autoCheckinScheduler.retryAccount("disabled-1")

    expect(result.result.status).toBe("skipped")
    expect(result.result.reasonCode).toBe("account_disabled")
    expect(mockedAutoCheckinStorage.saveStatus).toHaveBeenCalled()
  })

  it("removes a disabled queued account from today's retry queue", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-01-23T09:00:00"))

    const disabledAccount: any = {
      id: "disabled-1",
      disabled: true,
      site_name: "Disabled",
      site_type: "veloera",
      account_info: { username: "user" },
      checkIn: { enableDetection: true, autoCheckInEnabled: true },
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

    storedStatus = {
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
      .spyOn(autoCheckinScheduler as any, "scheduleRetryAlarm")
      .mockResolvedValue(undefined)

    const result = await autoCheckinScheduler.retryAccount("disabled-1")

    expect(result.result.status).toBe("skipped")
    expect(result.result.reasonCode).toBe("account_disabled")
    expect(result.pendingRetry).toBe(false)
    expect(storedStatus.lastRunResult).toBe("success")
    expect(storedStatus.retryState).toBeUndefined()
    expect(storedStatus.pendingRetry).toBe(false)
    expect(storedStatus.summary).toMatchObject({
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
      site_type: "veloera",
      account_info: { username: "user" },
      checkIn: { enableDetection: true, autoCheckInEnabled: true },
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

    storedStatus = {
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
      canCheckIn: vi.fn(() => true),
      checkIn: vi.fn(async () => ({ status: "success" })),
    }
    mockedProviders.resolveAutoCheckinProvider.mockReturnValue(provider)
    const scheduleRetrySpy = vi
      .spyOn(autoCheckinScheduler as any, "scheduleRetryAlarm")
      .mockResolvedValue(undefined)

    const result = await autoCheckinScheduler.retryAccount("retry-1")

    expect(result.result.status).toBe("success")
    expect(result.pendingRetry).toBe(false)
    expect(storedStatus.lastRunResult).toBe("success")
    expect(storedStatus.retryState).toBeUndefined()
    expect(storedStatus.pendingRetry).toBe(false)
    expect(storedStatus.summary).toMatchObject({
      successCount: 1,
      failedCount: 0,
      needsRetry: false,
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
      site_type: "veloera",
      account_info: { username: "user" },
      checkIn: { enableDetection: true, autoCheckInEnabled: true },
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

    storedStatus = {
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
      canCheckIn: vi.fn(() => true),
      checkIn: vi.fn(async () => ({ status: "success" })),
    }
    mockedProviders.resolveAutoCheckinProvider.mockReturnValue(provider)

    vi.spyOn(
      autoCheckinScheduler as any,
      "scheduleRetryAlarm",
    ).mockRejectedValueOnce(new Error("retry reschedule failed"))

    await expect(autoCheckinScheduler.retryAccount("retry-1")).rejects.toThrow(
      "retry reschedule failed",
    )

    expect(storedStatus.lastRunResult).toBe("success")
    expect(storedStatus.retryState).toBeUndefined()
    expect(storedStatus.pendingRetry).toBe(false)
    expect(storedStatus.summary).toMatchObject({
      successCount: 1,
      failedCount: 0,
      needsRetry: false,
    })
    expect(mockedAutoCheckinStorage.saveStatus).toHaveBeenCalled()

    vi.useRealTimers()
  })

  it("removes only the retried account from today's retry queue when other failures still need retry", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-01-23T09:00:00"))

    const account: any = {
      id: "retry-1",
      disabled: false,
      site_name: "Retry Site",
      site_type: "veloera",
      account_info: { username: "user" },
      checkIn: { enableDetection: true, autoCheckInEnabled: true },
    }
    const remainingAccount: any = {
      id: "retry-2",
      disabled: false,
      site_name: "Still Failing",
      site_type: "veloera",
      account_info: { username: "other" },
      checkIn: { enableDetection: true, autoCheckInEnabled: true },
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

    storedStatus = {
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
      canCheckIn: vi.fn(() => true),
      checkIn: vi.fn(async () => ({ status: "success" })),
    }
    mockedProviders.resolveAutoCheckinProvider.mockReturnValue(provider)
    const scheduleRetrySpy = vi
      .spyOn(autoCheckinScheduler as any, "scheduleRetryAlarm")
      .mockResolvedValue(undefined)

    const result = await autoCheckinScheduler.retryAccount("retry-1")

    expect(result.result.status).toBe("success")
    expect(result.pendingRetry).toBe(true)
    expect(storedStatus.lastRunResult).toBe("partial")
    expect(storedStatus.retryState).toEqual({
      day: "2026-01-23",
      pendingAccountIds: ["retry-2"],
      attemptsByAccount: { "retry-1": 1, "retry-2": 2 },
    })
    expect(storedStatus.pendingRetry).toBe(true)
    expect(storedStatus.summary).toMatchObject({
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
      site_type: "veloera",
      account_info: { username: "user" },
      checkIn: { enableDetection: true, autoCheckInEnabled: true },
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

    storedStatus = {
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
      canCheckIn: vi.fn(() => true),
      checkIn: vi.fn(async () => ({
        status: "failed",
        rawMessage: "retry still failing",
      })),
    }
    mockedProviders.resolveAutoCheckinProvider.mockReturnValue(provider)
    const scheduleRetrySpy = vi
      .spyOn(autoCheckinScheduler as any, "scheduleRetryAlarm")
      .mockResolvedValue(undefined)

    const result = await autoCheckinScheduler.retryAccount("retry-1")

    expect(result.result.status).toBe("failed")
    expect(result.pendingRetry).toBe(true)
    expect(storedStatus.lastRunResult).toBe("failed")
    expect(storedStatus.retryState).toEqual({
      day: "2026-01-23",
      pendingAccountIds: ["retry-1", "retry-2"],
      attemptsByAccount: { "retry-1": 1, "retry-2": 2 },
    })
    expect(storedStatus.pendingRetry).toBe(true)
    expect(storedStatus.summary).toMatchObject({
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
      site_type: "veloera",
      account_info: { username: "adhoc" },
      checkIn: { enableDetection: true, autoCheckInEnabled: true },
    }
    const queuedAccount: any = {
      id: "retry-2",
      disabled: false,
      site_name: "Queued Retry",
      site_type: "veloera",
      account_info: { username: "queued" },
      checkIn: { enableDetection: true, autoCheckInEnabled: true },
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

    storedStatus = {
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
      canCheckIn: vi.fn(() => true),
      checkIn: vi.fn(async () => ({ status: "success" })),
    }
    mockedProviders.resolveAutoCheckinProvider.mockReturnValue(provider)
    const scheduleRetrySpy = vi
      .spyOn(autoCheckinScheduler as any, "scheduleRetryAlarm")
      .mockResolvedValue(undefined)

    const result = await autoCheckinScheduler.retryAccount("adhoc-1")

    expect(result.result.status).toBe("success")
    expect(result.pendingRetry).toBe(true)
    expect(storedStatus.lastRunResult).toBe("partial")
    expect(storedStatus.retryState).toEqual({
      day: "2026-01-23",
      pendingAccountIds: ["retry-2"],
      attemptsByAccount: { "retry-2": 2 },
    })
    expect(storedStatus.pendingRetry).toBe(true)
    expect(storedStatus.summary).toMatchObject({
      totalEligible: 1,
      successCount: 1,
      failedCount: 1,
      needsRetry: true,
    })
    expect(scheduleRetrySpy).toHaveBeenCalledTimes(1)

    vi.useRealTimers()
  })
})

describe("autoCheckinScheduler.getAccountDisplayData", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
  })

  it("returns persisted display data when available", async () => {
    const account: any = {
      id: "account-1",
      disabled: false,
      site_name: "Display Site",
      account_info: { username: "user" },
    }
    const displayData = {
      id: "account-1",
      name: "Display Site · user",
      username: "user",
    }

    mockedAccountStorage.getAccountById.mockResolvedValueOnce(account)
    mockedAccountStorage.getDisplayDataById.mockResolvedValueOnce(displayData)

    await expect(
      autoCheckinScheduler.getAccountDisplayData("account-1"),
    ).resolves.toEqual(displayData as any)
    expect(mockedAccountStorage.convertToDisplayData).not.toHaveBeenCalled()
  })

  it("falls back to converting the raw account when persisted display data is unavailable", async () => {
    const account: any = {
      id: "account-2",
      disabled: false,
      site_name: "Fallback Site",
      account_info: { username: "fallback-user" },
    }
    const displayData = {
      id: "account-2",
      name: "Fallback Site · fallback-user",
      username: "fallback-user",
    }

    mockedAccountStorage.getAccountById.mockResolvedValueOnce(account)
    mockedAccountStorage.getDisplayDataById.mockResolvedValueOnce(null)
    mockedAccountStorage.convertToDisplayData.mockReturnValueOnce(displayData)

    await expect(
      autoCheckinScheduler.getAccountDisplayData("account-2"),
    ).resolves.toEqual(displayData as any)
    expect(mockedAccountStorage.convertToDisplayData).toHaveBeenCalledWith(
      account,
    )
  })

  it("throws when the requested account does not exist", async () => {
    mockedAccountStorage.getAccountById.mockResolvedValueOnce(null)

    await expect(
      autoCheckinScheduler.getAccountDisplayData("missing-account"),
    ).rejects.toThrow()
    expect(mockedAccountStorage.getDisplayDataById).not.toHaveBeenCalled()
  })

  it("throws when the requested account is disabled", async () => {
    mockedAccountStorage.getAccountById.mockResolvedValueOnce({
      id: "disabled-account",
      disabled: true,
      site_name: "Disabled Site",
      account_info: { username: "user" },
    })

    await expect(
      autoCheckinScheduler.getAccountDisplayData("disabled-account"),
    ).rejects.toThrow()
    expect(mockedAccountStorage.getDisplayDataById).not.toHaveBeenCalled()
  })

  it("returns disabled account display data when includeDisabled is enabled", async () => {
    const account: any = {
      id: "disabled-account",
      disabled: true,
      site_name: "Disabled Site",
      account_info: { username: "user" },
    }
    const displayData = {
      id: "disabled-account",
      name: "Disabled Site · user",
      username: "user",
      disabled: true,
    }

    mockedAccountStorage.getAccountById.mockResolvedValueOnce(account)
    mockedAccountStorage.getDisplayDataById.mockResolvedValueOnce(displayData)

    await expect(
      autoCheckinScheduler.getAccountDisplayData("disabled-account", {
        includeDisabled: true,
      }),
    ).resolves.toEqual(displayData as any)
    expect(mockedAccountStorage.getDisplayDataById).toHaveBeenCalledWith(
      "disabled-account",
    )
  })
})

describe("autoCheckinScheduler.pretriggerDailyOnUiOpen", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
    mockedBrowserApi.hasAlarmsAPI.mockReturnValue(true)
    mockedUserPreferences.getPreferences.mockResolvedValue({
      autoCheckin: {
        ...(DEFAULT_PREFERENCES as any).autoCheckin,
        globalEnabled: true,
        pretriggerDailyOnUiOpen: true,
      },
    })
  })

  it("starts today's daily run early when eligible", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-01-23T09:00:00"))

    alarmStore.autoCheckinDaily = {
      name: "autoCheckinDaily",
      scheduledTime: Date.now() + 60_000,
    }

    const today = (autoCheckinScheduler as any).getLocalDay(new Date())

    const runSpy = vi
      .spyOn(autoCheckinScheduler as any, "runCheckins")
      .mockImplementation(async ({ runType }: any) => {
        expect(runType).toBe(AUTO_CHECKIN_RUN_TYPE.DAILY)
        await autoCheckinStorage.saveStatus({
          ...(storedStatus ?? {}),
          lastDailyRunDay: today,
          lastRunResult: "success",
          summary: {
            totalEligible: 2,
            executed: 1,
            successCount: 1,
            failedCount: 0,
            skippedCount: 1,
            needsRetry: false,
          },
          pendingRetry: false,
        } as any)
      })

    const result = await autoCheckinScheduler.pretriggerDailyOnUiOpen({
      requestId: "req-1",
    })

    expect(result.started).toBe(true)
    expect(result.eligible).toBe(true)
    expect(runSpy).toHaveBeenCalled()
    expect(result.summary).toEqual(
      expect.objectContaining({
        totalEligible: 2,
        executed: 1,
        successCount: 1,
        failedCount: 0,
        skippedCount: 1,
      }),
    )

    vi.useRealTimers()
  })

  it("still starts when the pretrigger notification broadcast fails and recalculates summary from per-account results", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-01-23T09:00:00"))

    alarmStore.autoCheckinDaily = {
      name: "autoCheckinDaily",
      scheduledTime: Date.now() + 60_000,
    }

    mockedBrowserApi.sendRuntimeMessage.mockRejectedValueOnce(
      new Error("popup closed"),
    )

    vi.spyOn(autoCheckinScheduler as any, "runCheckins").mockImplementation(
      async () => {
        await autoCheckinStorage.saveStatus({
          ...(storedStatus ?? {}),
          lastDailyRunDay: "2026-01-23",
          lastRunResult: "failed",
          perAccount: {
            a: { status: "success" },
            b: { status: "failed" },
            c: { status: "skipped" },
          },
          summary: undefined,
          pendingRetry: true,
        } as any)
      },
    )

    const result = await autoCheckinScheduler.pretriggerDailyOnUiOpen({
      requestId: "req-notify-fails",
    })

    expect(result).toMatchObject({
      started: true,
      eligible: true,
      lastRunResult: "failed",
      summary: {
        totalEligible: 3,
        executed: 2,
        successCount: 1,
        failedCount: 1,
        skippedCount: 1,
        needsRetry: true,
      },
    })
    expect(mockedBrowserApi.sendRuntimeMessage).toHaveBeenCalledWith(
      {
        action: RuntimeActionIds.AutoCheckinPretriggerStarted,
        requestId: "req-notify-fails",
      },
      { maxAttempts: 1 },
    )

    vi.useRealTimers()
  })

  it("does not start when current time is outside the window", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-01-23T11:00:00"))

    alarmStore.autoCheckinDaily = {
      name: "autoCheckinDaily",
      scheduledTime: Date.now() + 60_000,
    }

    const runSpy = vi.spyOn(autoCheckinScheduler as any, "runCheckins")

    const result = await autoCheckinScheduler.pretriggerDailyOnUiOpen({
      requestId: "req-2",
    })

    expect(result.started).toBe(false)
    expect(result.eligible).toBe(false)
    expect(result.ineligibleReason).toBe("outside_time_window")
    expect(runSpy).not.toHaveBeenCalled()

    vi.useRealTimers()
  })

  it("returns eligible=true but does not start in dryRun mode", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-01-23T09:00:00"))

    alarmStore.autoCheckinDaily = {
      name: "autoCheckinDaily",
      scheduledTime: Date.now() + 60_000,
    }

    const runSpy = vi.spyOn(autoCheckinScheduler as any, "runCheckins")

    const result = await autoCheckinScheduler.pretriggerDailyOnUiOpen({
      dryRun: true,
      debug: true,
    })

    expect(result.started).toBe(false)
    expect(result.eligible).toBe(true)
    expect(runSpy).not.toHaveBeenCalled()
    expect(result.debug).toEqual(
      expect.objectContaining({
        today: expect.any(String),
        isWithinWindow: true,
        dailyAlarmScheduledTime: expect.any(Number),
      }),
    )

    vi.useRealTimers()
  })

  it("does not start when today's daily run already executed", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-01-23T09:00:00"))

    const today = (autoCheckinScheduler as any).getLocalDay(new Date())
    storedStatus = { lastDailyRunDay: today }

    alarmStore.autoCheckinDaily = {
      name: "autoCheckinDaily",
      scheduledTime: Date.now() + 60_000,
    }

    const runSpy = vi.spyOn(autoCheckinScheduler as any, "runCheckins")

    const result = await autoCheckinScheduler.pretriggerDailyOnUiOpen({
      requestId: "req-3",
    })

    expect(result.started).toBe(false)
    expect(result.eligible).toBe(false)
    expect(result.ineligibleReason).toBe("already_ran_today")
    expect(runSpy).not.toHaveBeenCalled()

    vi.useRealTimers()
  })

  it("does not start when today's daily run is already in flight", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-01-23T09:00:00"))

    const today = (autoCheckinScheduler as any).getLocalDay(new Date())
    ;(autoCheckinScheduler as any).dailyRunInFlightDay = today
    ;(autoCheckinScheduler as any).dailyRunInFlightPromise = new Promise(
      () => {},
    )

    alarmStore.autoCheckinDaily = {
      name: "autoCheckinDaily",
      scheduledTime: Date.now() + 60_000,
    }

    const runSpy = vi.spyOn(autoCheckinScheduler as any, "runCheckins")

    const result = await autoCheckinScheduler.pretriggerDailyOnUiOpen({
      debug: true,
    })

    expect(result).toMatchObject({
      started: false,
      eligible: false,
      ineligibleReason: "daily_run_in_flight",
      debug: expect.objectContaining({
        dailyRunInFlightDay: today,
      }),
    })
    expect(runSpy).not.toHaveBeenCalled()
    ;(autoCheckinScheduler as any).dailyRunInFlightDay = null
    ;(autoCheckinScheduler as any).dailyRunInFlightPromise = null
    vi.useRealTimers()
  })

  it("returns alarms_api_unavailable when the alarms API cannot be used", async () => {
    mockedBrowserApi.hasAlarmsAPI.mockReturnValue(false)

    const result = await autoCheckinScheduler.pretriggerDailyOnUiOpen({
      debug: true,
    })

    expect(result.started).toBe(false)
    expect(result.eligible).toBe(false)
    expect(result.ineligibleReason).toBe("alarms_api_unavailable")
    expect(mockedUserPreferences.getPreferences).not.toHaveBeenCalled()
  })

  it("returns global_disabled and pretrigger_disabled for the corresponding config gates", async () => {
    mockedUserPreferences.getPreferences.mockResolvedValueOnce({
      autoCheckin: {
        ...(DEFAULT_PREFERENCES as any).autoCheckin,
        globalEnabled: false,
        pretriggerDailyOnUiOpen: true,
      },
    })

    await expect(
      autoCheckinScheduler.pretriggerDailyOnUiOpen({ debug: true }),
    ).resolves.toMatchObject({
      started: false,
      eligible: false,
      ineligibleReason: "global_disabled",
      debug: expect.objectContaining({
        windowStart: (DEFAULT_PREFERENCES as any).autoCheckin.windowStart,
        windowEnd: (DEFAULT_PREFERENCES as any).autoCheckin.windowEnd,
      }),
    })

    mockedUserPreferences.getPreferences.mockResolvedValueOnce({
      autoCheckin: {
        ...(DEFAULT_PREFERENCES as any).autoCheckin,
        globalEnabled: true,
        pretriggerDailyOnUiOpen: false,
      },
    })

    await expect(
      autoCheckinScheduler.pretriggerDailyOnUiOpen({ debug: true }),
    ).resolves.toMatchObject({
      started: false,
      eligible: false,
      ineligibleReason: "pretrigger_disabled",
    })
  })

  it("returns invalid_time_window when the configured time strings cannot be parsed", async () => {
    mockedUserPreferences.getPreferences.mockResolvedValueOnce({
      autoCheckin: {
        ...(DEFAULT_PREFERENCES as any).autoCheckin,
        globalEnabled: true,
        pretriggerDailyOnUiOpen: true,
        windowStart: "08:xx",
        windowEnd: "10:00",
      },
    })

    const result = await autoCheckinScheduler.pretriggerDailyOnUiOpen({
      debug: true,
    })

    expect(result.started).toBe(false)
    expect(result.eligible).toBe(false)
    expect(result.ineligibleReason).toBe("invalid_time_window")
    expect(result.debug).toEqual(
      expect.objectContaining({
        windowStartMinutes: null,
        windowEndMinutes: 600,
      }),
    )
  })

  it("returns daily_alarm_missing when no daily alarm is scheduled", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-01-23T09:00:00"))

    const result = await autoCheckinScheduler.pretriggerDailyOnUiOpen({
      debug: true,
    })

    expect(result.started).toBe(false)
    expect(result.eligible).toBe(false)
    expect(result.ineligibleReason).toBe("daily_alarm_missing")
    expect(result.debug).toEqual(
      expect.objectContaining({
        dailyAlarmScheduledTime: null,
      }),
    )

    vi.useRealTimers()
  })

  it("returns daily_alarm_not_today when the stored alarm target day is stale", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-01-23T09:00:00"))

    alarmStore.autoCheckinDaily = {
      name: "autoCheckinDaily",
      scheduledTime: new Date("2026-01-23T09:30:00").getTime(),
    }
    storedStatus = {
      dailyAlarmTargetDay: "2026-01-22",
    }

    const result = await autoCheckinScheduler.pretriggerDailyOnUiOpen({
      debug: true,
    })

    expect(result.started).toBe(false)
    expect(result.eligible).toBe(false)
    expect(result.ineligibleReason).toBe("daily_alarm_not_today")
    expect(result.debug).toEqual(
      expect.objectContaining({
        scheduledTargetDay: "2026-01-23",
        storedTargetDay: "2026-01-22",
        targetDay: "2026-01-22",
      }),
    )

    vi.useRealTimers()
  })
})

describe("autoCheckinScheduler daily alarm helpers", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
  })

  it("ignores duplicate daily alarms while a run for today is already in flight", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-01-23T09:00:00"))
    ;(autoCheckinScheduler as any).dailyRunInFlightDay = "2026-01-23"
    ;(autoCheckinScheduler as any).dailyRunInFlightPromise =
      Promise.resolve(undefined)
    const runSpy = vi.spyOn(autoCheckinScheduler as any, "runCheckins")

    await expect(
      (autoCheckinScheduler as any).handleDailyAlarm({
        name: "autoCheckinDaily",
        scheduledTime: Date.now(),
      }),
    ).resolves.toBeUndefined()

    expect(runSpy).not.toHaveBeenCalled()
    ;(autoCheckinScheduler as any).dailyRunInFlightDay = null
    ;(autoCheckinScheduler as any).dailyRunInFlightPromise = null
    vi.useRealTimers()
  })

  it("treats stale daily alarms as no-ops and reschedules instead of running", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-01-23T09:00:00"))

    storedStatus = { dailyAlarmTargetDay: "2026-01-22" }
    const runSpy = vi.spyOn(autoCheckinScheduler as any, "runCheckins")
    const scheduleSpy = vi
      .spyOn(autoCheckinScheduler as any, "scheduleNextRun")
      .mockResolvedValueOnce(undefined)

    await expect(
      (autoCheckinScheduler as any).handleDailyAlarm({
        name: "autoCheckinDaily",
        scheduledTime: Date.now(),
      }),
    ).resolves.toBeUndefined()

    expect(runSpy).not.toHaveBeenCalled()
    expect(scheduleSpy).toHaveBeenCalledTimes(1)
    expect((autoCheckinScheduler as any).dailyRunInFlightDay).toBeNull()
    expect((autoCheckinScheduler as any).dailyRunInFlightPromise).toBeNull()

    vi.useRealTimers()
  })

  it("treats stale daily alarms as no-ops when only the alarm scheduledTime reveals a past day", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 0, 23, 9, 0, 0))

    storedStatus = {
      pendingRetry: false,
    } as any
    const runSpy = vi.spyOn(autoCheckinScheduler as any, "runCheckins")
    const scheduleSpy = vi
      .spyOn(autoCheckinScheduler as any, "scheduleNextRun")
      .mockResolvedValueOnce(undefined)

    await expect(
      (autoCheckinScheduler as any).handleDailyAlarm({
        name: "autoCheckinDaily",
        scheduledTime: new Date(2026, 0, 22, 23, 30, 0).getTime(),
      }),
    ).resolves.toBeUndefined()

    expect(runSpy).not.toHaveBeenCalled()
    expect(scheduleSpy).toHaveBeenCalledTimes(1)
    expect((autoCheckinScheduler as any).dailyRunInFlightDay).toBeNull()
    expect((autoCheckinScheduler as any).dailyRunInFlightPromise).toBeNull()

    vi.useRealTimers()
  })

  it("reschedules retry alarms even when retry execution throws", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-01-23T09:00:00"))

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

    const runRetrySpy = vi
      .spyOn(autoCheckinScheduler as any, "runRetryCheckins")
      .mockRejectedValueOnce(new Error("retry exploded"))
    const scheduleRetrySpy = vi
      .spyOn(autoCheckinScheduler as any, "scheduleRetryAlarm")
      .mockResolvedValueOnce(undefined)

    await expect(
      (autoCheckinScheduler as any).handleRetryAlarm({
        name: "autoCheckinRetry",
        scheduledTime: Date.now(),
      }),
    ).resolves.toBeUndefined()

    expect(runRetrySpy).toHaveBeenCalledTimes(1)
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

  it("clears stale retry alarms when only the alarm scheduledTime reveals a past day", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2024, 0, 2, 9, 0, 0))

    storedStatus = {
      retryState: {
        day: "2024-01-01",
        pendingAccountIds: ["a"],
        attemptsByAccount: {
          a: 1,
        },
      },
      pendingRetry: true,
      nextRetryScheduledAt: new Date(2024, 0, 1, 23, 30, 0).toISOString(),
    } as any

    const runRetrySpy = vi.spyOn(
      autoCheckinScheduler as any,
      "runRetryCheckins",
    )

    await expect(
      (autoCheckinScheduler as any).handleRetryAlarm({
        name: "autoCheckinRetry",
        scheduledTime: new Date(2024, 0, 1, 23, 30, 0).getTime(),
      }),
    ).resolves.toBeUndefined()

    expect(runRetrySpy).not.toHaveBeenCalled()
    expect(storedStatus.retryState).toBeUndefined()
    expect(storedStatus.pendingRetry).toBe(false)
    expect(storedStatus.nextRetryScheduledAt).toBeUndefined()

    vi.useRealTimers()
  })

  it("restores a same-day daily alarm when the browser schedules it for tomorrow", async () => {
    vi.useFakeTimers()
    const now = new Date(2026, 0, 23, 23, 58, 0, 0)
    vi.setSystemTime(now)

    const endOfToday = new Date(now)
    endOfToday.setHours(23, 59, 59, 999)
    const tomorrow = new Date(2026, 0, 24, 8, 0, 0, 0)
    let getAlarmCall = 0

    mockedBrowserApi.getAlarm.mockImplementation(async () => {
      getAlarmCall += 1
      return {
        scheduledTime:
          getAlarmCall === 1 ? tomorrow.getTime() : endOfToday.getTime(),
      }
    })

    const scheduled = await (
      autoCheckinScheduler as any
    ).createDailyAlarmForToday(tomorrow.getTime())

    expect(mockedBrowserApi.createAlarm).toHaveBeenNthCalledWith(
      1,
      "autoCheckinDaily",
      {
        when: endOfToday.getTime(),
      },
    )
    expect(mockedBrowserApi.createAlarm).toHaveBeenNthCalledWith(
      2,
      "autoCheckinDaily",
      {
        when: endOfToday.getTime(),
      },
    )
    expect(scheduled.toISOString()).toBe(endOfToday.toISOString())

    vi.useRealTimers()
  })

  it("throws when createDailyAlarmForToday cannot schedule a same-day alarm", async () => {
    vi.useFakeTimers()
    const now = new Date(2026, 0, 23, 23, 59, 59, 999)
    vi.setSystemTime(now)

    await expect(
      (autoCheckinScheduler as any).createDailyAlarmForToday(now.getTime()),
    ).rejects.toThrow("Cannot schedule daily alarm for today")

    vi.useRealTimers()
  })
})

describe("autoCheckinScheduler debug helpers", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
    mockedBrowserApi.hasAlarmsAPI.mockReturnValue(true)
  })

  it("delegates debugTriggerDailyAlarmNow to the daily alarm handler", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-01-23T09:00:00"))

    const handleDailyAlarmSpy = vi
      .spyOn(autoCheckinScheduler as any, "handleDailyAlarm")
      .mockResolvedValue(undefined)

    await autoCheckinScheduler.debugTriggerDailyAlarmNow()

    expect(handleDailyAlarmSpy).toHaveBeenCalledWith({
      name: "autoCheckinDaily",
      scheduledTime: Date.now(),
    })

    vi.useRealTimers()
  })

  it("delegates debugTriggerRetryAlarmNow to the retry alarm handler", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-01-23T09:00:00"))

    const handleRetryAlarmSpy = vi
      .spyOn(autoCheckinScheduler as any, "handleRetryAlarm")
      .mockResolvedValue(undefined)

    await autoCheckinScheduler.debugTriggerRetryAlarmNow()

    expect(handleRetryAlarmSpy).toHaveBeenCalledWith({
      name: "autoCheckinRetry",
      scheduledTime: Date.now(),
    })

    vi.useRealTimers()
  })

  it("does not rewrite status when debugResetLastDailyRunDay has nothing to clear", async () => {
    storedStatus = {
      pendingRetry: true,
      retryState: {
        day: "2026-01-23",
        pendingAccountIds: ["a"],
        attemptsByAccount: { a: 1 },
      },
    }

    await autoCheckinScheduler.debugResetLastDailyRunDay()

    expect(mockedAutoCheckinStorage.saveStatus).not.toHaveBeenCalled()
    expect(storedStatus).toEqual({
      pendingRetry: true,
      retryState: {
        day: "2026-01-23",
        pendingAccountIds: ["a"],
        attemptsByAccount: { a: 1 },
      },
    })
  })

  it("clears only lastDailyRunDay when debugResetLastDailyRunDay has an existing marker", async () => {
    storedStatus = {
      lastDailyRunDay: "2026-01-23",
      pendingRetry: true,
      retryState: {
        day: "2026-01-23",
        pendingAccountIds: ["a"],
        attemptsByAccount: { a: 1 },
      },
    }

    await autoCheckinScheduler.debugResetLastDailyRunDay()

    expect(mockedAutoCheckinStorage.saveStatus).toHaveBeenCalledWith({
      pendingRetry: true,
      retryState: {
        day: "2026-01-23",
        pendingAccountIds: ["a"],
        attemptsByAccount: { a: 1 },
      },
    })
    expect(storedStatus).toEqual({
      pendingRetry: true,
      retryState: {
        day: "2026-01-23",
        pendingAccountIds: ["a"],
        attemptsByAccount: { a: 1 },
      },
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    ;(autoCheckinScheduler as any).isInitialized = false
  })

  afterEach(() => {
    vi.restoreAllMocks()
    ;(autoCheckinScheduler as any).isInitialized = false
  })

  it("clamps debugScheduleDailyAlarmForToday to at least one minute and persists today's target day", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-01-23T09:00:00"))

    storedStatus = {
      lastRunResult: "success",
    }

    const scheduledAt =
      await autoCheckinScheduler.debugScheduleDailyAlarmForToday({
        minutesFromNow: 0,
      })

    expect(scheduledAt).toBe(Date.now() + 60_000)
    expect(alarmStore.autoCheckinDaily?.scheduledTime).toBe(scheduledAt)
    expect(storedStatus.nextDailyScheduledAt).toBe(
      new Date(scheduledAt).toISOString(),
    )
    expect(storedStatus.dailyAlarmTargetDay).toBe("2026-01-23")
    expect(storedStatus.nextScheduledAt).toBe(
      new Date(scheduledAt).toISOString(),
    )

    vi.useRealTimers()
  })

  it("rejects debugScheduleDailyAlarmForToday when the alarms API is unavailable", async () => {
    mockedBrowserApi.hasAlarmsAPI.mockReturnValue(false)

    await expect(
      autoCheckinScheduler.debugScheduleDailyAlarmForToday(),
    ).rejects.toThrow("[AutoCheckin] Alarms API not available")
  })
})

describe("autoCheckinScheduler private helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("refreshes unique accounts in batches and preserves an explicit force flag", async () => {
    mockedAccountStorage.refreshAccount
      .mockResolvedValueOnce({ refreshed: true })
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(new Error("refresh failed"))

    await expect(
      (autoCheckinScheduler as any).refreshAccountsAfterSuccessfulCheckins({
        accountIds: ["a", "a", " ", "b", "c"],
        force: false,
      }),
    ).resolves.toBeUndefined()

    expect(mockedAccountStorage.refreshAccount).toHaveBeenCalledTimes(3)
    expect(mockedAccountStorage.refreshAccount).toHaveBeenNthCalledWith(
      1,
      "a",
      false,
    )
    expect(mockedAccountStorage.refreshAccount).toHaveBeenNthCalledWith(
      2,
      "b",
      false,
    )
    expect(mockedAccountStorage.refreshAccount).toHaveBeenNthCalledWith(
      3,
      "c",
      false,
    )
  })

  it("defaults post-checkin refreshes to force=true when no force flag is provided", async () => {
    mockedAccountStorage.refreshAccount.mockResolvedValueOnce({
      refreshed: false,
    })

    await expect(
      (autoCheckinScheduler as any).refreshAccountsAfterSuccessfulCheckins({
        accountIds: ["account-1"],
      }),
    ).resolves.toBeUndefined()

    expect(mockedAccountStorage.refreshAccount).toHaveBeenCalledWith(
      "account-1",
      true,
    )
  })

  it("returns early when there are no valid accounts to refresh", async () => {
    await expect(
      (autoCheckinScheduler as any).refreshAccountsAfterSuccessfulCheckins({
        accountIds: ["", "   "],
      }),
    ).resolves.toBeUndefined()

    expect(mockedAccountStorage.refreshAccount).not.toHaveBeenCalled()
  })

  it("parses time strings and rejects invalid hour or minute values", () => {
    expect((autoCheckinScheduler as any).parseTimeToMinutes("09:30")).toBe(570)
    expect((autoCheckinScheduler as any).parseTimeToMinutes("24:00")).toBeNull()
    expect((autoCheckinScheduler as any).parseTimeToMinutes("09:60")).toBeNull()
    expect((autoCheckinScheduler as any).parseTimeToMinutes("nope")).toBeNull()
  })

  it("handles same-day and overnight windows correctly", () => {
    expect(
      (autoCheckinScheduler as any).isMinutesWithinWindow(600, 600, 600),
    ).toBe(false)
    expect(
      (autoCheckinScheduler as any).isMinutesWithinWindow(570, 480, 600),
    ).toBe(true)
    expect(
      (autoCheckinScheduler as any).isMinutesWithinWindow(60, 1320, 120),
    ).toBe(true)
    expect(
      (autoCheckinScheduler as any).isMinutesWithinWindow(600, 1320, 120),
    ).toBe(false)
  })

  it("rejects deterministic or random trigger plans when configuration is invalid", () => {
    const day = new Date("2026-01-23T00:00:00")

    expect(
      (autoCheckinScheduler as any).calculateDeterministicTriggerForDay(
        {
          windowStart: "08:00",
          windowEnd: "09:00",
          deterministicTime: "10:00",
        },
        day,
      ),
    ).toBeNull()

    expect(
      (autoCheckinScheduler as any).calculateRandomTriggerForDay(
        "08:xx",
        "09:00",
        day,
      ),
    ).toBeNull()
  })

  it("returns no deterministic catch-up trigger when the local day is already over", () => {
    vi.useFakeTimers()
    const now = new Date(2026, 0, 23, 23, 59, 59, 999)
    vi.setSystemTime(now)

    expect(
      (autoCheckinScheduler as any).calculateDeterministicCatchUpTrigger(now),
    ).toBeNull()

    vi.useRealTimers()
  })

  it("uses the active overnight window after midnight instead of postponing to the next night", () => {
    const now = new Date(2026, 0, 24, 1, 0, 0, 0)
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0)

    const trigger = (autoCheckinScheduler as any).calculateRandomTrigger(
      "23:00",
      "02:00",
      now,
    )

    expect(trigger.toISOString()).toBe(now.toISOString())

    randomSpy.mockRestore()
  })

  it("reuses only valid daily alarms for the current schedule plan", () => {
    const triggerTime = new Date("2026-01-23T08:30:00")

    expect(
      (autoCheckinScheduler as any).isExistingDailyAlarmReusable(
        {
          scheduleMode: "random",
        },
        new Date("invalid"),
        null,
      ),
    ).toBe(false)

    expect(
      (autoCheckinScheduler as any).isExistingDailyAlarmReusable(
        {
          scheduleMode: "random",
        },
        new Date("2026-01-23T08:15:00"),
        {
          triggerTime,
          enforceTodayTarget: false,
        },
      ),
    ).toBe(true)

    expect(
      (autoCheckinScheduler as any).isExistingDailyAlarmReusable(
        {
          scheduleMode: "deterministic",
        },
        new Date("2026-01-22T08:15:00"),
        {
          triggerTime,
          enforceTodayTarget: true,
        },
      ),
    ).toBe(false)
  })

  it("updates snapshots only when the matching account result exists", () => {
    const originalSnapshots = [
      { accountId: "a", lastResult: undefined, label: "A" },
      { accountId: "b", lastResult: undefined, label: "B" },
    ] as any
    const result = {
      accountId: "b",
      status: "success",
    } as any

    expect(
      (autoCheckinScheduler as any).updateSnapshotWithResult(undefined, result),
    ).toBeUndefined()

    expect(
      (autoCheckinScheduler as any).updateSnapshotWithResult([], result),
    ).toEqual([])

    expect(
      (autoCheckinScheduler as any).updateSnapshotWithResult(
        originalSnapshots,
        { accountId: "missing", status: "failed" } as any,
      ),
    ).toBe(originalSnapshots)

    expect(
      (autoCheckinScheduler as any).updateSnapshotWithResult(
        originalSnapshots,
        result,
      ),
    ).toEqual([
      originalSnapshots[0],
      {
        ...originalSnapshots[1],
        lastResult: result,
      },
    ])
  })

  it("derives snapshot skip reasons from account state and provider availability", () => {
    mockedProviders.resolveAutoCheckinProvider.mockReturnValueOnce({
      canCheckIn: vi.fn(() => true),
    })

    expect(
      (autoCheckinScheduler as any).buildAccountSnapshot(
        {
          id: "base",
          disabled: false,
          site_type: "new-api",
          site_name: "Base",
          account_info: { username: "user" },
          checkIn: { enableDetection: true, autoCheckInEnabled: true },
        },
        "Base",
      ),
    ).toMatchObject({
      accountId: "base",
      skipReason: undefined,
      providerAvailable: true,
    })

    mockedProviders.resolveAutoCheckinProvider.mockReturnValueOnce(null)

    expect(
      (autoCheckinScheduler as any).buildAccountSnapshot(
        {
          id: "no-provider",
          disabled: false,
          site_type: "new-api",
          site_name: "No Provider",
          account_info: { username: "user" },
          checkIn: { enableDetection: true, autoCheckInEnabled: true },
        },
        "No Provider",
      ),
    ).toMatchObject({
      accountId: "no-provider",
      skipReason: "no_provider",
      providerAvailable: false,
    })

    mockedProviders.resolveAutoCheckinProvider.mockReturnValueOnce({
      canCheckIn: vi.fn(() => true),
    })

    expect(
      (autoCheckinScheduler as any).buildAccountSnapshot(
        {
          id: "manual",
          disabled: false,
          site_type: "new-api",
          site_name: "Manual",
          account_info: { username: "user" },
          checkIn: { enableDetection: false, autoCheckInEnabled: true },
        },
        "Manual",
      ),
    ).toMatchObject({
      accountId: "manual",
      skipReason: "detection_disabled",
    })

    mockedProviders.resolveAutoCheckinProvider.mockReturnValueOnce({
      canCheckIn: vi.fn(() => false),
    })

    expect(
      (autoCheckinScheduler as any).buildAccountSnapshot(
        {
          id: "provider-not-ready",
          disabled: false,
          site_type: "new-api",
          site_name: "Provider Not Ready",
          account_info: { username: "user" },
          checkIn: { enableDetection: true, autoCheckInEnabled: true },
        },
        "Provider Not Ready",
      ),
    ).toMatchObject({
      accountId: "provider-not-ready",
      skipReason: "provider_not_ready",
      providerAvailable: false,
    })

    mockedProviders.resolveAutoCheckinProvider.mockReturnValueOnce({
      canCheckIn: vi.fn(() => true),
    })

    expect(
      (autoCheckinScheduler as any).buildAccountSnapshot(
        {
          id: "auto-disabled",
          disabled: false,
          site_type: "new-api",
          site_name: "Auto Disabled",
          account_info: { username: "user" },
          checkIn: { enableDetection: true, autoCheckInEnabled: false },
        },
        "Auto Disabled",
      ),
    ).toMatchObject({
      accountId: "auto-disabled",
      skipReason: "auto_checkin_disabled",
    })
  })

  it("handles provider-missing, failed, and thrown account check-in outcomes", async () => {
    mockedProviders.resolveAutoCheckinProvider.mockReset()
    mockedProviders.resolveAutoCheckinProvider.mockReturnValueOnce(null)

    await expect(
      (autoCheckinScheduler as any).runAccountCheckin(
        {
          id: "missing-provider",
          site_name: "Missing Provider",
        },
        "Missing Provider",
      ),
    ).resolves.toMatchObject({
      successful: false,
      result: {
        accountId: "missing-provider",
        status: "failed",
        reasonCode: "no_provider",
      },
    })

    const failedProvider = {
      checkIn: vi.fn().mockResolvedValue({
        status: "failed",
        rawMessage: "provider failed",
      }),
    }
    mockedProviders.resolveAutoCheckinProvider.mockReturnValueOnce(
      failedProvider as any,
    )

    await expect(
      (autoCheckinScheduler as any).runAccountCheckin(
        {
          id: "provider-failed",
          site_name: "Provider Failed",
        },
        "Provider Failed",
      ),
    ).resolves.toMatchObject({
      successful: false,
      result: {
        accountId: "provider-failed",
        status: "failed",
        rawMessage: "provider failed",
      },
    })

    const throwingProvider = {
      checkIn: vi.fn().mockRejectedValue(new Error("provider exploded")),
    }
    mockedProviders.resolveAutoCheckinProvider.mockReturnValueOnce(
      throwingProvider as any,
    )

    await expect(
      (autoCheckinScheduler as any).runAccountCheckin(
        {
          id: "provider-threw",
          site_name: "Provider Threw",
        },
        "Provider Threw",
      ),
    ).resolves.toMatchObject({
      successful: false,
      result: {
        accountId: "provider-threw",
        status: "failed",
        rawMessage: expect.any(String),
      },
    })
    expect(throwingProvider.checkIn).toHaveBeenCalledTimes(1)
  })

  it("marks accounts checked in for successful and already-checked outcomes", async () => {
    const successProvider = {
      checkIn: vi.fn().mockResolvedValueOnce({
        status: "success",
        rawMessage: "ok",
      }),
    }
    mockedProviders.resolveAutoCheckinProvider.mockReturnValueOnce(
      successProvider as any,
    )

    await expect(
      (autoCheckinScheduler as any).runAccountCheckin(
        {
          id: "success-account",
          site_name: "Success Account",
        },
        "Success Account",
      ),
    ).resolves.toMatchObject({
      successful: true,
      result: {
        accountId: "success-account",
        status: "success",
      },
    })

    const alreadyCheckedProvider = {
      checkIn: vi.fn().mockResolvedValueOnce({
        status: "already_checked",
        rawMessage: "already done",
      }),
    }
    mockedProviders.resolveAutoCheckinProvider.mockReturnValueOnce(
      alreadyCheckedProvider as any,
    )

    await expect(
      (autoCheckinScheduler as any).runAccountCheckin(
        {
          id: "already-checked-account",
          site_name: "Already Checked",
        },
        "Already Checked",
      ),
    ).resolves.toMatchObject({
      successful: true,
      result: {
        accountId: "already-checked-account",
        status: "already_checked",
      },
    })

    expect(
      mockedAccountStorage.markAccountAsSiteCheckedIn,
    ).toHaveBeenNthCalledWith(1, "success-account")
    expect(
      mockedAccountStorage.markAccountAsSiteCheckedIn,
    ).toHaveBeenNthCalledWith(2, "already-checked-account")
  })

  it("keeps run-completed notifications best-effort for missing receivers and other errors", async () => {
    mockedBrowserApi.sendRuntimeMessage.mockRejectedValueOnce(
      new Error("receiver unavailable"),
    )
    mockedBrowserApi.isMessageReceiverUnavailableError.mockReturnValueOnce(true)

    await expect(
      (autoCheckinScheduler as any).notifyUiRunCompleted({
        runKind: AUTO_CHECKIN_RUN_TYPE.MANUAL,
        updatedAccountIds: ["a"],
        summary: {
          totalEligible: 1,
          executed: 1,
          successCount: 1,
          failedCount: 0,
          skippedCount: 0,
          needsRetry: false,
        },
      }),
    ).resolves.toBeUndefined()

    mockedBrowserApi.sendRuntimeMessage.mockRejectedValueOnce(
      new Error("unexpected failure"),
    )
    mockedBrowserApi.isMessageReceiverUnavailableError.mockReturnValueOnce(
      false,
    )

    await expect(
      (autoCheckinScheduler as any).notifyUiRunCompleted({
        runKind: AUTO_CHECKIN_RUN_TYPE.DAILY,
        updatedAccountIds: [],
      }),
    ).resolves.toBeUndefined()

    expect(mockedBrowserApi.sendRuntimeMessage).toHaveBeenCalledTimes(2)
  })

  it("recalculates summaries while preserving the previous eligible total when provided", () => {
    expect(
      (autoCheckinScheduler as any).recalculateSummaryFromResults(
        {
          a: { status: "success" },
          b: { status: "failed" },
          c: { status: "skipped" },
        },
        {
          totalEligible: 7,
        },
      ),
    ).toEqual({
      totalEligible: 7,
      executed: 2,
      successCount: 1,
      failedCount: 1,
      skippedCount: 1,
      needsRetry: true,
    })
  })
})
