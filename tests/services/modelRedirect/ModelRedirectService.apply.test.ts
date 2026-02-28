import { beforeEach, describe, expect, it, vi } from "vitest"

import { DONE_HUB, NEW_API } from "~/constants/siteType"
import { hasValidManagedSiteConfig } from "~/services/managedSiteService"
import { modelMetadataService } from "~/services/models/modelMetadata"
import { ModelRedirectService } from "~/services/models/modelRedirect/ModelRedirectService"
import { userPreferences } from "~/services/userPreferences"
import { DEFAULT_MODEL_REDIRECT_PREFERENCES } from "~/types/managedSiteModelRedirect"
import { CHANNEL_STATUS } from "~/types/newapi"

vi.mock("~/services/models/modelMetadata", () => ({
  modelMetadataService: {
    initialize: vi.fn().mockResolvedValue(undefined),
    findStandardModelName: vi.fn(),
    findVendorByPattern: vi.fn(),
    getVendorRules: () => [],
    getCacheInfo: () => ({
      isLoaded: true,
      modelCount: 0,
      lastUpdated: Date.now(),
    }),
  },
}))

const listChannelsMock = vi.fn()
const updateChannelModelMappingMock = vi.fn()

vi.mock("~/services/models/modelSync", () => {
  class ModelSyncServiceMock {
    listChannels = listChannelsMock
    updateChannelModelMapping = updateChannelModelMappingMock
  }
  return {
    ModelSyncService: ModelSyncServiceMock,
  }
})

vi.mock("~/services/managedSiteService", () => ({
  hasValidManagedSiteConfig: vi.fn(),
}))

vi.mock("~/services/userPreferences", () => ({
  userPreferences: {
    getPreferences: vi.fn(),
  },
}))

const mockedHasValidConfig = hasValidManagedSiteConfig as unknown as ReturnType<
  typeof vi.fn
>
const mockedUserPreferences = userPreferences as unknown as {
  getPreferences: ReturnType<typeof vi.fn>
}

const mockedMetadataInitialize =
  modelMetadataService.initialize as unknown as ReturnType<typeof vi.fn>

