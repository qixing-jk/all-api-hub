import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  getModelSyncChannelUpstreamModelOptions,
  getModelSyncLastExecution,
  getModelSyncNextRun,
  getModelSyncPreferences,
  getModelSyncProgress,
  listModelSyncChannels,
  modelSyncScheduler,
  setupManagedSiteModelSyncMessagingListeners,
  triggerAllModelSync,
  triggerFailedOnlyModelSync,
  triggerSelectedModelSync,
  updateModelSyncSettings,
} from "~/services/models/modelSync/scheduler"
import { managedSiteModelSyncStorage } from "~/services/models/modelSync/storage"
import {
  DEFAULT_PREFERENCES,
  userPreferences,
} from "~/services/preferences/userPreferences"
import {
  clearAlarm,
  getAlarm,
  hasAlarmsAPI,
  onAlarm,
} from "~/utils/browser/browserApi"

const modelSyncMessageHandlers = vi.hoisted(
  () =>
    new Map<
      string,
      (message: { data: Record<string, unknown> }) => Promise<unknown> | unknown
    >(),
)
const onModelSyncMessageMock = vi.hoisted(() => vi.fn())

vi.mock("~/services/models/modelSync/messaging", () => ({
  onModelSyncMessage: onModelSyncMessageMock.mockImplementation(
    (type, handler) => {
      modelSyncMessageHandlers.set(type, handler)
      return vi.fn()
    },
  ),
}))

