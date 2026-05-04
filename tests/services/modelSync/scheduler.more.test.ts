import { beforeEach, describe, expect, it, vi } from "vitest"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import { DEFAULT_PREFERENCES } from "~/services/preferences/userPreferences"

const mocks = vi.hoisted(() => ({
  clearAlarm: vi.fn(),
  createAlarm: vi.fn(),
  getAlarm: vi.fn(),
  hasAlarmsAPI: vi.fn(),
  onAlarm: vi.fn(),
  sendRuntimeMessage: vi.fn(),
  savePreferences: vi.fn(),
  getPreferences: vi.fn(),
  channelConfigGetAllConfigs: vi.fn(),
  listChannels: vi.fn(),
  runBatch: vi.fn(),
  octopusListChannels: vi.fn(),
  runOctopusBatch: vi.fn(),
  saveLastExecution: vi.fn(),
  getLastExecution: vi.fn(),
  getStoredPreferences: vi.fn(),
  getChannelUpstreamModelOptions: vi.fn(),
  saveChannelUpstreamModelOptions: vi.fn(),
  collectModelsFromExecution: vi.fn(),
  modelSyncServiceCtor: vi.fn(),
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
    getAllConfigs: mocks.channelConfigGetAllConfigs,
  },
}))

vi.mock("~/services/models/modelSync/modelSyncService", () => {
  class ModelSyncServiceMock {
    constructor(...args: unknown[]) {
      mocks.modelSyncServiceCtor(...args)
    }

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
    getPreferences: mocks.getStoredPreferences,
    getChannelUpstreamModelOptions: mocks.getChannelUpstreamModelOptions,
    saveChannelUpstreamModelOptions: mocks.saveChannelUpstreamModelOptions,
  },
}))

vi.mock("~/services/models/modelSync/modelCollection", () => ({
  collectModelsFromExecution: mocks.collectModelsFromExecution,
}))

vi.mock("~/services/apiService/octopus", () => ({
  listChannels: mocks.octopusListChannels,
}))

vi.mock("~/services/models/modelSync/octopusModelSync", () => ({
  runOctopusBatch: mocks.runOctopusBatch,
}))

describe("modelSyncScheduler additional scheduler flows", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.hasAlarmsAPI.mockReturnValue(true)
    mocks.getPreferences.mockResolvedValue({
      managedSiteType: "new-api",
      newApi: {
        baseUrl: "https://example.com",
        adminToken: "token",
        userId: "1",
      },
      managedSiteModelSync: {
        ...(DEFAULT_PREFERENCES as any).managedSiteModelSync,
      },
    })
    mocks.channelConfigGetAllConfigs.mockResolvedValue({})
    mocks.getStoredPreferences.mockResolvedValue({ enabled: true })
    mocks.getChannelUpstreamModelOptions.mockResolvedValue(["gpt-4o"])
    mocks.getLastExecution.mockResolvedValue({
      items: [],
      statistics: { total: 0, successCount: 0, failureCount: 0 },
    })
    mocks.listChannels.mockResolvedValue({
      items: [{ id: 1, name: "Channel 1" }],
      total: 1,
      type_counts: {},
    })
    mocks.runBatch.mockResolvedValue({
      items: [],
      statistics: {
        total: 1,
        successCount: 1,
        failureCount: 0,
      },
    })
    mocks.saveLastExecution.mockResolvedValue(undefined)
    mocks.collectModelsFromExecution.mockReturnValue([])
  })

  it("skips alarm setup when alarms are unavailable and clears alarm when sync is disabled", async () => {
    const { modelSyncScheduler } = await import(
      "~/services/models/modelSync/scheduler"
    )

    mocks.hasAlarmsAPI.mockReturnValue(false)
    await expect(modelSyncScheduler.setupAlarm()).resolves.toBeUndefined()
    expect(mocks.clearAlarm).not.toHaveBeenCalled()

    mocks.hasAlarmsAPI.mockReturnValue(true)
    mocks.getPreferences.mockResolvedValueOnce({
      managedSiteModelSync: {
        ...(DEFAULT_PREFERENCES as any).managedSiteModelSync,
        enabled: false,
      },
    })

    await modelSyncScheduler.setupAlarm()
    expect(mocks.clearAlarm).toHaveBeenCalledWith("managedSiteModelSync")
    expect(mocks.createAlarm).not.toHaveBeenCalled()
  })

  it("initializes only once even when called repeatedly", async () => {
    const { modelSyncScheduler } = await import(
      "~/services/models/modelSync/scheduler"
    )

    await modelSyncScheduler.initialize()
    await modelSyncScheduler.initialize()

    expect(mocks.onAlarm).toHaveBeenCalledTimes(1)
  })

  it("sanitizes stored global channel filters before constructing the service", async () => {
    mocks.getPreferences.mockResolvedValue({
      managedSiteType: "new-api",
      newApi: {
        baseUrl: "https://example.com",
        adminToken: "token",
        userId: "1",
      },
      managedSiteModelSync: {
        ...(DEFAULT_PREFERENCES as any).managedSiteModelSync,
        globalChannelModelFilters: [
          {
            kind: "probe",
            name: " Needs trim ",
            probeIds: ["text-generation", "unknown-probe"],
            apiKey: "sk-should-not-persist",
          },
        ],
      },
    })

    const { modelSyncScheduler } = await import(
      "~/services/models/modelSync/scheduler"
    )

    await modelSyncScheduler.listChannels()

    expect(mocks.modelSyncServiceCtor).toHaveBeenCalledWith(
      "https://example.com",
      "token",
      "1",
      {
        requestsPerMinute: 10,
        burst: 2,
      },
      [],
      {},
      [
        expect.objectContaining({
          kind: "probe",
          name: "Needs trim",
          probeIds: ["text-generation"],
        }),
      ],
      "new-api",
    )
  })
})

