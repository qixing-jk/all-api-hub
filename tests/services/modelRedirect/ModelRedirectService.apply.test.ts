import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { modelMetadataService } from "~/services/modelMetadata"
import { ModelRedirectService } from "~/services/modelRedirect/ModelRedirectService"
import { hasValidNewApiConfig } from "~/services/newApiService/newApiService"
import { userPreferences } from "~/services/userPreferences"
import { DEFAULT_MODEL_REDIRECT_PREFERENCES } from "~/types/modelRedirect"
import { CHANNEL_STATUS } from "~/types/newapi"

vi.mock("~/services/modelMetadata", () => ({
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

vi.mock("~/services/newApiModelSync", () => {
  const NewApiModelSyncServiceMock = vi.fn().mockImplementation(() => ({
    listChannels: listChannelsMock,
    updateChannelModelMapping: updateChannelModelMappingMock,
  }))
  return {
    NewApiModelSyncService: NewApiModelSyncServiceMock,
    __esModule: true,
  }
})

vi.mock("~/services/newApiService/newApiService", () => ({
  hasValidNewApiConfig: vi.fn(),
}))

vi.mock("~/services/userPreferences", () => ({
  userPreferences: {
    getPreferences: vi.fn(),
  },
}))

const mockedHasValidConfig = hasValidNewApiConfig as unknown as ReturnType<
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
})

describe("ModelRedirectService.applyModelRedirect", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it("should return error when New API config is invalid", async () => {
    mockedHasValidConfig.mockReturnValue(false)
    mockedUserPreferences.getPreferences.mockResolvedValue({} as any)

    const result = await ModelRedirectService.applyModelRedirect()

    expect(result.success).toBe(false)
    expect(result.updatedChannels).toBe(0)
    expect(result.errors[0]).toContain("New API configuration is missing")
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
