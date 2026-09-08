import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { getManagedSiteRuntimeConfigFingerprint } from "~/services/managedSites/runtimeConfig"
import { modelSyncScheduler } from "~/services/models/modelSync/scheduler"
import { DEFAULT_PREFERENCES } from "~/services/preferences/userPreferences"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_MANAGED_SITE_TYPES,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SOURCE_KINDS,
} from "~/services/productAnalytics/contracts"
import {
  PROTECTION_BYPASS_AUTOMATIC_TRIGGERS,
  PROTECTION_BYPASS_FEATURES,
  PROTECTION_BYPASS_SURFACES,
} from "~/services/protectionBypass/contracts"
import type {
  BatchExecutionOptions,
  ExecutionResult,
} from "~/types/managedSiteModelSync"
import { automaticExecution } from "~~/tests/services/protectionBypass/fixtures"
import { createDeferred } from "~~/tests/test-utils/deferred"
import { modelResourceRef } from "~~/tests/test-utils/managedModelResource"

vi.mock("~/services/managedSites/legacyChannelConfigMigration", () => ({
  ensureLegacyChannelConfigMigrationReady: vi.fn().mockResolvedValue(undefined),
}))

const mocks = vi.hoisted(() => ({
  clearAlarm: vi.fn(),
  createAlarm: vi.fn(),
  getAlarm: vi.fn(),
  hasAlarmsAPI: vi.fn(),
  onAlarm: vi.fn(),
  sendRuntimeMessage: vi.fn(),
  getPreferences: vi.fn(),
  savePreferences: vi.fn(),
  getConfigsForScope: vi.fn(),
  listChannels: vi.fn(),
  runBatch: vi.fn(),
  octopusListChannels: vi.fn(),
  runOctopusBatch: vi.fn(),
  prepareOctopusBatch: vi.fn(),
  createOctopusModelSyncCapability: vi.fn(),
  saveLastExecution: vi.fn(),
  getLastExecution: vi.fn(),
  saveChannelUpstreamModelOptions: vi.fn(),
  getStoredPreferences: vi.fn(),
  getChannelUpstreamModelOptions: vi.fn(),
  collectModelsFromExecution: vi.fn(),
  generateModelMappingForChannel: vi.fn(),
  applyModelMappingToChannel: vi.fn(),
  notifyTaskResult: vi.fn(),
  startProductAnalyticsAction: vi.fn(),
  completeProductAnalyticsAction: vi.fn(),
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
    getConfigsForScope: mocks.getConfigsForScope,
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

vi.mock("~/services/productAnalytics/actions", () => ({
  startProductAnalyticsAction: mocks.startProductAnalyticsAction,
}))

vi.mock("~/services/apiService/octopus", () => ({
  listChannels: mocks.octopusListChannels,
  fetchGroups: vi.fn(),
  fetchAvailableModels: vi.fn(),
}))

vi.mock("~/services/apiAdapters/managedResources/octopusModelSync", () => ({
  createOctopusModelSyncCapability: mocks.createOctopusModelSyncCapability,
}))

vi.mock("~/services/managedSites/providers/octopus", () => ({
  checkValidOctopusConfig: vi.fn(),
  fetchAvailableModels: vi.fn(),
  buildChannelName: vi.fn(),
  prepareChannelFormData: vi.fn(),
  buildChannelPayload: vi.fn(),
}))

describe("modelSyncScheduler lifecycle and edge flows", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
    ;(modelSyncScheduler as any).isInitialized = false
    ;(modelSyncScheduler as any).currentProgress = null

    mocks.hasAlarmsAPI.mockReturnValue(true)
    mocks.onAlarm.mockReturnValue(undefined)
    mocks.getConfigsForScope.mockResolvedValue({})
    mocks.createOctopusModelSyncCapability.mockReturnValue({
      listChannels: mocks.octopusListChannels,
      prepareBatch: mocks.prepareOctopusBatch,
    })
    mocks.saveLastExecution.mockResolvedValue(undefined)
    mocks.saveChannelUpstreamModelOptions.mockResolvedValue(undefined)
    mocks.getLastExecution.mockResolvedValue(null)
    mocks.collectModelsFromExecution.mockReturnValue([])
    mocks.generateModelMappingForChannel.mockReturnValue({})
    mocks.applyModelMappingToChannel.mockResolvedValue({
      updated: false,
      prunedCount: 0,
    })
    mocks.sendRuntimeMessage.mockResolvedValue(undefined)
    mocks.notifyTaskResult.mockResolvedValue(true)
    mocks.startProductAnalyticsAction.mockReturnValue({
      complete: mocks.completeProductAnalyticsAction,
    })

    mocks.getPreferences.mockResolvedValue({
      managedSiteType: SITE_TYPES.NEW_API,
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

  it.each([SITE_TYPES.NEW_API, SITE_TYPES.OCTOPUS])(
    "scopes %s progress to its captured configuration and preserves a newer run",
    async (siteType) => {
      const initialPreferences = await mocks.getPreferences()
      let preferences = {
        ...initialPreferences,
        managedSiteType: siteType,
        octopus: {
          baseUrl: "https://example.com",
          username: "admin",
          password: "first-password",
        },
      }
      mocks.getPreferences.mockImplementation(async () => preferences)
      const ref = modelResourceRef(1, { siteType })
      const resource = { ref, name: "Known channel" }
      const batches: Array<{
        options: BatchExecutionOptions
        completion: ReturnType<typeof createDeferred<ExecutionResult>>
      }> = []
      const runBatch = async (options: BatchExecutionOptions) => {
        const completion = createDeferred<ExecutionResult>()
        batches.push({ options, completion })
        return completion.promise
      }
      if (siteType === SITE_TYPES.OCTOPUS) {
        mocks.prepareOctopusBatch
          .mockResolvedValueOnce({ resources: [resource], run: runBatch })
          .mockResolvedValueOnce({ resources: [resource], run: runBatch })
      } else {
        mocks.listChannels.mockResolvedValue({ items: [resource], total: 1 })
        mocks.runBatch
          .mockImplementationOnce((_channels, options) => runBatch(options))
          .mockImplementationOnce((_channels, options) => runBatch(options))
      }
      const lastResult = {
        resourceRef: ref,
        channelName: "Known channel",
        ok: true,
        attempts: 1,
        finishedAt: 1,
      }
      const result: ExecutionResult = {
        items: [lastResult],
        statistics: {
          total: 1,
          successCount: 1,
          failureCount: 0,
          durationMs: 1,
          startedAt: 0,
          endedAt: 1,
        },
      }
      const firstFingerprint = getManagedSiteRuntimeConfigFingerprint(
        preferences,
        siteType,
      )
      const firstRun = modelSyncScheduler.executeSync()
      await vi.waitFor(() => expect(batches).toHaveLength(1))

      preferences = {
        ...preferences,
        newApi: { ...preferences.newApi, userId: "2" },
        octopus: { ...preferences.octopus, password: "second-password" },
      }
      await batches[0].options.onProgress?.({
        completed: 1,
        total: 1,
        lastResult,
      })
      expect(modelSyncScheduler.getProgress()).toMatchObject({
        configFingerprint: firstFingerprint,
        completed: 1,
      })

      const secondFingerprint = getManagedSiteRuntimeConfigFingerprint(
        preferences,
        siteType,
      )
      expect(secondFingerprint).not.toBe(firstFingerprint)
      const secondRun = modelSyncScheduler.executeSync()
      await vi.waitFor(() => expect(batches).toHaveLength(2))
      const messagesBeforeStaleProgress =
        mocks.sendRuntimeMessage.mock.calls.length
      await batches[0].options.onProgress?.({
        completed: 1,
        total: 1,
        lastResult,
      })
      batches[0].completion.resolve(result)
      await firstRun

      expect(modelSyncScheduler.getProgress()).toMatchObject({
        configFingerprint: secondFingerprint,
        isRunning: true,
        completed: 0,
      })
      expect(mocks.sendRuntimeMessage).toHaveBeenCalledTimes(
        messagesBeforeStaleProgress,
      )
      await batches[1].options.onProgress?.({
        completed: 1,
        total: 1,
        lastResult,
      })
      batches[1].completion.resolve(result)
      await secondRun

      expect(modelSyncScheduler.getProgress()).toBeNull()
      expect(mocks.sendRuntimeMessage).toHaveBeenLastCalledWith(
        {
          type: "MANAGED_SITE_MODEL_SYNC_PROGRESS",
          payload: expect.objectContaining({
            configFingerprint: secondFingerprint,
            isRunning: false,
            completed: 1,
          }),
        },
        { maxAttempts: 1 },
      )
    },
  )

  it.each([SITE_TYPES.NEW_API, SITE_TYPES.OCTOPUS])(
    "keeps newer %s progress when an earlier inventory request finishes last",
    async (siteType) => {
      const initialPreferences = await mocks.getPreferences()
      let preferences = {
        ...initialPreferences,
        managedSiteType: siteType,
        octopus: {
          baseUrl: "https://example.com",
          username: "admin",
          password: "first-password",
        },
      }
      mocks.getPreferences.mockImplementation(async () => preferences)
      const resource = {
        ref: modelResourceRef(1, { siteType }),
        name: "Known channel",
      }
      const oldInventory = createDeferred<unknown>()
      const oldCompletion = createDeferred<ExecutionResult>()
      const newCompletion = createDeferred<ExecutionResult>()
      const oldNativeRun = vi.fn(() => oldCompletion.promise)
      const inventory =
        siteType === SITE_TYPES.OCTOPUS
          ? mocks.prepareOctopusBatch
          : mocks.listChannels
      inventory.mockReturnValueOnce(oldInventory.promise)
      if (siteType === SITE_TYPES.OCTOPUS) {
        mocks.prepareOctopusBatch.mockResolvedValueOnce({
          resources: [resource],
          run: () => newCompletion.promise,
        })
      } else {
        mocks.listChannels.mockResolvedValueOnce({
          items: [resource],
          total: 1,
        })
        mocks.runBatch
          .mockReturnValueOnce(newCompletion.promise)
          .mockReturnValueOnce(oldCompletion.promise)
      }
      const firstRun = modelSyncScheduler.executeSync()
      await vi.waitFor(() => expect(inventory).toHaveBeenCalledOnce())
      preferences = {
        ...preferences,
        newApi: { ...preferences.newApi, userId: "2" },
        octopus: { ...preferences.octopus, password: "second-password" },
      }
      const newFingerprint = getManagedSiteRuntimeConfigFingerprint(
        preferences,
        siteType,
      )
      const secondRun = modelSyncScheduler.executeSync()
      await vi.waitFor(() =>
        expect(modelSyncScheduler.getProgress()).toMatchObject({
          configFingerprint: newFingerprint,
          isRunning: true,
        }),
      )

      oldInventory.resolve(
        siteType === SITE_TYPES.OCTOPUS
          ? { resources: [resource], run: oldNativeRun }
          : { items: [resource], total: 1 },
      )
      await vi.waitFor(() =>
        siteType === SITE_TYPES.OCTOPUS
          ? expect(oldNativeRun).toHaveBeenCalledOnce()
          : expect(mocks.runBatch).toHaveBeenCalledTimes(2),
      )
      const progressAfterOldInventory = modelSyncScheduler.getProgress()
      const result: ExecutionResult = {
        items: [],
        statistics: {
          total: 0,
          successCount: 0,
          failureCount: 0,
          durationMs: 0,
          startedAt: 0,
          endedAt: 0,
        },
      }
      oldCompletion.resolve(result)
      await firstRun
      const progressAfterOldCompletion = modelSyncScheduler.getProgress()
      newCompletion.resolve(result)
      await secondRun

      for (const progress of [
        progressAfterOldInventory,
        progressAfterOldCompletion,
      ]) {
        expect(progress).toMatchObject({
          configFingerprint: newFingerprint,
          isRunning: true,
        })
      }
      expect(
        mocks.sendRuntimeMessage.mock.calls.map(
          ([message]) => message.payload.configFingerprint,
        ),
      ).toEqual([newFingerprint, newFingerprint])
      expect(modelSyncScheduler.getProgress()).toBeNull()
    },
  )

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
    expect(executeSpy).toHaveBeenCalledWith(undefined, "scheduled")
    expect(mocks.startProductAnalyticsAction).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ManagedSiteModelSync,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.ScheduledManagedSiteModelSync,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Background,
    })
    expect(mocks.completeProductAnalyticsAction).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Failure,
      expect.objectContaining({
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
        durationMs: expect.any(Number),
        insights: {
          sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.Auto,
          managedSiteType: PRODUCT_ANALYTICS_MANAGED_SITE_TYPES.NewApi,
        },
      }),
    )
    expect(mocks.notifyTaskResult).toHaveBeenCalledWith({
      task: "managedSiteModelSync",
      status: "failure",
      message: "scheduled sync failed",
    })
  })

  it.each([
    ["unsupported backend", PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unsupported],
    ["missing config", PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation],
    ["401 unauthorized", PRODUCT_ANALYTICS_ERROR_CATEGORIES.Auth],
    ["failed to fetch", PRODUCT_ANALYTICS_ERROR_CATEGORIES.Network],
    ["429 too many requests", PRODUCT_ANALYTICS_ERROR_CATEGORIES.RateLimit],
    ["unexpected failure", PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown],
  ])("classifies scheduled sync failure as %s", async (message, category) => {
    let alarmHandler: ((alarm: { name: string }) => Promise<void>) | undefined
    mocks.onAlarm.mockImplementation((handler) => {
      alarmHandler = handler
    })

    vi.spyOn(modelSyncScheduler, "setupAlarm").mockResolvedValue(undefined)
    vi.spyOn(modelSyncScheduler, "executeSync").mockRejectedValue(
      new Error(message),
    )

    await modelSyncScheduler.initialize()
    await alarmHandler?.({ name: "managedSiteModelSync" })

    expect(mocks.completeProductAnalyticsAction).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Failure,
      expect.objectContaining({
        errorCategory: category,
      }),
    )
  })

  it("notifies scheduled sync success counts after the alarm handler runs", async () => {
    let alarmHandler: ((alarm: { name: string }) => Promise<void>) | undefined
    mocks.onAlarm.mockImplementation((handler) => {
      alarmHandler = handler
    })

    vi.spyOn(modelSyncScheduler, "setupAlarm").mockResolvedValue(undefined)
    vi.spyOn(modelSyncScheduler, "executeSync").mockResolvedValue({
      items: [
        {
          resourceRef: modelResourceRef(3),
          channelName: "Gamma",
          ok: false,
          httpStatus: 429,
        },
      ],
      statistics: {
        total: 3,
        successCount: 2,
        failureCount: 1,
      },
    } as any)

    await modelSyncScheduler.initialize()
    await alarmHandler?.({ name: "managedSiteModelSync" })

    expect(mocks.startProductAnalyticsAction).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ManagedSiteModelSync,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.ScheduledManagedSiteModelSync,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Background,
    })
    expect(mocks.completeProductAnalyticsAction).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Failure,
      expect.objectContaining({
        durationMs: expect.any(Number),
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.RateLimit,
        insights: {
          sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.Auto,
          managedSiteType: PRODUCT_ANALYTICS_MANAGED_SITE_TYPES.NewApi,
          itemCount: 3,
          successCount: 2,
          failureCount: 1,
        },
      }),
    )
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

  it("classifies invalid token model sync failures as auth errors", async () => {
    let alarmHandler: ((alarm: { name: string }) => Promise<void>) | undefined
    mocks.onAlarm.mockImplementation((handler) => {
      alarmHandler = handler
    })

    vi.spyOn(modelSyncScheduler, "setupAlarm").mockResolvedValue(undefined)
    vi.spyOn(modelSyncScheduler, "executeSync").mockRejectedValue(
      new Error("invalid token"),
    )

    await modelSyncScheduler.initialize()
    await alarmHandler?.({ name: "managedSiteModelSync" })

    expect(mocks.completeProductAnalyticsAction).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Failure,
      expect.objectContaining({
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Auth,
      }),
    )
  })

  it("lists only Octopus channel selection facts and validates config", async () => {
    mocks.getPreferences.mockResolvedValueOnce({
      managedSiteType: SITE_TYPES.OCTOPUS,
      octopus: {
        baseUrl: "https://octopus.example.com",
        username: "admin",
        password: "secret",
      },
      managedSiteModelSync: {
        ...(DEFAULT_PREFERENCES as any).managedSiteModelSync,
      },
    })
    mocks.octopusListChannels.mockResolvedValue({
      items: [
        {
          ref: modelResourceRef(1, {
            siteType: SITE_TYPES.OCTOPUS,
            scopeKey: "https://octopus.example.com",
          }),
          name: "Alpha",
        },
        {
          ref: modelResourceRef(2, {
            siteType: SITE_TYPES.OCTOPUS,
            scopeKey: "https://octopus.example.com",
          }),
          name: "Beta",
        },
      ],
      total: 2,
    })

    await expect(modelSyncScheduler.listChannels()).resolves.toEqual({
      items: [
        {
          ref: modelResourceRef(1, {
            siteType: SITE_TYPES.OCTOPUS,
            scopeKey: "https://octopus.example.com",
          }),
          name: "Alpha",
        },
        {
          ref: modelResourceRef(2, {
            siteType: SITE_TYPES.OCTOPUS,
            scopeKey: "https://octopus.example.com",
          }),
          name: "Beta",
        },
      ],
      total: 2,
    })
    expect(mocks.createOctopusModelSyncCapability).toHaveBeenCalledWith(
      expect.objectContaining({ baseUrl: "https://octopus.example.com" }),
      expect.objectContaining({
        feature: PROTECTION_BYPASS_FEATURES.ManagedSiteModelSync,
        trigger: PROTECTION_BYPASS_AUTOMATIC_TRIGGERS.BackgroundRecovery,
        surface: PROTECTION_BYPASS_SURFACES.Background,
      }),
    )

    mocks.getPreferences.mockResolvedValueOnce({
      managedSiteType: SITE_TYPES.OCTOPUS,
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

  it("keeps execution credentials out of the shared model sync channel selection", async () => {
    mocks.listChannels.mockResolvedValueOnce({
      items: [
        {
          ref: modelResourceRef(9),
          name: "Shared channel",
          credential: "private-key",
          modelMapping: '{"a":"b"}',
          models: ["model-a"],
        },
      ],
      total: 1,
      type_counts: { shared: 1 },
    })

    await expect(modelSyncScheduler.listChannels()).resolves.toEqual({
      items: [{ ref: modelResourceRef(9), name: "Shared channel" }],
      total: 1,
    })

    expect(mocks.getConfigsForScope).toHaveBeenCalledWith({
      managedSiteType: SITE_TYPES.NEW_API,
      scopeKey: "https://example.com",
    })
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
    const knownChannel = { ref: modelResourceRef(1), name: "Known channel" }

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
        resourceRef: modelResourceRef(1),
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
      2,
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
        payload: expect.objectContaining({
          configFingerprint: expect.any(String),
          isRunning: false,
          completed: 1,
        }),
      },
      { maxAttempts: 1 },
    )
    expect(modelSyncScheduler.getProgress()).toBeNull()
  })

  it("notifies listeners as soon as a new-api sync run starts", async () => {
    const batchStarted = new Promise<void>((resolve) => {
      mocks.runBatch.mockImplementation(async () => {
        resolve()
        return new Promise(() => {})
      })
    })

    mocks.listChannels.mockResolvedValue({
      items: [{ ref: modelResourceRef(1), name: "Known channel" }],
      total: 1,
      type_counts: {},
    })

    void modelSyncScheduler.executeSync()
    await batchStarted

    expect(mocks.sendRuntimeMessage).toHaveBeenCalledWith(
      {
        type: "MANAGED_SITE_MODEL_SYNC_PROGRESS",
        payload: {
          configFingerprint: expect.any(String),
          isRunning: true,
          total: 1,
          completed: 0,
          failed: 0,
        },
      },
      { maxAttempts: 1 },
    )
  })

  it("tracks failed progress updates and skips redirect mapping when a channel sync fails", async () => {
    const failedResult = {
      resourceRef: modelResourceRef(1),
      channelName: "Known channel",
      ok: false,
      error: "upstream rejected models",
    }

    mocks.listChannels.mockResolvedValue({
      items: [{ ref: modelResourceRef(1), name: "Known channel" }],
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
      2,
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
      resourceRef: modelResourceRef(404),
      channelName: "Unknown channel",
      ok: true,
      oldModels: ["gpt-4o"],
      newModels: ["gpt-4o-mini"],
    }

    mocks.listChannels.mockResolvedValue({
      items: [{ ref: modelResourceRef(1), name: "Known channel" }],
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

  it.each(["empty selection", "cleared configuration"])(
    "rejects %s before contacting any provider",
    async (scenario) => {
      if (scenario === "cleared configuration") {
        const preferences = await mocks.getPreferences()
        mocks.getPreferences.mockResolvedValueOnce({
          ...preferences,
          newApi: undefined,
        })
      }

      await expect(
        modelSyncScheduler.executeSync(
          scenario === "empty selection" ? [] : [modelResourceRef(1)],
        ),
      ).rejects.toThrow(
        "A configured managed site and non-empty resource selection are required",
      )
      expect(mocks.listChannels).not.toHaveBeenCalled()
      expect(mocks.createOctopusModelSyncCapability).not.toHaveBeenCalled()
      expect(mocks.runBatch).not.toHaveBeenCalled()
      expect(mocks.sendRuntimeMessage).not.toHaveBeenCalled()
    },
  )

  it("rejects selected sync requests when no channels match the requested ids", async () => {
    mocks.listChannels.mockResolvedValue({
      items: [
        {
          id: 1,
          name: "Alpha",
          type: 1,
          enabled: true,
          model: "gpt-4o",
          base_urls: [{ url: "https://upstream.example.com" }],
          keys: [{ channel_key: "test-key" }],
        },
      ],
      total: 1,
      type_counts: {},
    })

    await expect(
      modelSyncScheduler.executeSync([modelResourceRef(999)]),
    ).rejects.toThrow()
  })

  it("delegates Octopus sync batches, tracks failures, and skips full-sync caching for selected references", async () => {
    mocks.getPreferences.mockResolvedValueOnce({
      managedSiteType: SITE_TYPES.OCTOPUS,
      octopus: {
        baseUrl: "https://octopus.example.com",
        username: "admin",
        password: "secret",
      },
      managedSiteModelSync: {
        ...(DEFAULT_PREFERENCES as any).managedSiteModelSync,
        concurrency: 2,
        maxRetries: 3,
        channelProcessingTimeout: 600,
      },
    })
    const selectedRef = modelResourceRef(2, {
      siteType: SITE_TYPES.OCTOPUS,
      scopeKey: "https://octopus.example.com",
    })
    mocks.prepareOctopusBatch.mockResolvedValue({
      resources: [{ ref: selectedRef, name: "Beta" }],
      run: mocks.runOctopusBatch,
    })
    mocks.runOctopusBatch.mockImplementation(async (options: any) => {
      const lastResult = {
        resourceRef: selectedRef,
        channelName: "Beta",
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
    })

    const execution = automaticExecution(
      PROTECTION_BYPASS_FEATURES.ManagedSiteModelSync,
      PROTECTION_BYPASS_AUTOMATIC_TRIGGERS.BackgroundRecovery,
    )

    await expect(
      modelSyncScheduler.executeSync(
        [
          modelResourceRef(2, {
            siteType: SITE_TYPES.OCTOPUS,
            scopeKey: "https://octopus.example.com",
          }),
        ],
        PROTECTION_BYPASS_AUTOMATIC_TRIGGERS.BackgroundRecovery,
        execution,
      ),
    ).resolves.toMatchObject({
      statistics: { failureCount: 1 },
    })

    expect(mocks.runOctopusBatch).toHaveBeenCalledTimes(1)
    expect(mocks.createOctopusModelSyncCapability).toHaveBeenCalledWith(
      expect.objectContaining({ baseUrl: "https://octopus.example.com" }),
      execution,
    )
    expect(mocks.prepareOctopusBatch).toHaveBeenCalledWith([selectedRef])
    expect(mocks.runOctopusBatch).toHaveBeenCalledWith(
      expect.objectContaining({
        concurrency: 2,
        maxRetries: 3,
        channelProcessingTimeout: 600,
      }),
    )
    expect(mocks.saveLastExecution).toHaveBeenCalledTimes(1)
    expect(mocks.saveChannelUpstreamModelOptions).not.toHaveBeenCalled()
    expect(mocks.sendRuntimeMessage).toHaveBeenNthCalledWith(
      2,
      {
        type: "MANAGED_SITE_MODEL_SYNC_PROGRESS",
        payload: expect.objectContaining({
          isRunning: true,
          completed: 1,
          failed: 1,
          currentChannel: "Beta",
        }),
      },
      { maxAttempts: 1 },
    )
  })

  it("binds scheduled Octopus sync to one scheduled model-sync execution", async () => {
    mocks.getPreferences.mockResolvedValueOnce({
      managedSiteType: SITE_TYPES.OCTOPUS,
      octopus: {
        baseUrl: "https://managed.example.invalid",
        username: "example-admin",
        password: "example-password",
      },
      managedSiteModelSync: {
        ...(DEFAULT_PREFERENCES as any).managedSiteModelSync,
      },
    })
    mocks.prepareOctopusBatch.mockResolvedValueOnce({
      resources: [
        {
          ref: modelResourceRef(4, {
            siteType: SITE_TYPES.OCTOPUS,
            scopeKey: "https://managed.example.invalid",
          }),
          name: "Example channel",
        },
      ],
      run: mocks.runOctopusBatch,
    })
    mocks.runOctopusBatch.mockResolvedValueOnce({
      items: [
        {
          resourceRef: modelResourceRef(4),
          channelName: "Example channel",
          ok: true,
        },
      ],
      statistics: {
        total: 1,
        successCount: 1,
        failureCount: 0,
      },
    })

    await modelSyncScheduler.executeSync(
      undefined,
      PROTECTION_BYPASS_AUTOMATIC_TRIGGERS.Scheduled,
    )

    expect(mocks.createOctopusModelSyncCapability).toHaveBeenCalledTimes(1)
    expect(mocks.createOctopusModelSyncCapability).toHaveBeenCalledWith(
      expect.objectContaining({ baseUrl: "https://managed.example.invalid" }),
      expect.objectContaining({
        feature: PROTECTION_BYPASS_FEATURES.ManagedSiteModelSync,
        trigger: PROTECTION_BYPASS_AUTOMATIC_TRIGGERS.Scheduled,
        surface: PROTECTION_BYPASS_SURFACES.Background,
      }),
    )
    expect(mocks.prepareOctopusBatch).toHaveBeenCalledWith(undefined)
    expect(mocks.runOctopusBatch).toHaveBeenCalledWith(
      expect.not.objectContaining({
        protectionBypassExecution: expect.anything(),
      }),
    )
  })

  it("caches collected upstream models for Octopus full syncs and rejects empty/full-invalid Octopus runs", async () => {
    mocks.getPreferences.mockResolvedValueOnce({
      managedSiteType: SITE_TYPES.OCTOPUS,
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
    mocks.prepareOctopusBatch.mockResolvedValueOnce({
      resources: [
        {
          ref: modelResourceRef(3, {
            siteType: SITE_TYPES.OCTOPUS,
            scopeKey: "https://octopus.example.com",
          }),
          name: "Gamma",
        },
      ],
      run: mocks.runOctopusBatch,
    })
    mocks.collectModelsFromExecution.mockReturnValueOnce(["gpt-4o", "claude-3"])
    mocks.runOctopusBatch.mockResolvedValueOnce({
      items: [
        {
          resourceRef: modelResourceRef(3),
          channelName: "mapped-Gamma",
          ok: true,
        },
      ],
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
      managedSiteType: SITE_TYPES.OCTOPUS,
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
      managedSiteType: SITE_TYPES.OCTOPUS,
      octopus: {
        baseUrl: "https://octopus.example.com",
        username: "admin",
        password: "secret",
      },
      managedSiteModelSync: {
        ...(DEFAULT_PREFERENCES as any).managedSiteModelSync,
      },
    })
    mocks.prepareOctopusBatch.mockResolvedValueOnce({
      resources: [],
      run: mocks.runOctopusBatch,
    })

    await expect(modelSyncScheduler.executeSync()).rejects.toThrow()
  })

  it("retries only the failed channels from the previous execution", async () => {
    mocks.getLastExecution.mockResolvedValueOnce({
      items: [
        { resourceRef: modelResourceRef(1), ok: false },
        { resourceRef: modelResourceRef(2), ok: true },
        { resourceRef: modelResourceRef(3), ok: false },
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
    expect(executeSpy).toHaveBeenCalledWith([
      modelResourceRef(1),
      modelResourceRef(3),
    ])
  })
})
