import { beforeEach, describe, expect, it, vi } from "vitest"

import { DEFAULT_PREFERENCES } from "~/services/preferences/userPreferences"
import { PROTECTION_BYPASS_USER_COMMANDS } from "~/services/protectionBypass/contracts"
import { userCommandExecution } from "~~/tests/services/protectionBypass/fixtures"
import { modelResourceRef } from "~~/tests/test-utils/managedModelResource"

vi.mock("~/services/managedSites/legacyChannelConfigMigration", () => ({
  ensureLegacyChannelConfigMigrationReady: (...args: unknown[]) =>
    mocks.ensureMigration(...args),
}))

const mocks = vi.hoisted(() => ({
  ensureMigration: vi.fn(),
  setChannelConfigs: vi.fn(),
  clearAlarm: vi.fn(),
  createAlarm: vi.fn(),
  getAlarm: vi.fn(),
  hasAlarmsAPI: vi.fn(),
  onAlarm: vi.fn(),
  sendRuntimeMessage: vi.fn(),
  savePreferences: vi.fn(),
  getPreferences: vi.fn(),
  channelConfigGetConfigsForScope: vi.fn(),
  listChannels: vi.fn(),
  runBatch: vi.fn(),
  octopusListChannels: vi.fn(),
  octopusFetchGroups: vi.fn(),
  octopusFetchAvailableModels: vi.fn(),
  runOctopusBatch: vi.fn(),
  prepareOctopusBatch: vi.fn(),
  createOctopusModelSyncCapability: vi.fn(),
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
    getConfigsForScope: mocks.channelConfigGetConfigsForScope,
  },
}))

vi.mock("~/services/models/modelSync/modelSyncService", () => {
  class ModelSyncServiceMock {
    constructor(...args: unknown[]) {
      mocks.modelSyncServiceCtor(...args)
    }

    listChannels = mocks.listChannels
    runBatch = mocks.runBatch
    setChannelConfigs = mocks.setChannelConfigs
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
  fetchGroups: mocks.octopusFetchGroups,
  fetchAvailableModels: mocks.octopusFetchAvailableModels,
}))

vi.mock("~/services/apiAdapters/managedResources/octopusModelSync", () => ({
  createOctopusModelSyncCapability: mocks.createOctopusModelSyncCapability,
}))

