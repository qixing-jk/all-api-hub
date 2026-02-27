import { beforeEach, describe, expect, it, vi } from "vitest"

import { NEW_API } from "~/constants/siteType"
import { ModelRedirectService } from "~/services/modelRedirect"
import { modelSyncScheduler } from "~/services/modelSync/scheduler"
import { userPreferences } from "~/services/userPreferences"
import { buildManagedSiteChannel } from "~/tests/test-utils/factories"
import { DEFAULT_MODEL_REDIRECT_PREFERENCES } from "~/types/managedSiteModelRedirect"

const {
  mockGetAllChannelConfigs,
  mockGetPreferences,
  mockListChannels,
  mockRunBatch,
  mockSaveLastExecution,
} = vi.hoisted(() => ({
  mockGetAllChannelConfigs: vi.fn(),
  mockGetPreferences: vi.fn(),
  mockListChannels: vi.fn(),
  mockRunBatch: vi.fn(),
  mockSaveLastExecution: vi.fn(),
}))

vi.mock("~/services/channelConfigStorage", () => ({
  channelConfigStorage: {
    getAllConfigs: mockGetAllChannelConfigs,
  },
}))

vi.mock("~/services/modelSync/storage", () => ({
  managedSiteModelSyncStorage: {
    saveLastExecution: mockSaveLastExecution,
    saveChannelUpstreamModelOptions: vi.fn(),
    getLastExecution: vi.fn(),
    getPreferences: vi.fn(),
    getChannelUpstreamModelOptions: vi.fn(),
  },
}))

vi.mock("~/services/modelSync/modelSyncService", () => {
  class ModelSyncServiceMock {
    listChannels = mockListChannels
    runBatch = mockRunBatch
  }
  return {
    ModelSyncService: ModelSyncServiceMock,
  }
})

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
    getPreferences: mockGetPreferences,
    savePreferences: vi.fn(),
  },
}))

describe("modelSyncScheduler.executeSync - model redirect pruning", () => {
  const mockedUserPreferences = userPreferences as unknown as {
    getPreferences: ReturnType<typeof vi.fn>
  }

  const mockedModelRedirectService = ModelRedirectService as unknown as {
    generateModelMappingForChannel: ReturnType<typeof vi.fn>
    applyModelMappingToChannel: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    vi.clearAllMocks()

    mockGetAllChannelConfigs.mockResolvedValue({})
    mockSaveLastExecution.mockResolvedValue(undefined)

    mockedModelRedirectService.generateModelMappingForChannel = vi
      .fn()
      .mockReturnValue({})
    mockedModelRedirectService.applyModelMappingToChannel = vi
      .fn()
      .mockResolvedValue({ updated: false, prunedCount: 0 })
  })

  const setPrefs = (overrides: { pruneMissingTargetsOnModelSync: boolean }) => {
    mockedUserPreferences.getPreferences.mockResolvedValue({
      managedSiteType: NEW_API,
      newApi: {
        baseUrl: "https://example.com",
        adminToken: "token",
        userId: "1",
      },
      managedSiteModelSync: {
        enabled: true,
        interval: 60_000,
        concurrency: 1,
        maxRetries: 1,
        rateLimit: { requestsPerMinute: 10, burst: 2 },
        allowedModels: [],
        globalChannelModelFilters: [],
      },
      modelRedirect: {
        ...DEFAULT_MODEL_REDIRECT_PREFERENCES,
        enabled: true,
        standardModels: ["gpt-4o"],
        pruneMissingTargetsOnModelSync:
          overrides.pruneMissingTargetsOnModelSync,
      },
    } as any)
  }

  const setServiceMocks = (params: {
    oldModels?: string[]
    newModels?: string[]
  }) => {
    const channel = buildManagedSiteChannel({
      id: 1,
      name: "channel-1",
      model_mapping: "{}",
    })
    mockListChannels.mockResolvedValue({ items: [channel] })

    mockRunBatch.mockImplementation(async (_channels: any, options: any) => {
      const lastResult = {
        channelId: 1,
        channelName: "channel-1",
        ok: true,
        attempts: 1,
        finishedAt: Date.now(),
        oldModels: params.oldModels,
        newModels: params.newModels,
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
          durationMs: 0,
          startedAt: 0,
          endedAt: 0,
        },
      }
    })

    return { channel }
  }

  it("passes prune options when enabled and model list changed", async () => {
    setPrefs({ pruneMissingTargetsOnModelSync: true })
    const newModels = ["a", "b"]
    const { channel } = setServiceMocks({
      oldModels: ["a"],
      newModels,
    })

    await modelSyncScheduler.executeSync([1])

    expect(
      mockedModelRedirectService.applyModelMappingToChannel,
    ).toHaveBeenCalledWith(channel, {}, expect.anything(), {
      pruneMissingTargets: true,
      availableModels: newModels,
      siteType: NEW_API,
    })
  })

  it("does not pass prune options when model list is unchanged (set equality)", async () => {
    setPrefs({ pruneMissingTargetsOnModelSync: true })
    const newModels = ["b", "a"]
    const { channel } = setServiceMocks({
      oldModels: ["a", "b"],
      newModels,
    })

    await modelSyncScheduler.executeSync([1])

    expect(
      mockedModelRedirectService.applyModelMappingToChannel,
    ).toHaveBeenCalledWith(channel, {}, expect.anything(), undefined)
  })

  it("does not pass prune options when newModels is empty", async () => {
    setPrefs({ pruneMissingTargetsOnModelSync: true })
    const { channel } = setServiceMocks({
      oldModels: ["a"],
      newModels: [],
    })

    await modelSyncScheduler.executeSync([1])

    expect(
      mockedModelRedirectService.applyModelMappingToChannel,
    ).toHaveBeenCalledWith(channel, {}, expect.anything(), undefined)
  })

  it("does not pass prune options when prune flag is disabled", async () => {
    setPrefs({ pruneMissingTargetsOnModelSync: false })
    const { channel } = setServiceMocks({
      oldModels: ["a"],
      newModels: ["a", "b"],
    })

    await modelSyncScheduler.executeSync([1])

    expect(
      mockedModelRedirectService.applyModelMappingToChannel,
    ).toHaveBeenCalledWith(channel, {}, expect.anything(), undefined)
  })
})