describe("handleManagedSiteModelSyncMessage additional actions", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.hasAlarmsAPI.mockReturnValue(true)
    mocks.getStoredPreferences.mockResolvedValue({ enabled: true })
    mocks.getChannelUpstreamModelOptions.mockResolvedValue(["gpt-4o"])
    mocks.getLastExecution.mockResolvedValue({
      items: [{ channelId: 1, ok: false }],
      statistics: { total: 1, successCount: 0, failureCount: 1 },
    })
  })

  it("routes execution, storage, and preference actions through the scheduler control plane", async () => {
    const { handleManagedSiteModelSyncMessage, modelSyncScheduler } =
      await import("~/services/models/modelSync/scheduler")

    const executeSyncSpy = vi
      .spyOn(modelSyncScheduler, "executeSync")
      .mockResolvedValue({ items: [], statistics: { total: 0 } } as any)
    const executeFailedOnlySpy = vi
      .spyOn(modelSyncScheduler, "executeFailedOnly")
      .mockResolvedValue({ items: [], statistics: { total: 0 } } as any)
    const getProgressSpy = vi
      .spyOn(modelSyncScheduler, "getProgress")
      .mockReturnValue({ isRunning: true } as any)
    const updateSettingsSpy = vi
      .spyOn(modelSyncScheduler, "updateSettings")
      .mockResolvedValue(undefined)
    const listChannelsSpy = vi
      .spyOn(modelSyncScheduler, "listChannels")
      .mockResolvedValue({
        items: [{ id: 1, name: "Channel 1" }],
        total: 1,
        type_counts: {},
      } as any)

    const cases = [
      {
        request: { action: RuntimeActionIds.ModelSyncTriggerAll },
        expected: {
          success: true,
          data: { items: [], statistics: { total: 0 } },
        },
      },
      {
        request: {
          action: RuntimeActionIds.ModelSyncTriggerSelected,
          channelIds: [1, 2],
        },
        expected: {
          success: true,
          data: { items: [], statistics: { total: 0 } },
        },
      },
      {
        request: { action: RuntimeActionIds.ModelSyncTriggerFailedOnly },
        expected: {
          success: true,
          data: { items: [], statistics: { total: 0 } },
        },
      },
      {
        request: { action: RuntimeActionIds.ModelSyncGetLastExecution },
        expected: {
          success: true,
          data: {
            items: [{ channelId: 1, ok: false }],
            statistics: { total: 1, successCount: 0, failureCount: 1 },
          },
        },
      },
      {
        request: { action: RuntimeActionIds.ModelSyncGetProgress },
        expected: { success: true, data: { isRunning: true } },
      },
      {
        request: {
          action: RuntimeActionIds.ModelSyncUpdateSettings,
          settings: { enableSync: false },
        },
        expected: { success: true },
      },
      {
        request: { action: RuntimeActionIds.ModelSyncGetPreferences },
        expected: { success: true, data: { enabled: true } },
      },
      {
        request: {
          action: RuntimeActionIds.ModelSyncGetChannelUpstreamModelOptions,
        },
        expected: { success: true, data: ["gpt-4o"] },
      },
      {
        request: { action: RuntimeActionIds.ModelSyncListChannels },
        expected: {
          success: true,
          data: {
            items: [{ id: 1, name: "Channel 1" }],
            total: 1,
            type_counts: {},
          },
        },
      },
      {
        request: { action: "modelSync:unknown" },
        expected: { success: false, error: "Unknown action" },
      },
    ]

    for (const { request, expected } of cases) {
      const sendResponse = vi.fn()
      await handleManagedSiteModelSyncMessage(request, sendResponse)
      expect(sendResponse).toHaveBeenCalledWith(expected)
    }

    expect(executeSyncSpy).toHaveBeenNthCalledWith(1)
    expect(executeSyncSpy).toHaveBeenNthCalledWith(2, [1, 2])
    expect(executeFailedOnlySpy).toHaveBeenCalledTimes(1)
    expect(getProgressSpy).toHaveBeenCalledTimes(1)
    expect(updateSettingsSpy).toHaveBeenCalledWith({ enableSync: false })
    expect(listChannelsSpy).toHaveBeenCalledTimes(1)
  })

  it("returns structured errors when a model-sync action throws", async () => {
    const { handleManagedSiteModelSyncMessage, modelSyncScheduler } =
      await import("~/services/models/modelSync/scheduler")

    vi.spyOn(modelSyncScheduler, "executeSync").mockRejectedValueOnce(
      new Error("sync boom"),
    )

    const sendResponse = vi.fn()
    await handleManagedSiteModelSyncMessage(
      { action: RuntimeActionIds.ModelSyncTriggerAll },
      sendResponse,
    )

    expect(sendResponse).toHaveBeenCalledWith({
      success: false,
      error: "sync boom",
    })
  })
})