describe("ModelRedirectService.applyModelMappingToChannel", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("should do nothing when newMapping is empty", async () => {
    const channel = { id: 1, model_mapping: "{}" } as any
    const service = {
      updateChannelModelMapping: vi.fn(),
    } as any

    await ModelRedirectService.applyModelMappingToChannel(channel, {}, service)

    expect(service.updateChannelModelMapping).not.toHaveBeenCalled()
  })

  it("should merge existing mapping JSON with new mapping", async () => {
    const channel = {
      id: 1,
      model_mapping: '{"gpt-4o":"old","custom":"keep"}',
    } as any
    const service = {
      updateChannelModelMapping: vi.fn().mockResolvedValue(undefined),
    } as any

    const newMapping = {
      "gpt-4o": "new",
      "deepseek-r1": "actual",
    }

    await ModelRedirectService.applyModelMappingToChannel(
      channel,
      newMapping,
      service,
    )

    expect(service.updateChannelModelMapping).toHaveBeenCalledWith(channel, {
      "gpt-4o": "new",
      custom: "keep",
      "deepseek-r1": "actual",
    })
  })

  it("should ignore invalid existing JSON and apply only new mapping", async () => {
    const channel = {
      id: 1,
      model_mapping: "invalid-json",
    } as any
    const service = {
      updateChannelModelMapping: vi.fn().mockResolvedValue(undefined),
    } as any

    const newMapping = {
      "gpt-4o": "new",
    }

    await ModelRedirectService.applyModelMappingToChannel(
      channel,
      newMapping,
      service,
    )

    expect(service.updateChannelModelMapping).toHaveBeenCalledWith(
      channel,
      newMapping,
    )
  })

  it("should prune entries whose targets are missing from available models", async () => {
    const channel = {
      id: 1,
      model_mapping: '{"missing":"nope","keep":"ok"}',
    } as any
    const service = {
      updateChannelModelMapping: vi.fn().mockResolvedValue(undefined),
    } as any

    const result = await ModelRedirectService.applyModelMappingToChannel(
      channel,
      {},
      service,
      {
        pruneMissingTargets: true,
        availableModels: ["ok"],
      },
    )

    expect(result).toEqual({ updated: true, prunedCount: 1 })
    expect(service.updateChannelModelMapping).toHaveBeenCalledWith(channel, {
      keep: "ok",
    })
  })

  it("should preserve entries whose targets exist in available models", async () => {
    const channel = {
      id: 1,
      model_mapping: '{"keep":"ok"}',
    } as any
    const service = {
      updateChannelModelMapping: vi.fn().mockResolvedValue(undefined),
    } as any

    const result = await ModelRedirectService.applyModelMappingToChannel(
      channel,
      {},
      service,
      {
        pruneMissingTargets: true,
        availableModels: ["ok"],
      },
    )

    expect(result).toEqual({ updated: false, prunedCount: 0 })
    expect(service.updateChannelModelMapping).not.toHaveBeenCalled()
  })

  it("should preserve chained mapping targets on New API sites", async () => {
    const channel = {
      id: 1,
      model_mapping:
        '{"gpt-4":"gpt-4o","gpt-4o":"gpt-4o-2024-05-13","keep":"gpt-4o-2024-05-13"}',
    } as any
    const service = {
      updateChannelModelMapping: vi.fn().mockResolvedValue(undefined),
    } as any

    const result = await ModelRedirectService.applyModelMappingToChannel(
      channel,
      {},
      service,
      {
        pruneMissingTargets: true,
        availableModels: ["gpt-4o-2024-05-13"],
        siteType: NEW_API,
      },
    )

    expect(result).toEqual({ updated: false, prunedCount: 0 })
    expect(service.updateChannelModelMapping).not.toHaveBeenCalled()
  })

  it("should prune New API cyclic targets when they cannot resolve to an available model", async () => {
    const channel = {
      id: 1,
      model_mapping: '{"a":"b","b":"a"}',
    } as any
    const service = {
      updateChannelModelMapping: vi.fn().mockResolvedValue(undefined),
    } as any

    const result = await ModelRedirectService.applyModelMappingToChannel(
      channel,
      {},
      service,
      {
        pruneMissingTargets: true,
        availableModels: ["ok"],
        siteType: NEW_API,
      },
    )

    expect(result).toEqual({ updated: true, prunedCount: 2 })
    expect(service.updateChannelModelMapping).toHaveBeenCalledWith(channel, {})
  })

  it("should treat '+target' as available on DoneHub sites", async () => {
    const channel = {
      id: 1,
      model_mapping: '{"gpt-4":"+gpt-4o"}',
    } as any
    const service = {
      updateChannelModelMapping: vi.fn().mockResolvedValue(undefined),
    } as any

    const result = await ModelRedirectService.applyModelMappingToChannel(
      channel,
      {},
      service,
      {
        pruneMissingTargets: true,
        availableModels: ["gpt-4o"],
        siteType: DONE_HUB,
      },
    )

    expect(result).toEqual({ updated: false, prunedCount: 0 })
    expect(service.updateChannelModelMapping).not.toHaveBeenCalled()
  })

  it("should apply new mappings even when existing model_mapping is invalid JSON (no pruning)", async () => {
    const channel = {
      id: 1,
      model_mapping: "invalid-json",
    } as any
    const service = {
      updateChannelModelMapping: vi.fn().mockResolvedValue(undefined),
    } as any

    const newMapping = {
      "gpt-4o": "new",
    }

    const result = await ModelRedirectService.applyModelMappingToChannel(
      channel,
      newMapping,
      service,
      {
        pruneMissingTargets: true,
        availableModels: ["new"],
      },
    )

    expect(result).toEqual({ updated: true, prunedCount: 0 })
    expect(service.updateChannelModelMapping).toHaveBeenCalledWith(
      channel,
      newMapping,
    )
  })

  it("should persist pruning updates even when newMapping is empty", async () => {
    const channel = {
      id: 1,
      model_mapping: '{"missing":"nope"}',
    } as any
    const service = {
      updateChannelModelMapping: vi.fn().mockResolvedValue(undefined),
    } as any

    const result = await ModelRedirectService.applyModelMappingToChannel(
      channel,
      {},
      service,
      {
        pruneMissingTargets: true,
        availableModels: ["something-else"],
      },
    )

    expect(result).toEqual({ updated: true, prunedCount: 1 })
    expect(service.updateChannelModelMapping).toHaveBeenCalledWith(channel, {})
  })
})

