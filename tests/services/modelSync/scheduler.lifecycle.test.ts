import { beforeEach, describe, expect, it, vi } from "vitest"

import { NEW_API, OCTOPUS } from "~/constants/siteType"
import { modelSyncScheduler } from "~/services/models/modelSync/scheduler"
import { DEFAULT_PREFERENCES } from "~/services/preferences/userPreferences"

const mocks = vi.hoisted(() => ({
  clearAlarm: vi.fn(),
  createAlarm: vi.fn(),
  getAlarm: vi.fn(),
  hasAlarmsAPI: vi.fn(),
  onAlarm: vi.fn(),
  sendRuntimeMessage: vi.fn(),
  getPreferences: vi.fn(),
  savePreferences: vi.fn(),
  getAllConfigs: vi.fn(),
  listChannels: vi.fn(),
  runBatch: vi.fn(),
  octopusListChannels: vi.fn(),
  runOctopusBatch: vi.fn(),
  saveLastExecution: vi.fn(),
  getLastExecution: vi.fn(),
  saveChannelUpstreamModelOptions: vi.fn(),
  getStoredPreferences: vi.fn(),
  getChannelUpstreamModelOptions: vi.fn(),
  collectModelsFromExecution: vi.fn(),
  generateModelMappingForChannel: vi.fn(),
  applyModelMappingToChannel: vi.fn(),
  octopusChannelToManagedSite: vi.fn(),
  notifyTaskResult: vi.fn(),
}))

vi.mock("~/utils/core/error", () => ({
  getErrorMessage: (error: unknown) =>
    error instanceof Error ? error.message : String(error),
}))

vi.mock("~/utils/browser/browserApi", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/utils/browser/browserApi")>()
  return {
    ...actual,
    clearAlarm: mocks.clearAlarm,
    createAlarm: mocks.createAlarm,
    getAlarm: mocks.getAlarm,
    hasAlarmsAPI: mocks.hasAlarmsAPI,
    onAlarm: mocks.onAlarm,
    sendRuntimeMessage: mocks.sendRuntimeMessage,
  }
})

vi.mock("~/services/preferences/userPreferences", () => ({
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
    getPreferences: mocks.getPreferences,
    savePreferences: mocks.savePreferences,
  },
}))

vi.mock("~/services/managedSites/channelConfigStorage", () => ({
  channelConfigStorage: {
    getAllConfigs: mocks.getAllConfigs,
  },
}))

vi.mock("~/services/models/modelSync/modelSyncService", () => {
  class ModelSyncServiceMock {
    listChannels = mocks.listChannels
    runBatch = mocks.runBatch
  }

  return {
    ModelSyncService: ModelSyncServiceMock,
  }
})

vi.mock("~/services/models/modelSync/storage", () => ({
  managedSiteModelSyncStorage: {
    saveLastExecution: mocks.saveLastExecution,
    getLastExecution: mocks.getLastExecution,
    saveChannelUpstreamModelOptions: mocks.saveChannelUpstreamModelOptions,
    getPreferences: mocks.getStoredPreferences,
    getChannelUpstreamModelOptions: mocks.getChannelUpstreamModelOptions,
  },
}))

vi.mock("~/services/models/modelSync/modelCollection", () => ({
  collectModelsFromExecution: mocks.collectModelsFromExecution,
}))

vi.mock("~/services/models/modelRedirect", () => ({
  ModelRedirectService: {
    generateModelMappingForChannel: mocks.generateModelMappingForChannel,
    applyModelMappingToChannel: mocks.applyModelMappingToChannel,
  },
}))

vi.mock("~/services/notifications/taskNotificationService", () => ({
  notifyTaskResult: mocks.notifyTaskResult,
}))

vi.mock("~/services/apiService/octopus", () => ({
  listChannels: mocks.octopusListChannels,
}))

vi.mock("~/services/models/modelSync/octopusModelSync", () => ({
  runOctopusBatch: mocks.runOctopusBatch,
}))