describe("modelSyncScheduler additional scheduler flows", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mocks.ensureMigration.mockReset().mockResolvedValue(undefined)
    mocks.createOctopusModelSyncCapability.mockReturnValue({
      listChannels: mocks.octopusListChannels,
      prepareBatch: mocks.prepareOctopusBatch,
    })
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
    mocks.channelConfigGetConfigsForScope.mockResolvedValue({})
    mocks.getStoredPreferences.mockResolvedValue({ enabled: true })
    mocks.getChannelUpstreamModelOptions.mockResolvedValue(["gpt-4o"])
    mocks.getLastExecution.mockResolvedValue({
      items: [],
      statistics: { total: 0, successCount: 0, failureCount: 0 },
    })
    mocks.listChannels.mockResolvedValue({
      items: [{ ref: modelResourceRef(1), name: "Channel 1" }],
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

  it.each(["new-api", "Veloera", "octopus"] as const)(
    "retries migration for explicit %s sync while automatic sync respects backoff",
    async (siteType) => {
      const config = {
        baseUrl: "https://example.com",
        adminToken: "token",
        userId: "1",
      }
      mocks.getPreferences.mockResolvedValue({
        managedSiteType: siteType,
        newApi: config,
        veloera: config,
        octopus: {
          baseUrl: config.baseUrl,
          username: "admin",
          password: "password",
        },
        managedSiteModelSync: DEFAULT_PREFERENCES.managedSiteModelSync,
      })
      const ref = modelResourceRef(1, { siteType })
      const channel = { ref, name: "Selected" }
      mocks.listChannels.mockResolvedValue({ items: [channel], total: 1 })
      mocks.prepareOctopusBatch.mockResolvedValue({
        resources: [channel],
        run: mocks.runBatch,
      })
      mocks.ensureMigration.mockImplementation(async (options) => {
        if (!options?.bypassBackoff) {
          throw new Error(
            "Legacy channel config migration deferred: backoff-active",
          )
        }
      })
      const { modelSyncScheduler } = await import(
        "~/services/models/modelSync/scheduler"
      )
      await expect(modelSyncScheduler.executeSync([ref])).rejects.toThrow(
        "backoff-active",
      )
      expect(mocks.runBatch).not.toHaveBeenCalled()
      await expect(
        modelSyncScheduler.executeSync(
          [ref],
          undefined,
          userCommandExecution(
            PROTECTION_BYPASS_USER_COMMANDS.SyncManagedSiteModels,
          ),
        ),
      ).resolves.toMatchObject({ statistics: { successCount: 1 } })
      expect(mocks.runBatch).toHaveBeenCalledOnce()
      expect(mocks.ensureMigration).toHaveBeenLastCalledWith({
        bypassBackoff: true,
        resourceRefs: [
          {
            managedSiteType: siteType,
            scopeKey: ref.scopeKey,
            resourceId: ref.resourceId,
          },
        ],
      })

      mocks.runBatch.mockClear()
      mocks.ensureMigration.mockRejectedValue(
        new Error("Legacy channel config migration deferred: inventory-failed"),
      )
      await expect(
        modelSyncScheduler.executeSync(
          [ref],
          undefined,
          userCommandExecution(
            PROTECTION_BYPASS_USER_COMMANDS.SyncManagedSiteModels,
          ),
        ),
      ).rejects.toThrow("inventory-failed")
      expect(mocks.runBatch).not.toHaveBeenCalled()
    },
  )

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

  it("loads newly migrated filter rules before running the selected batch", async () => {
    const resourceRef = {
      managedSiteType: "new-api",
      scopeKey: "https://example.com",
      resourceId: "1",
    }
    const migratedConfigs = {
      "new-api:https%3A%2F%2Fexample.com:1": {
        resourceRef,
        channelId: 1,
        modelFilterSettings: { rules: [], updatedAt: 200 },
        createdAt: 100,
        updatedAt: 200,
      },
    }
    mocks.ensureMigration.mockImplementation(async () => {
      mocks.channelConfigGetConfigsForScope.mockResolvedValue(migratedConfigs)
    })
    const { modelSyncScheduler } = await import(
      "~/services/models/modelSync/scheduler"
    )
    await modelSyncScheduler.executeSync([modelResourceRef(1)])
    expect(mocks.setChannelConfigs).toHaveBeenCalledWith(migratedConfigs)
    expect(mocks.setChannelConfigs.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.runBatch.mock.invocationCallOrder[0],
    )
  })

  it("selects an opaque resource and keeps the captured deployment through service creation", async () => {
    const ref = modelResourceRef("provider/key:alpha")
    const selected = { ref, name: "Opaque" }
    mocks.listChannels.mockResolvedValue({
      items: [selected, { ref: modelResourceRef("other"), name: "Other" }],
      total: 2,
    })
    const capturedPreferences = await mocks.getPreferences()
    mocks.getPreferences
      .mockClear()
      .mockResolvedValueOnce(capturedPreferences)
      .mockResolvedValue({
        ...capturedPreferences,
        newApi: {
          ...capturedPreferences.newApi,
          baseUrl: "https://other.example",
        },
      })
    const { modelSyncScheduler } = await import(
      "~/services/models/modelSync/scheduler"
    )

    await modelSyncScheduler.executeSync([ref])

    expect(mocks.getPreferences).toHaveBeenCalledOnce()
    expect(mocks.modelSyncServiceCtor).toHaveBeenCalledWith(
      { siteType: "new-api", config: capturedPreferences.newApi },
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
    )
    expect(mocks.runBatch).toHaveBeenCalledWith([selected], expect.anything())
    expect(mocks.ensureMigration).toHaveBeenCalledWith({
      bypassBackoff: false,
      resourceRefs: [
        {
          managedSiteType: ref.siteType,
          scopeKey: ref.scopeKey,
          resourceId: ref.resourceId,
        },
      ],
    })
  })

  it.each([
    modelResourceRef(1, { scopeKey: "https://other.example" }),
    modelResourceRef(1, { siteType: "Veloera" }),
  ])(
    "rejects a same-ID selection from another target before provider access",
    async (foreignRef) => {
      const { modelSyncScheduler } = await import(
        "~/services/models/modelSync/scheduler"
      )
      await expect(
        modelSyncScheduler.executeSync([foreignRef]),
      ).rejects.toMatchObject({ failure: { code: "validation_failed" } })
      expect(mocks.listChannels).not.toHaveBeenCalled()
      expect(mocks.runBatch).not.toHaveBeenCalled()
    },
  )

  it.each([
    { resourceRef: null, legacyResourceId: "1", ok: false },
    {
      resourceRef: modelResourceRef(1, { scopeKey: "https://other.example" }),
      ok: false,
    },
  ])(
    "never binds unscoped or foreign failed history to the current channel",
    async (item) => {
      mocks.getLastExecution.mockResolvedValue({ items: [item] })
      const { modelSyncScheduler } = await import(
        "~/services/models/modelSync/scheduler"
      )

      await expect(modelSyncScheduler.executeFailedOnly()).rejects.toThrow()
      expect(mocks.listChannels).not.toHaveBeenCalled()
      expect(mocks.runBatch).not.toHaveBeenCalled()
    },
  )

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
      {
        siteType: "new-api",
        config: {
          baseUrl: "https://example.com",
          adminToken: "token",
          userId: "1",
        },
      },
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
      {
        version: 2,
        kind: "automatic",
        feature: "managed_site_model_sync",
        trigger: "background_recovery",
        surface: "background",
      },
    )
    const [, , , , sanitizedFilters] = mocks.modelSyncServiceCtor.mock.calls[0]
    expect(sanitizedFilters[0]).not.toHaveProperty("apiKey")
  })
})

