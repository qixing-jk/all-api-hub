import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  autoCheckinScheduler,
  handleAutoCheckinMessage,
} from "~/services/autoCheckin/scheduler"
import { autoCheckinStorage } from "~/services/autoCheckin/storage"
import {
  DEFAULT_PREFERENCES,
  userPreferences,
} from "~/services/userPreferences"
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
    updateAccount: vi.fn(),
    markAccountAsCheckedIn: vi.fn(),
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

vi.mock("~/utils/browserApi", () => ({
  clearAlarm: vi.fn(),
  createAlarm: vi.fn(),
  getAlarm: vi.fn(),
  hasAlarmsAPI: vi.fn(),
  onAlarm: vi.fn(),
}))

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

const mockedBrowserApi = {
  clearAlarm: clearAlarm as unknown as ReturnType<typeof vi.fn>,
  createAlarm: createAlarm as unknown as ReturnType<typeof vi.fn>,
  getAlarm: getAlarm as unknown as ReturnType<typeof vi.fn>,
  hasAlarmsAPI: hasAlarmsAPI as unknown as ReturnType<typeof vi.fn>,
  onAlarm: onAlarm as unknown as ReturnType<typeof vi.fn>,
}

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

  it("should clear alarm and clear nextScheduledAt when globalEnabled is false", async () => {
    mockedUserPreferences.getPreferences.mockResolvedValue({
      autoCheckin: {
        ...(DEFAULT_PREFERENCES as any).autoCheckin,
        globalEnabled: false,
      },
    })
    mockedAutoCheckinStorage.getStatus.mockResolvedValue({
      lastRunResult: "success",
      lastRunAt: "2024-01-01T00:00:00.000Z",
      perAccount: {},
      nextScheduledAt: "2024-01-02T00:00:00.000Z",
    } as any)

    await (autoCheckinScheduler as any).scheduleNextRun()

    expect(mockedBrowserApi.clearAlarm).toHaveBeenCalledWith("autoCheckin")
    expect(mockedAutoCheckinStorage.saveStatus).toHaveBeenCalledWith(
      expect.objectContaining({ nextScheduledAt: undefined }),
    )
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
      { action: "autoCheckin:runNow" },
      sendResponse,
    )

    expect(runSpy).toHaveBeenCalled()
    expect(sendResponse).toHaveBeenCalledWith({ success: true })
  })

  it("should return status on autoCheckin:getStatus", async () => {
    const status = { lastRunResult: "success" }
    mockedAutoCheckinStorage.getStatus.mockResolvedValue(status as any)
    const sendResponse = vi.fn()

    await handleAutoCheckinMessage(
      { action: "autoCheckin:getStatus" },
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
      { action: "autoCheckin:updateSettings", settings },
      sendResponse,
    )

    expect(updateSpy).toHaveBeenCalledWith(settings)
    expect(sendResponse).toHaveBeenCalledWith({ success: true })
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
      { action: "autoCheckin:runNow" },
      sendResponse,
    )

    expect(runSpy).toHaveBeenCalled()
    expect(sendResponse).toHaveBeenCalledWith({ success: false, error: "boom" })
  })
})