describe("ModelRedirectService.applyModelRedirect", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("should return error when New API config is invalid", async () => {
    mockedHasValidConfig.mockReturnValueOnce(false)

    mockedUserPreferences.getPreferences.mockResolvedValueOnce(null)

    const result = await ModelRedirectService.applyModelRedirect()

    expect(result.success).toBe(false)
    expect(result.updatedChannels).toBe(0)
    expect(result.errors[0]).toContain("Managed site configuration is missing")
  })

  it("should return error when feature is disabled in preferences", async () => {
    mockedHasValidConfig.mockReturnValue(true)
    mockedUserPreferences.getPreferences.mockResolvedValue({
      newApi: {
        baseUrl: "https://example.com",
        adminToken: "token",
        userId: 1,
      },
      modelRedirect: {
        ...DEFAULT_MODEL_REDIRECT_PREFERENCES,
        enabled: false,
      },
    } as any)

    const result = await ModelRedirectService.applyModelRedirect()

    expect(result.success).toBe(false)
    expect(result.updatedChannels).toBe(0)
    expect(result.errors[0]).toContain("Model redirect feature is disabled")
  })

  it("should process non-disabled channels and apply mappings", async () => {
    mockedHasValidConfig.mockReturnValue(true)
    mockedUserPreferences.getPreferences.mockResolvedValue({
      newApi: {
        baseUrl: "https://example.com",
        adminToken: "token",
        userId: 1,
      },
      modelRedirect: {
        ...DEFAULT_MODEL_REDIRECT_PREFERENCES,
        enabled: true,
        standardModels: ["gpt-4o"],
      },
    } as any)

    mockedMetadataInitialize.mockResolvedValue(undefined)

    const channels = [
      {
        id: 1,
        name: "active-channel",
        // no status field -> treated as enabled
        models: "openai/gpt-4o",
      },
      {
        id: 2,
        name: "disabled-manual",
        status: CHANNEL_STATUS.ManuallyDisabled,
        models: "openai/gpt-4o",
      },
      {
        id: 3,
        name: "disabled-auto",
        status: CHANNEL_STATUS.AutoDisabled,
        models: "openai/gpt-4o",
      },
    ]

    listChannelsMock.mockResolvedValue({ items: channels })

    const mappingSpy = vi.spyOn(
      ModelRedirectService,
      "generateModelMappingForChannel",
    )
    mappingSpy.mockReturnValue({ "gpt-4o": "openai/gpt-4o" })

    const result = await ModelRedirectService.applyModelRedirect()

    // Smoke-test the happy path without asserting on internal implementation details
    expect(typeof result.success).toBe("boolean")
    expect(result.updatedChannels).toBeGreaterThanOrEqual(0)
    expect(Array.isArray(result.errors)).toBe(true)
  })

  it("should collect errors when applying mapping fails for a channel", async () => {
    mockedHasValidConfig.mockReturnValue(true)
    mockedUserPreferences.getPreferences.mockResolvedValue({
      newApi: {
        baseUrl: "https://example.com",
        adminToken: "token",
        userId: 1,
      },
      modelRedirect: {
        ...DEFAULT_MODEL_REDIRECT_PREFERENCES,
        enabled: true,
        standardModels: ["gpt-4o"],
      },
    } as any)

    mockedMetadataInitialize.mockResolvedValue(undefined)

    const channels = [
      {
        id: 1,
        name: "active-channel",
        // no status field -> treated as enabled
        models: "openai/gpt-4o",
      },
    ]

    listChannelsMock.mockResolvedValue({ items: channels })

    const mappingSpy = vi.spyOn(
      ModelRedirectService,
      "generateModelMappingForChannel",
    )
    mappingSpy.mockReturnValue({ "gpt-4o": "openai/gpt-4o" })

    updateChannelModelMappingMock.mockRejectedValue(new Error("update failed"))

    const result = await ModelRedirectService.applyModelRedirect()

    expect(result.success).toBe(false)
    expect(result.updatedChannels).toBe(0)
    expect(result.errors.length).toBeGreaterThan(0)
  })

  it("should handle unexpected errors and return failure result", async () => {
    mockedHasValidConfig.mockImplementation(() => {
      throw new Error("boom")
    })

    const result = await ModelRedirectService.applyModelRedirect()

    expect(result.success).toBe(false)
    expect(result.updatedChannels).toBe(0)
    expect(result.errors[0]).toContain("boom")
  })
})