describe("model sync operation helpers additional actions", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mocks.hasAlarmsAPI.mockReturnValue(true)
    mocks.getStoredPreferences.mockResolvedValue({ enabled: true })
    mocks.getChannelUpstreamModelOptions.mockResolvedValue(["gpt-4o"])
    mocks.getLastExecution.mockResolvedValue({
      items: [{ resourceRef: modelResourceRef(1), ok: false }],
      statistics: { total: 1, successCount: 0, failureCount: 1 },
    })
  })

  it("routes execution, storage, and preference actions through the scheduler control plane", async () => {
    const {
      getModelSyncChannelUpstreamModelOptions,
      getModelSyncLastExecution,
      getModelSyncPreferences,
      getModelSyncProgress,
      listModelSyncChannels,
      modelSyncScheduler,
      triggerAllModelSync,
      triggerFailedOnlyModelSync,
      triggerSelectedModelSync,
      updateModelSyncSettings,
    } = await import("~/services/models/modelSync/scheduler")

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
        items: [{ ref: modelResourceRef(1), name: "Channel 1" }],
        total: 1,
        type_counts: {},
      } as any)

    await expect(triggerAllModelSync()).resolves.toEqual({
      success: true,
      data: { items: [], statistics: { total: 0 } },
    })
    await expect(
      triggerSelectedModelSync([modelResourceRef(1), modelResourceRef(2)]),
    ).resolves.toEqual({
      success: true,
      data: { items: [], statistics: { total: 0 } },
    })
    await expect(triggerFailedOnlyModelSync()).resolves.toEqual({
      success: true,
      data: { items: [], statistics: { total: 0 } },
    })
    await expect(getModelSyncLastExecution()).resolves.toEqual({
      success: true,
      data: {
        items: [{ resourceRef: modelResourceRef(1), ok: false }],
        statistics: { total: 1, successCount: 0, failureCount: 1 },
      },
    })
    expect(getModelSyncProgress()).toEqual({
      success: true,
      data: { isRunning: true },
    })
    await expect(
      updateModelSyncSettings({ enableSync: false }),
    ).resolves.toEqual({ success: true })
    await expect(getModelSyncPreferences()).resolves.toEqual({
      success: true,
      data: { enabled: true },
    })
    await expect(getModelSyncChannelUpstreamModelOptions()).resolves.toEqual({
      success: true,
      data: ["gpt-4o"],
    })
    await expect(listModelSyncChannels()).resolves.toEqual({
      success: true,
      data: {
        items: [{ ref: modelResourceRef(1), name: "Channel 1" }],
        total: 1,
        type_counts: {},
      },
    })

    expect(executeSyncSpy).toHaveBeenNthCalledWith(1)
    expect(executeSyncSpy).toHaveBeenNthCalledWith(2, [
      modelResourceRef(1),
      modelResourceRef(2),
    ])
    expect(executeFailedOnlySpy).toHaveBeenCalledTimes(1)
    expect(getProgressSpy).toHaveBeenCalledTimes(1)
    expect(updateSettingsSpy).toHaveBeenCalledWith({ enableSync: false })
    expect(listChannelsSpy).toHaveBeenCalledTimes(1)
  })

  it("returns structured errors when a model-sync action throws", async () => {
    const { modelSyncScheduler, triggerAllModelSync } = await import(
      "~/services/models/modelSync/scheduler"
    )

    vi.spyOn(modelSyncScheduler, "executeSync").mockRejectedValueOnce(
      new Error("sync boom"),
    )

    await expect(triggerAllModelSync()).rejects.toThrow("sync boom")
  })
})
