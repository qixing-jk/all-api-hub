import { beforeEach, describe, expect, it, vi } from "vitest"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import { accountStorage } from "~/services/accountStorage"
import { resolveAutoCheckinProvider } from "~/services/autoCheckin/providers"
import {
  autoCheckinScheduler,
  handleAutoCheckinMessage,
} from "~/services/autoCheckin/scheduler"
import { autoCheckinStorage } from "~/services/autoCheckin/storage"
import {
  DEFAULT_PREFERENCES,
  userPreferences,
} from "~/services/userPreferences"
import { AUTO_CHECKIN_RUN_TYPE } from "~/types/autoCheckin"
import {
  clearAlarm,
  createAlarm,
  getAlarm,
  hasAlarmsAPI,
  onAlarm,
} from "~/utils/browserApi"
import { getErrorMessage } from "~/utils/error"

vi.mock("~/services/userPreferences", () => ({
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

vi.mock("~/services/accountStorage", () => ({
  accountStorage: {
    getAllAccounts: vi.fn(),
    getEnabledAccounts: vi.fn(),
    updateAccount: vi.fn(),
    markAccountAsSiteCheckedIn: vi.fn(),
    refreshAccount: vi.fn(),
    getAccountById: vi.fn(),
    convertToDisplayData: vi.fn(),
  },
}))

vi.mock("~/services/autoCheckin/providers", () => ({
  resolveAutoCheckinProvider: vi.fn(),
}))

vi.mock("~/services/autoCheckin/storage", () => ({
  autoCheckinStorage: {
    getStatus: vi.fn(),
    saveStatus: vi.fn(),
  },
}))

vi.mock("~/utils/browserApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/utils/browserApi")>()
  return {
    ...actual,
    clearAlarm: vi.fn(),
    createAlarm: vi.fn(),
    getAlarm: vi.fn(),
    hasAlarmsAPI: vi.fn(),
    onAlarm: vi.fn(),
  }
})

vi.mock("~/utils/error", () => ({
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
  markAccountAsSiteCheckedIn: ReturnType<typeof vi.fn>
  refreshAccount: ReturnType<typeof vi.fn>
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
  onAlarm: onAlarm as unknown as ReturnType<typeof vi.fn>,
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
})

describe("autoCheckinScheduler.scheduleNextRun", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedBrowserApi.hasAlarmsAPI.mockReturnValue(true)
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
})

describe("autoCheckinScheduler targeting support", () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
    expect(provider.checkIn.mock.calls[0]?.[0]?.id).toBe("a")

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

    const sendMessageSpy = vi
      .spyOn(browser.runtime, "sendMessage")
      .mockImplementation(async () => {
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
    expect(sendMessageSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        action: RuntimeActionIds.AutoCheckinRunCompleted,
        runKind: "manual",
        updatedAccountIds: ["a"],
        timestamp: expect.any(Number),
      }),
    )
    expect(callOrder).toEqual(["refresh", "send"])

    vi.useRealTimers()
  })

  it("still emits autoCheckin:runCompleted when post-checkin refresh fails", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2024, 0, 1, 9, 0, 0))

    const callOrder: string[] = []

    const sendMessageSpy = vi
      .spyOn(browser.runtime, "sendMessage")
      .mockImplementation(async () => {
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
    expect(sendMessageSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        action: RuntimeActionIds.AutoCheckinRunCompleted,
        runKind: "manual",
        updatedAccountIds: ["a"],
        timestamp: expect.any(Number),
      }),
    )
    expect(callOrder).toEqual(["refresh", "send"])

    vi.useRealTimers()
  })

  it("does not emit autoCheckin:runCompleted when notifyUiOnCompletion is disabled", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2024, 0, 1, 9, 0, 0))

    const sendMessageSpy = vi
      .spyOn(browser.runtime, "sendMessage")
      .mockResolvedValue(undefined as any)

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
    expect(sendMessageSpy).not.toHaveBeenCalledWith(
      expect.objectContaining({
        action: RuntimeActionIds.AutoCheckinRunCompleted,
      }),
    )

    vi.useRealTimers()
  })
})

describe("handleAutoCheckinMessage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("should run checkins on autoCheckin:runNow", async () => {
    const runSpy = vi
      .spyOn(autoCheckinScheduler as any, "runCheckins")
      .mockResolvedValue(undefined)
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
      .mockResolvedValue(undefined)
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

  it("should return an error for invalid accountIds payload", async () => {
    const runSpy = vi
      .spyOn(autoCheckinScheduler as any, "runCheckins")
      .mockResolvedValue(undefined)
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

  it("should trigger daily alarm handler on autoCheckin:debugTriggerDailyAlarmNow", async () => {
    const debugSpy = vi
      .spyOn(autoCheckinScheduler as any, "debugTriggerDailyAlarmNow")
      .mockResolvedValue(undefined)
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
      .mockResolvedValue(undefined)
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

  it("should update settings on autoCheckin:updateSettings", async () => {
    const updateSpy = vi
      .spyOn(autoCheckinScheduler as any, "updateSettings")
      .mockResolvedValue(undefined)
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
      .mockResolvedValue(undefined)
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
      .mockResolvedValue(123)
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
      .mockRejectedValue(error)
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
})

describe("autoCheckinScheduler.retryAccount", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("skips disabled accounts with an explicit skip reason", async () => {
    mockedAccountStorage.getAccountById.mockResolvedValueOnce({
      id: "disabled-1",
      disabled: true,
      site_name: "Disabled",
      account_info: { username: "user" },
    })
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
})

describe("autoCheckinScheduler.pretriggerDailyOnUiOpen", () => {
  beforeEach(() => {
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
})