vi.mock("~/services/preferences/userPreferences", () => ({
  DEFAULT_PREFERENCES: {
    managedSiteModelSync: {
      enabled: true,
      interval: 60_000,
      concurrency: 2,
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

vi.mock("~/services/models/modelSync/storage", () => ({
  managedSiteModelSyncStorage: {
    getLastExecution: vi.fn(),
    getPreferences: vi.fn(),
    getChannelUpstreamModelOptions: vi.fn(),
    saveLastExecution: vi.fn(),
    saveChannelUpstreamModelOptions: vi.fn(),
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
    onAlarm: vi.fn(),
    sendRuntimeMessage: vi.fn(),
  }
})

vi.mock("~/utils/i18n/core", () => ({
  t: vi.fn((key: string) =>
    key === "settings:messages.runtimeRequestFailed"
      ? "Runtime request failed"
      : key,
  ),
}))

const mockedUserPreferences = userPreferences as unknown as {
  getPreferences: ReturnType<typeof vi.fn>
  savePreferences: ReturnType<typeof vi.fn>
}
const mockedStorage = managedSiteModelSyncStorage as unknown as {
  getLastExecution: ReturnType<typeof vi.fn>
  getPreferences: ReturnType<typeof vi.fn>
  getChannelUpstreamModelOptions: ReturnType<typeof vi.fn>
}
const mockedBrowserApi = {
  clearAlarm: clearAlarm as unknown as ReturnType<typeof vi.fn>,
  getAlarm: getAlarm as unknown as ReturnType<typeof vi.fn>,
  hasAlarmsAPI: hasAlarmsAPI as unknown as ReturnType<typeof vi.fn>,
  onAlarm: onAlarm as unknown as ReturnType<typeof vi.fn>,
}

describe("ManagedSiteModelSync operation helpers", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
    ;(modelSyncScheduler as any).isInitialized = false
    ;(globalThis as any).__modelSyncMessagingCleanup = null

    mockedUserPreferences.getPreferences.mockResolvedValue({
      managedSiteModelSync: {
        ...(DEFAULT_PREFERENCES as any).managedSiteModelSync,
      },
    })
    mockedUserPreferences.savePreferences.mockResolvedValue(true)
    mockedStorage.getLastExecution.mockResolvedValue({
      items: [],
      statistics: { total: 0, successCount: 0, failureCount: 0 },
    })
    mockedStorage.getPreferences.mockResolvedValue({
      enableSync: true,
      intervalMs: 60_000,
    })
    mockedStorage.getChannelUpstreamModelOptions.mockResolvedValue(["gpt-4o"])
    mockedBrowserApi.hasAlarmsAPI.mockReturnValue(true)
    mockedBrowserApi.getAlarm.mockResolvedValue(undefined)
  })

  it("routes background actions through the scheduler and storage helpers", async () => {
    const executionResult = {
      items: [{ channelId: 1, channelName: "Alpha", ok: true }],
      statistics: { total: 1, successCount: 1, failureCount: 0 },
    }
    const failedOnlyResult = {
      items: [{ channelId: 2, channelName: "Beta", ok: false }],
      statistics: { total: 1, successCount: 0, failureCount: 1 },
    }
    const progress = {
      isRunning: true,
      total: 2,
      completed: 1,
      failed: 0,
    }
    const channels = {
      items: [{ id: 1, name: "Alpha" }],
      total: 1,
      type_counts: {},
    }

    vi.spyOn(modelSyncScheduler, "executeSync")
      .mockResolvedValueOnce(executionResult as any)
      .mockResolvedValueOnce(executionResult as any)
    vi.spyOn(modelSyncScheduler, "executeFailedOnly").mockResolvedValue(
      failedOnlyResult as any,
    )
    vi.spyOn(modelSyncScheduler, "getProgress").mockReturnValue(progress as any)
    vi.spyOn(modelSyncScheduler, "updateSettings").mockResolvedValue(undefined)
    vi.spyOn(modelSyncScheduler, "listChannels").mockResolvedValue(
      channels as any,
    )

    await expect(triggerAllModelSync()).resolves.toEqual({
      success: true,
      data: executionResult,
    })

    await expect(triggerSelectedModelSync([1])).resolves.toEqual({
      success: true,
      data: executionResult,
    })

    await expect(triggerFailedOnlyModelSync()).resolves.toEqual({
      success: true,
      data: failedOnlyResult,
    })

    await expect(getModelSyncLastExecution()).resolves.toEqual({
      success: true,
      data: {
        items: [],
        statistics: { total: 0, successCount: 0, failureCount: 0 },
      },
    })

    expect(getModelSyncProgress()).toEqual({
      success: true,
      data: progress,
    })

    await expect(
      updateModelSyncSettings({ enableSync: false }),
    ).resolves.toEqual({ success: true })

    await expect(getModelSyncPreferences()).resolves.toEqual({
      success: true,
      data: { enableSync: true, intervalMs: 60_000 },
    })

    await expect(getModelSyncChannelUpstreamModelOptions()).resolves.toEqual({
      success: true,
      data: ["gpt-4o"],
    })

    await expect(listModelSyncChannels()).resolves.toEqual({
      success: true,
      data: channels,
    })
  })

  it("rejects selected sync requests without channel ids", async () => {
    const executeSyncSpy = vi.spyOn(modelSyncScheduler, "executeSync")

    await expect(triggerSelectedModelSync()).resolves.toEqual({
      success: false,
      error: "channelIds must be a non-empty array for selected sync",
    })

    expect(executeSyncSpy).not.toHaveBeenCalled()
  })

  it("returns next-run metadata when an alarm exists", async () => {
    const scheduledTime = Date.UTC(2026, 2, 28, 4, 0, 0)
    mockedBrowserApi.getAlarm.mockResolvedValue({
      name: "managedSiteModelSync",
      scheduledTime,
      periodInMinutes: 30,
    })

    await expect(getModelSyncNextRun()).resolves.toEqual({
      success: true,
      data: {
        nextScheduledAt: new Date(scheduledTime).toISOString(),
        periodInMinutes: 30,
      },
    })
  })

  it("propagates scheduler errors to callers", async () => {
    vi.spyOn(modelSyncScheduler, "executeSync").mockRejectedValue(
      new Error("scheduler exploded"),
    )

    await expect(triggerAllModelSync()).rejects.toThrow("scheduler exploded")
  })

  it("returns listener error messages and falls back when they are empty", async () => {
    const executeSyncSpy = vi.spyOn(modelSyncScheduler, "executeSync")

    setupManagedSiteModelSyncMessagingListeners()
    const selectedHandler = modelSyncMessageHandlers.get(
      "modelSync:triggerSelected",
    )
    await expect(selectedHandler?.({ data: {} })).resolves.toEqual({
      success: false,
      error: "channelIds must be a non-empty array for selected sync",
    })
    expect(executeSyncSpy).not.toHaveBeenCalled()

    executeSyncSpy.mockRejectedValueOnce(
      new Error("upstream token secret leaked"),
    )
    const triggerAllHandler = modelSyncMessageHandlers.get(
      "modelSync:triggerAll",
    )

    await expect(triggerAllHandler?.({ data: {} })).resolves.toEqual({
      success: false,
      error: "upstream token secret leaked",
    })

    executeSyncSpy.mockRejectedValueOnce(new Error(""))

    await expect(triggerAllHandler?.({ data: {} })).resolves.toEqual({
      success: false,
      error: "Runtime request failed",
    })
  })

  it("wires typed model sync messages through registered listeners", async () => {
    const executionResult = {
      items: [{ channelId: 1, channelName: "Alpha", ok: true }],
      statistics: { total: 1, successCount: 1, failureCount: 0 },
    }
    const failedOnlyResult = {
      items: [{ channelId: 2, channelName: "Beta", ok: false }],
      statistics: { total: 1, successCount: 0, failureCount: 1 },
    }
    const progress = { isRunning: false, total: 1, completed: 1, failed: 0 }
    const channels = { items: [{ id: 1, name: "Alpha" }], total: 1 }
    vi.spyOn(modelSyncScheduler, "executeSync").mockResolvedValue(
      executionResult as any,
    )
    vi.spyOn(modelSyncScheduler, "executeFailedOnly").mockResolvedValue(
      failedOnlyResult as any,
    )
    vi.spyOn(modelSyncScheduler, "getProgress").mockReturnValue(progress as any)
    vi.spyOn(modelSyncScheduler, "updateSettings").mockResolvedValue(undefined)
    vi.spyOn(modelSyncScheduler, "listChannels").mockResolvedValue(
      channels as any,
    )

    setupManagedSiteModelSyncMessagingListeners()

    expect([...modelSyncMessageHandlers.keys()]).toEqual([
      "modelSync:getNextRun",
      "modelSync:triggerAll",
      "modelSync:triggerSelected",
      "modelSync:triggerFailedOnly",
      "modelSync:getLastExecution",
      "modelSync:getProgress",
      "modelSync:updateSettings",
      "modelSync:getPreferences",
      "modelSync:getChannelUpstreamModelOptions",
      "modelSync:listChannels",
    ])
    await expect(
      modelSyncMessageHandlers.get("modelSync:triggerSelected")?.({
        data: { channelIds: [1] },
      }),
    ).resolves.toEqual({ success: true, data: executionResult })
    await expect(
      modelSyncMessageHandlers.get("modelSync:triggerFailedOnly")?.({
        data: {},
      }),
    ).resolves.toEqual({ success: true, data: failedOnlyResult })
    await expect(
      modelSyncMessageHandlers.get("modelSync:getProgress")?.({ data: {} }),
    ).resolves.toEqual({ success: true, data: progress })
    await expect(
      modelSyncMessageHandlers.get("modelSync:updateSettings")?.({
        data: { settings: { enableSync: false } },
      }),
    ).resolves.toEqual({ success: true })
    await expect(
      modelSyncMessageHandlers.get("modelSync:listChannels")?.({ data: {} }),
    ).resolves.toEqual({ success: true, data: channels })
  })
})

describe("ManagedSiteModelSync.updateSettings and setupAlarm", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()

    mockedUserPreferences.getPreferences.mockResolvedValue({
      managedSiteModelSync: {
        ...(DEFAULT_PREFERENCES as any).managedSiteModelSync,
        enabled: true,
        interval: 60_000,
        concurrency: 2,
        maxRetries: 1,
        rateLimit: {
          requestsPerMinute: 10,
          burst: 2,
        },
        allowedModels: ["existing-model"],
        globalChannelModelFilters: [],
      },
    })
    mockedUserPreferences.savePreferences.mockResolvedValue(true)
    mockedBrowserApi.hasAlarmsAPI.mockReturnValue(true)
  })

  it("merges partial settings into the saved scheduler config", async () => {
    const setupAlarmSpy = vi
      .spyOn(modelSyncScheduler, "setupAlarm")
      .mockResolvedValue(undefined)

    await modelSyncScheduler.updateSettings({
      intervalMs: 120_000,
      rateLimit: { burst: 4 },
      allowedModels: ["gpt-4o"],
      globalChannelModelFilters: [
        {
          id: "filter-1",
          name: "Include GPT",
          pattern: "^gpt",
          isRegex: true,
          action: "include",
          enabled: true,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    })

    expect(mockedUserPreferences.savePreferences).toHaveBeenCalledWith({
      managedSiteModelSync: {
        enabled: true,
        interval: 120_000,
        concurrency: 2,
        maxRetries: 1,
        rateLimit: {
          requestsPerMinute: 10,
          burst: 4,
        },
        allowedModels: ["gpt-4o"],
        globalChannelModelFilters: [
          {
            id: "filter-1",
            kind: "pattern",
            name: "Include GPT",
            description: undefined,
            pattern: "^gpt",
            isRegex: true,
            action: "include",
            enabled: true,
            createdAt: 1,
            updatedAt: 1,
          },
        ],
      },
    })
    expect(setupAlarmSpy).toHaveBeenCalledTimes(1)
  })

  it("clears the alarm when sync is disabled in preferences", async () => {
    mockedUserPreferences.getPreferences.mockResolvedValue({
      managedSiteModelSync: {
        ...(DEFAULT_PREFERENCES as any).managedSiteModelSync,
        enabled: false,
      },
    })

    await modelSyncScheduler.setupAlarm()

    expect(mockedBrowserApi.clearAlarm).toHaveBeenCalledWith(
      "managedSiteModelSync",
    )
  })

  it("returns early when alarms are unsupported", async () => {
    mockedBrowserApi.hasAlarmsAPI.mockReturnValue(false)

    await modelSyncScheduler.setupAlarm()

    expect(mockedBrowserApi.clearAlarm).not.toHaveBeenCalled()
    expect(mockedBrowserApi.getAlarm).not.toHaveBeenCalled()
  })
})

describe("ManagedSiteModelSync scheduler lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(modelSyncScheduler as any).isInitialized = false
  })

  it("initializes once and skips alarm wiring when alarms are unsupported", async () => {
    mockedBrowserApi.hasAlarmsAPI.mockReturnValue(false)

    await modelSyncScheduler.initialize()
    await modelSyncScheduler.initialize()

    expect(mockedBrowserApi.onAlarm).not.toHaveBeenCalled()
  })

  it("rejects executeFailedOnly when there is no retryable execution history", async () => {
    mockedStorage.getLastExecution.mockResolvedValueOnce(null)

    await expect(modelSyncScheduler.executeFailedOnly()).rejects.toThrow(
      "No previous execution found",
    )

    mockedStorage.getLastExecution.mockResolvedValueOnce({
      items: [{ channelId: 1, channelName: "Alpha", ok: true }],
      statistics: { total: 1, successCount: 1, failureCount: 0 },
    })

    await expect(modelSyncScheduler.executeFailedOnly()).rejects.toThrow(
      "No failed channels to retry",
    )
  })
})
