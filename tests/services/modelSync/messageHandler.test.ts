import { beforeEach, describe, expect, it, vi } from "vitest"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import {
  handleManagedSiteModelSyncMessage,
  modelSyncScheduler,
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

describe("ManagedSiteModelSync message handling", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()

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

    const triggerAllResponse = vi.fn()
    await handleManagedSiteModelSyncMessage(
      { action: RuntimeActionIds.ModelSyncTriggerAll },
      triggerAllResponse,
    )
    expect(triggerAllResponse).toHaveBeenCalledWith({
      success: true,
      data: executionResult,
    })

    const triggerSelectedResponse = vi.fn()
    await handleManagedSiteModelSyncMessage(
      {
        action: RuntimeActionIds.ModelSyncTriggerSelected,
        channelIds: [1],
      },
      triggerSelectedResponse,
    )
    expect(triggerSelectedResponse).toHaveBeenCalledWith({
      success: true,
      data: executionResult,
    })

    const triggerFailedResponse = vi.fn()
    await handleManagedSiteModelSyncMessage(
      { action: RuntimeActionIds.ModelSyncTriggerFailedOnly },
      triggerFailedResponse,
    )
    expect(triggerFailedResponse).toHaveBeenCalledWith({
      success: true,
      data: failedOnlyResult,
    })

    const lastExecutionResponse = vi.fn()
    await handleManagedSiteModelSyncMessage(
      { action: RuntimeActionIds.ModelSyncGetLastExecution },
      lastExecutionResponse,
    )
    expect(lastExecutionResponse).toHaveBeenCalledWith({
      success: true,
      data: {
        items: [],
        statistics: { total: 0, successCount: 0, failureCount: 0 },
      },
    })

    const progressResponse = vi.fn()
    await handleManagedSiteModelSyncMessage(
      { action: RuntimeActionIds.ModelSyncGetProgress },
      progressResponse,
    )
    expect(progressResponse).toHaveBeenCalledWith({
      success: true,
      data: progress,
    })

    const updateSettingsResponse = vi.fn()
    await handleManagedSiteModelSyncMessage(
      {
        action: RuntimeActionIds.ModelSyncUpdateSettings,
        settings: { enableSync: false },
      },
      updateSettingsResponse,
    )
    expect(updateSettingsResponse).toHaveBeenCalledWith({ success: true })

    const preferencesResponse = vi.fn()
    await handleManagedSiteModelSyncMessage(
      { action: RuntimeActionIds.ModelSyncGetPreferences },
      preferencesResponse,
    )
    expect(preferencesResponse).toHaveBeenCalledWith({
      success: true,
      data: { enableSync: true, intervalMs: 60_000 },
    })

    const upstreamOptionsResponse = vi.fn()
    await handleManagedSiteModelSyncMessage(
      { action: RuntimeActionIds.ModelSyncGetChannelUpstreamModelOptions },
      upstreamOptionsResponse,
    )
    expect(upstreamOptionsResponse).toHaveBeenCalledWith({
      success: true,
      data: ["gpt-4o"],
    })

    const listChannelsResponse = vi.fn()
    await handleManagedSiteModelSyncMessage(
      { action: RuntimeActionIds.ModelSyncListChannels },
      listChannelsResponse,
    )
    expect(listChannelsResponse).toHaveBeenCalledWith({
      success: true,
      data: channels,
    })
  })

  it("returns next-run metadata when an alarm exists and reports unknown actions", async () => {
    const scheduledTime = Date.UTC(2026, 2, 28, 4, 0, 0)
    mockedBrowserApi.getAlarm.mockResolvedValue({
      name: "managedSiteModelSync",
      scheduledTime,
      periodInMinutes: 30,
    })

    const nextRunResponse = vi.fn()
    await handleManagedSiteModelSyncMessage(
      { action: RuntimeActionIds.ModelSyncGetNextRun },
      nextRunResponse,
    )

    expect(nextRunResponse).toHaveBeenCalledWith({
      success: true,
      data: {
        nextScheduledAt: new Date(scheduledTime).toISOString(),
        periodInMinutes: 30,
      },
    })

    const unknownResponse = vi.fn()
    await handleManagedSiteModelSyncMessage(
      { action: "unknown-action" },
      unknownResponse,
    )
    expect(unknownResponse).toHaveBeenCalledWith({
      success: false,
      error: "Unknown action",
    })
  })

  it("returns an error response when the scheduler throws", async () => {
    vi.spyOn(modelSyncScheduler, "executeSync").mockRejectedValue(
      new Error("scheduler exploded"),
    )

    const sendResponse = vi.fn()
    await handleManagedSiteModelSyncMessage(
      { action: RuntimeActionIds.ModelSyncTriggerAll },
      sendResponse,
    )

    expect(sendResponse).toHaveBeenCalledWith({
      success: false,
      error: "scheduler exploded",
    })
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
