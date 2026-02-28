import { beforeEach, describe, expect, it, vi } from "vitest"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import {
  handleManagedSiteModelSyncMessage,
  modelSyncScheduler,
} from "~/services/models/modelSync/scheduler"
import {
  DEFAULT_PREFERENCES,
  userPreferences,
} from "~/services/userPreferences"
import {
  clearAlarm,
  createAlarm,
  getAlarm,
  hasAlarmsAPI,
} from "~/utils/browserApi"

vi.mock("~/services/userPreferences", () => ({
  DEFAULT_PREFERENCES: {
    managedSiteModelSync: {
      enabled: true,
      interval: 60_000,
      concurrency: 1,
      maxRetries: 1,
      rateLimit: { requestsPerMinute: 10, burst: 2 },
      allowedModels: [],
      globalChannelModelFilters: [],
    },
  },
  userPreferences: {
    getPreferences: vi.fn(),
    savePreferences: vi.fn(),
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

const mockedUserPreferences = userPreferences as unknown as {
  getPreferences: ReturnType<typeof vi.fn>
}

const mockedBrowserApi = {
  clearAlarm: clearAlarm as unknown as ReturnType<typeof vi.fn>,
  createAlarm: createAlarm as unknown as ReturnType<typeof vi.fn>,
  getAlarm: getAlarm as unknown as ReturnType<typeof vi.fn>,
  hasAlarmsAPI: hasAlarmsAPI as unknown as ReturnType<typeof vi.fn>,
}

describe("modelSyncScheduler.setupAlarm", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedBrowserApi.hasAlarmsAPI.mockReturnValue(true)
    mockedBrowserApi.getAlarm.mockResolvedValue(undefined)
    mockedUserPreferences.getPreferences.mockResolvedValue({
      managedSiteModelSync: {
        ...(DEFAULT_PREFERENCES as any).managedSiteModelSync,
        enabled: true,
      },
    })
  })

  it("clears and recreates the canonical alarm when enabled and missing", async () => {
    mockedBrowserApi.getAlarm
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({
        name: "managedSiteModelSync",
        scheduledTime: Date.now() + 60_000,
        periodInMinutes: 1,
      })

    await modelSyncScheduler.setupAlarm()

    expect(mockedBrowserApi.clearAlarm).toHaveBeenCalledWith(
      "managedSiteModelSync",
    )
    expect(mockedBrowserApi.createAlarm).toHaveBeenCalled()
  })

  it("preserves an existing alarm when the interval matches", async () => {
    mockedBrowserApi.getAlarm.mockResolvedValue({
      name: "managedSiteModelSync",
      scheduledTime: Date.now() + 60_000,
      periodInMinutes: 1,
    })

    await modelSyncScheduler.setupAlarm()

    expect(mockedBrowserApi.clearAlarm).not.toHaveBeenCalled()
    expect(mockedBrowserApi.createAlarm).not.toHaveBeenCalled()
  })

  it("recreates the alarm when the interval changes", async () => {
    mockedBrowserApi.getAlarm
      .mockResolvedValueOnce({
        name: "managedSiteModelSync",
        scheduledTime: Date.now() + 60_000,
        periodInMinutes: 2,
      })
      .mockResolvedValueOnce({
        name: "managedSiteModelSync",
        scheduledTime: Date.now() + 60_000,
        periodInMinutes: 1,
      })

    await modelSyncScheduler.setupAlarm()

    expect(mockedBrowserApi.clearAlarm).toHaveBeenCalledWith(
      "managedSiteModelSync",
    )
    expect(mockedBrowserApi.createAlarm).toHaveBeenCalled()
  })
})

describe("handleManagedSiteModelSyncMessage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedBrowserApi.hasAlarmsAPI.mockReturnValue(true)
  })

  it("returns next scheduled time from the alarm", async () => {
    const scheduledTime = Date.now() + 60_000
    mockedBrowserApi.getAlarm.mockResolvedValue({
      name: "managedSiteModelSync",
      scheduledTime,
      periodInMinutes: 1,
    })

    const sendResponse = vi.fn()
    await handleManagedSiteModelSyncMessage(
      { action: RuntimeActionIds.ModelSyncGetNextRun },
      sendResponse,
    )

    expect(sendResponse).toHaveBeenCalledWith({
      success: true,
      data: {
        nextScheduledAt: new Date(scheduledTime).toISOString(),
        periodInMinutes: 1,
      },
    })
  })
})