vi.mock("~/services/managedSites/providers/octopus", () => ({
  octopusChannelToManagedSite: mocks.octopusChannelToManagedSite,
}))

describe("modelSyncScheduler lifecycle and edge flows", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
    ;(modelSyncScheduler as any).isInitialized = false
    ;(modelSyncScheduler as any).currentProgress = null

    mocks.hasAlarmsAPI.mockReturnValue(true)
    mocks.onAlarm.mockReturnValue(undefined)
    mocks.getAllConfigs.mockResolvedValue({})
    mocks.saveLastExecution.mockResolvedValue(undefined)
    mocks.saveChannelUpstreamModelOptions.mockResolvedValue(undefined)
    mocks.getLastExecution.mockResolvedValue(null)
    mocks.collectModelsFromExecution.mockReturnValue([])
    mocks.generateModelMappingForChannel.mockReturnValue({})
    mocks.applyModelMappingToChannel.mockResolvedValue({
      updated: false,
      prunedCount: 0,
    })
    mocks.octopusChannelToManagedSite.mockImplementation((channel) => ({
      id: channel.id,
      name: `mapped-${channel.name}`,
    }))
    mocks.sendRuntimeMessage.mockResolvedValue(undefined)
    mocks.notifyTaskResult.mockResolvedValue(true)

    mocks.getPreferences.mockResolvedValue({
      managedSiteType: NEW_API,
      newApi: {
        baseUrl: "https://example.com",
        adminToken: "token",
        userId: "1",
      },
      managedSiteModelSync: {
        ...(DEFAULT_PREFERENCES as any).managedSiteModelSync,
      },
      modelRedirect: {
        enabled: true,
        standardModels: ["gpt-4o"],
        pruneMissingTargetsOnModelSync: false,
      },
    })
  })

  it("initializes once, ignores unrelated alarms, and swallows scheduled sync failures", async () => {
    let alarmHandler: ((alarm: { name: string }) => Promise<void>) | undefined
    mocks.onAlarm.mockImplementation((handler) => {
      alarmHandler = handler
    })

    const setupAlarmSpy = vi
      .spyOn(modelSyncScheduler, "setupAlarm")
      .mockResolvedValue(undefined)
    const executeSpy = vi
      .spyOn(modelSyncScheduler, "executeSync")
      .mockRejectedValue(new Error("scheduled sync failed"))

    await modelSyncScheduler.initialize()
    await modelSyncScheduler.initialize()

    expect(setupAlarmSpy).toHaveBeenCalledTimes(1)
    expect(mocks.onAlarm).toHaveBeenCalledTimes(1)

    await alarmHandler?.({ name: "other-alarm" })
    expect(executeSpy).not.toHaveBeenCalled()

    await alarmHandler?.({ name: "managedSiteModelSync" })
    expect(executeSpy).toHaveBeenCalledTimes(1)
    expect(mocks.notifyTaskResult).toHaveBeenCalledWith({
      task: "managedSiteModelSync",
      status: "failure",
      message: "scheduled sync failed",
    })
  })

  it("notifies scheduled sync success counts after the alarm handler runs", async () => {
    let alarmHandler: ((alarm: { name: string }) => Promise<void>) | undefined
    mocks.onAlarm.mockImplementation((handler) => {
      alarmHandler = handler
    })

    vi.spyOn(modelSyncScheduler, "setupAlarm").mockResolvedValue(undefined)
    vi.spyOn(modelSyncScheduler, "executeSync").mockResolvedValue({
      items: [],
      statistics: {
        total: 3,
        successCount: 2,
        failureCount: 1,
      },
    } as any)

    await modelSyncScheduler.initialize()
    await alarmHandler?.({ name: "managedSiteModelSync" })

    expect(mocks.notifyTaskResult).toHaveBeenCalledWith({
      task: "managedSiteModelSync",
      status: "partial_success",
      counts: {
        total: 3,
        success: 2,
        failed: 1,
      },
    })
  })

  it("lists Octopus channels through the Octopus adapter and validates config", async () => {
    mocks.getPreferences.mockResolvedValueOnce({
      managedSiteType: OCTOPUS,
      octopus: {
        baseUrl: "https://octopus.example.com",
        username: "admin",
        password: "secret",
      },
      managedSiteModelSync: {
        ...(DEFAULT_PREFERENCES as any).managedSiteModelSync,
      },
    })
    mocks.octopusListChannels.mockResolvedValue([
      { id: 1, name: "Alpha" },
      { id: 2, name: "Beta" },
    ])

    await expect(modelSyncScheduler.listChannels()).resolves.toEqual({
      items: [
        { id: 1, name: "mapped-Alpha" },
        { id: 2, name: "mapped-Beta" },
      ],
      total: 2,
      type_counts: {},
    })

    mocks.getPreferences.mockResolvedValueOnce({
      managedSiteType: OCTOPUS,
      octopus: {
        baseUrl: "https://octopus.example.com",
        username: "",
        password: "",
      },
      managedSiteModelSync: {
        ...(DEFAULT_PREFERENCES as any).managedSiteModelSync,
      },
    })

    await expect(modelSyncScheduler.listChannels()).rejects.toThrow()
  })

  it("lists channels through the shared model sync service for non-Octopus sites", async () => {
    mocks.listChannels.mockResolvedValueOnce({
      items: [{ id: 9, name: "Shared channel" }],
      total: 1,
      type_counts: { shared: 1 },
    })

    await expect(modelSyncScheduler.listChannels()).resolves.toEqual({
      items: [{ id: 9, name: "Shared channel" }],
      total: 1,
      type_counts: { shared: 1 },
    })

    expect(mocks.getAllConfigs).toHaveBeenCalledTimes(1)
    expect(mocks.listChannels).toHaveBeenCalledTimes(1)
  })

  it("swallows initialization failures raised while scheduling alarms", async () => {
    const setupAlarmSpy = vi
      .spyOn(modelSyncScheduler, "setupAlarm")
      .mockRejectedValueOnce(new Error("alarm setup failed"))

    await expect(modelSyncScheduler.initialize()).resolves.toBeUndefined()

    expect(setupAlarmSpy).toHaveBeenCalledTimes(1)
    expect((modelSyncScheduler as any).isInitialized).toBe(false)
  })

  it("continues new-api sync when redirect mapping fails and caches upstream models on full sync", async () => {
    const knownChannel = { id: 1, name: "Known channel" }

    mocks.listChannels.mockResolvedValue({
      items: [knownChannel],
      total: 1,
      type_counts: {},
    })
    mocks.collectModelsFromExecution.mockReturnValue(["gpt-4o", "claude-3"])
    mocks.applyModelMappingToChannel.mockRejectedValueOnce(
      new Error("mapping failed"),
    )
    mocks.runBatch.mockImplementation(async (_channels: any, options: any) => {
      const lastResult = {
        channelId: 1,
        channelName: "Known channel",
        ok: true,
        oldModels: ["gpt-4o"],
        newModels: ["gpt-4o", "claude-3"],
      }

      await options.onProgress?.({
        completed: 1,
        total: 1,
        lastResult,
      })

      return {
        items: [lastResult],
        statistics: {
          total: 1,
          successCount: 1,
          failureCount: 0,
        },
      }
    })

    await expect(modelSyncScheduler.executeSync()).resolves.toMatchObject({
      statistics: {
        total: 1,
        successCount: 1,
      },
    })

    expect(mocks.saveLastExecution).toHaveBeenCalledTimes(1)
    expect(mocks.saveChannelUpstreamModelOptions).toHaveBeenCalledWith([
      "gpt-4o",
      "claude-3",
    ])
    expect(mocks.applyModelMappingToChannel).toHaveBeenCalledTimes(1)
    expect(mocks.sendRuntimeMessage).toHaveBeenNthCalledWith(
      1,
      {
        type: "MANAGED_SITE_MODEL_SYNC_PROGRESS",
        payload: expect.objectContaining({
          isRunning: true,
          completed: 1,
          failed: 0,
          currentChannel: "Known channel",
        }),
      },
      { maxAttempts: 1 },
    )
    expect(mocks.sendRuntimeMessage).toHaveBeenLastCalledWith(
      {
        type: "MANAGED_SITE_MODEL_SYNC_PROGRESS",
        payload: null,
      },
      { maxAttempts: 1 },
    )
    expect(modelSyncScheduler.getProgress()).toBeNull()
  })

  it("tracks failed progress updates and skips redirect mapping when a channel sync fails", async () => {
    const failedResult = {
      channelId: 1,
      channelName: "Known channel",
      ok: false,
      error: "upstream rejected models",
    }

    mocks.listChannels.mockResolvedValue({
      items: [{ id: 1, name: "Known channel" }],
      total: 1,
      type_counts: {},
    })
    mocks.runBatch.mockImplementation(async (_channels: any, options: any) => {
      await options.onProgress?.({
        completed: 1,
        total: 1,
        lastResult: failedResult,
      })

      return {
        items: [failedResult],
        statistics: {
          total: 1,
          successCount: 0,
          failureCount: 1,
        },
      }
    })

    await expect(modelSyncScheduler.executeSync()).resolves.toMatchObject({
      statistics: {
        failureCount: 1,
      },
    })

    expect(mocks.applyModelMappingToChannel).not.toHaveBeenCalled()
    expect(mocks.sendRuntimeMessage).toHaveBeenNthCalledWith(
      1,
      {
        type: "MANAGED_SITE_MODEL_SYNC_PROGRESS",
        payload: expect.objectContaining({
          isRunning: true,
          completed: 1,
          failed: 1,
          currentChannel: "Known channel",
        }),
      },
      { maxAttempts: 1 },
    )
  })

  it("skips redirect application when a successful result cannot be matched back to a known channel", async () => {
    const missingChannelResult = {
      channelId: 404,
      channelName: "Unknown channel",
      ok: true,
      oldModels: ["gpt-4o"],
      newModels: ["gpt-4o-mini"],
    }

    mocks.listChannels.mockResolvedValue({
      items: [{ id: 1, name: "Known channel" }],
      total: 1,
      type_counts: {},
    })
    mocks.runBatch.mockImplementation(async (_channels: any, options: any) => {
      await options.onProgress?.({
        completed: 1,
        total: 1,
        lastResult: missingChannelResult,
      })

      return {
        items: [missingChannelResult],
        statistics: {
          total: 1,
          successCount: 1,
          failureCount: 0,
        },
      }
    })

    await expect(modelSyncScheduler.executeSync()).resolves.toMatchObject({
      statistics: {
        successCount: 1,
      },
    })

    expect(mocks.generateModelMappingForChannel).not.toHaveBeenCalled()
    expect(mocks.applyModelMappingToChannel).not.toHaveBeenCalled()
  })

  it("rejects selected sync requests when no channels match the requested ids", async () => {
    mocks.listChannels.mockResolvedValue({
      items: [{ id: 1, name: "Alpha" }],
      total: 1,
      type_counts: {},
    })

    await expect(modelSyncScheduler.executeSync([999])).rejects.toThrow()
  })

  it("delegates Octopus sync batches, tracks failures, and skips full-sync caching for selected ids", async () => {
    mocks.getPreferences.mockResolvedValueOnce({
      managedSiteType: OCTOPUS,
      octopus: {
        baseUrl: "https://octopus.example.com",
        username: "admin",
        password: "secret",
      },
      managedSiteModelSync: {
        ...(DEFAULT_PREFERENCES as any).managedSiteModelSync,
        concurrency: 2,
        maxRetries: 3,
      },
    })
    mocks.octopusListChannels.mockResolvedValue([
      { id: 1, name: "Alpha" },
      { id: 2, name: "Beta" },
    ])
    mocks.runOctopusBatch.mockImplementation(
      async (_config: any, channels: any[], options: any) => {
        expect(channels.map((channel) => channel.id)).toEqual([2])

        const lastResult = {
          channelId: 2,
          channelName: "mapped-Beta",
          ok: false,
        }

        await options.onProgress?.({
          completed: 1,
          total: 1,
          lastResult,
        })

        return {
          items: [lastResult],
          statistics: {
            total: 1,
            successCount: 0,
            failureCount: 1,
          },
        }
      },
    )

    await expect(modelSyncScheduler.executeSync([2])).resolves.toMatchObject({
      statistics: { failureCount: 1 },
    })

    expect(mocks.runOctopusBatch).toHaveBeenCalledTimes(1)
    expect(mocks.saveLastExecution).toHaveBeenCalledTimes(1)
    expect(mocks.saveChannelUpstreamModelOptions).not.toHaveBeenCalled()
    expect(mocks.sendRuntimeMessage).toHaveBeenNthCalledWith(
      1,
      {
        type: "MANAGED_SITE_MODEL_SYNC_PROGRESS",
        payload: expect.objectContaining({
          isRunning: true,
          completed: 1,
          failed: 1,
          currentChannel: "mapped-Beta",
        }),
      },
      { maxAttempts: 1 },
    )
  })

  it("caches collected upstream models for Octopus full syncs and rejects empty/full-invalid Octopus runs", async () => {
    mocks.getPreferences.mockResolvedValueOnce({
      managedSiteType: OCTOPUS,
      octopus: {
        baseUrl: "https://octopus.example.com",
        username: "admin",
        password: "secret",
      },
      managedSiteModelSync: {
        ...(DEFAULT_PREFERENCES as any).managedSiteModelSync,
        concurrency: 2,
        maxRetries: 3,
      },
    })
    mocks.octopusListChannels.mockResolvedValueOnce([{ id: 3, name: "Gamma" }])
    mocks.collectModelsFromExecution.mockReturnValueOnce(["gpt-4o", "claude-3"])
    mocks.runOctopusBatch.mockResolvedValueOnce({
      items: [{ channelId: 3, channelName: "mapped-Gamma", ok: true }],
      statistics: {
        total: 1,
        successCount: 1,
        failureCount: 0,
      },
    })

    await expect(modelSyncScheduler.executeSync()).resolves.toMatchObject({
      statistics: { successCount: 1 },
    })

    expect(mocks.saveChannelUpstreamModelOptions).toHaveBeenCalledWith([
      "gpt-4o",
      "claude-3",
    ])

    mocks.getPreferences.mockResolvedValueOnce({
      managedSiteType: OCTOPUS,
      octopus: {
        baseUrl: "",
        username: "",
        password: "",
      },
      managedSiteModelSync: {
        ...(DEFAULT_PREFERENCES as any).managedSiteModelSync,
      },
    })
    await expect(modelSyncScheduler.executeSync()).rejects.toThrow()

    mocks.getPreferences.mockResolvedValueOnce({
      managedSiteType: OCTOPUS,
      octopus: {
        baseUrl: "https://octopus.example.com",
        username: "admin",
        password: "secret",
      },
      managedSiteModelSync: {
        ...(DEFAULT_PREFERENCES as any).managedSiteModelSync,
      },
    })
    mocks.octopusListChannels.mockResolvedValueOnce([])

    await expect(modelSyncScheduler.executeSync()).rejects.toThrow()
  })

  it("retries only the failed channels from the previous execution", async () => {
    mocks.getLastExecution.mockResolvedValueOnce({
      items: [
        { channelId: 1, ok: false },
        { channelId: 2, ok: true },
        { channelId: 3, ok: false },
      ],
      statistics: {
        total: 3,
        successCount: 1,
        failureCount: 2,
      },
    })

    const executeSpy = vi
      .spyOn(modelSyncScheduler, "executeSync")
      .mockResolvedValue({ items: [], statistics: { total: 2 } } as any)

    await expect(modelSyncScheduler.executeFailedOnly()).resolves.toEqual({
      items: [],
      statistics: { total: 2 },
    })
    expect(executeSpy).toHaveBeenCalledWith([1, 3])
  })
})
