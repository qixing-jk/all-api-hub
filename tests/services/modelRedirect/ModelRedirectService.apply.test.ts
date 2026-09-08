import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { doneHubManagedResourceModels } from "~/services/apiAdapters/managedResources/doneHubOperations"
import { newApiManagedResourceModels } from "~/services/apiAdapters/managedResources/newApiOperations"
import { hasValidManagedSiteConfig } from "~/services/managedSites/runtimeConfig"
import { modelMetadataService } from "~/services/models/modelMetadata"
import { ModelRedirectService } from "~/services/models/modelRedirect/ModelRedirectService"
import { userPreferences } from "~/services/preferences/userPreferences"
import { DEFAULT_MODEL_REDIRECT_PREFERENCES } from "~/types/managedSiteModelRedirect"
import { modelResourceRef } from "~~/tests/test-utils/managedModelResource"

const {
  getSiteTypeCapabilitiesMock,
  resolveManagedUpstreamResourceFeatureCapabilitiesMock,
} = vi.hoisted(() => ({
  getSiteTypeCapabilitiesMock: vi.fn(),
  resolveManagedUpstreamResourceFeatureCapabilitiesMock: vi.fn(),
}))

vi.mock("~/services/models/modelMetadata", () => ({
  modelMetadataService: {
    initialize: vi.fn().mockResolvedValue(undefined),
    findStandardModelName: vi.fn(),
    getCacheInfo: () => ({
      isLoaded: true,
      modelCount: 0,
      lastUpdated: Date.now(),
    }),
  },
}))

const listChannelsMock = vi.fn()
const updateChannelModelMappingMock = vi.fn()
const succeededMappingResult = {
  outcome: "succeeded" as const,
  data: undefined,
  confirmedEffects: [
    {
      kind: "model-mapping-updated" as const,
      resourceKind: "channel" as const,
      resourceId: 1,
    },
  ],
}

vi.mock("~/services/apiAdapters/registry", () => ({
  getSiteTypeCapabilities: (...args: unknown[]) =>
    getSiteTypeCapabilitiesMock(...args),
}))

vi.mock("~/services/managedSites/runtimeConfig", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("~/services/managedSites/runtimeConfig")
  >()),
  hasValidManagedSiteConfig: vi.fn(),
}))

vi.mock("~/services/preferences/userPreferences", () => ({
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
    const channel = { ref: modelResourceRef(1), modelMapping: "{}" } as any
    const service = {
      updateChannelModelMapping: vi.fn(),
    } as any

    await ModelRedirectService.applyModelMappingToChannel(channel, {}, service)

    expect(service.updateChannelModelMapping).not.toHaveBeenCalled()
  })

  it("should merge existing mapping JSON with new mapping", async () => {
    const channel = {
      ref: modelResourceRef(1),
      modelMapping: '{"gpt-4o":"old","custom":"keep"}',
    } as any
    const service = {
      updateChannelModelMapping: vi
        .fn()
        .mockResolvedValue(succeededMappingResult),
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
      ref: modelResourceRef(1),
      modelMapping: "invalid-json",
    } as any
    const service = {
      updateChannelModelMapping: vi
        .fn()
        .mockResolvedValue(succeededMappingResult),
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
      ref: modelResourceRef(1),
      modelMapping: '{"missing":"nope","keep":"ok"}',
    } as any
    const service = {
      updateChannelModelMapping: vi
        .fn()
        .mockResolvedValue(succeededMappingResult),
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
      ref: modelResourceRef(1),
      modelMapping: '{"keep":"ok"}',
    } as any
    const service = {
      updateChannelModelMapping: vi
        .fn()
        .mockResolvedValue(succeededMappingResult),
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
      ref: modelResourceRef(1),
      modelMapping:
        '{"gpt-4":"gpt-4o","gpt-4o":"gpt-4o-2024-05-13","keep":"gpt-4o-2024-05-13"}',
    } as any
    const service = {
      updateChannelModelMapping: vi
        .fn()
        .mockResolvedValue(succeededMappingResult),
    } as any

    const result = await ModelRedirectService.applyModelMappingToChannel(
      channel,
      {},
      service,
      {
        pruneMissingTargets: true,
        availableModels: ["gpt-4o-2024-05-13"],
        modelMappingPolicy: newApiManagedResourceModels.modelMappingPolicy,
      },
    )

    expect(result).toEqual({ updated: false, prunedCount: 0 })
    expect(service.updateChannelModelMapping).not.toHaveBeenCalled()
  })

  it("should prune New API cyclic targets when they cannot resolve to an available model", async () => {
    const channel = {
      ref: modelResourceRef(1),
      modelMapping: '{"a":"b","b":"a"}',
    } as any
    const service = {
      updateChannelModelMapping: vi
        .fn()
        .mockResolvedValue(succeededMappingResult),
    } as any

    const result = await ModelRedirectService.applyModelMappingToChannel(
      channel,
      {},
      service,
      {
        pruneMissingTargets: true,
        availableModels: ["ok"],
        modelMappingPolicy: newApiManagedResourceModels.modelMappingPolicy,
      },
    )

    expect(result).toEqual({ updated: true, prunedCount: 2 })
    expect(service.updateChannelModelMapping).toHaveBeenCalledWith(channel, {})
  })

  it("should treat '+target' as available on DoneHub sites", async () => {
    const channel = {
      ref: modelResourceRef(1),
      modelMapping: '{"gpt-4":"+gpt-4o"}',
    } as any
    const service = {
      updateChannelModelMapping: vi
        .fn()
        .mockResolvedValue(succeededMappingResult),
    } as any

    const result = await ModelRedirectService.applyModelMappingToChannel(
      channel,
      {},
      service,
      {
        pruneMissingTargets: true,
        availableModels: ["gpt-4o"],
        modelMappingPolicy: doneHubManagedResourceModels.modelMappingPolicy,
      },
    )

    expect(result).toEqual({ updated: false, prunedCount: 0 })
    expect(service.updateChannelModelMapping).not.toHaveBeenCalled()
  })

  it("should apply new mappings even when existing model_mapping is invalid JSON (no pruning)", async () => {
    const channel = {
      ref: modelResourceRef(1),
      modelMapping: "invalid-json",
    } as any
    const service = {
      updateChannelModelMapping: vi
        .fn()
        .mockResolvedValue(succeededMappingResult),
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
      ref: modelResourceRef(1),
      modelMapping: '{"missing":"nope"}',
    } as any
    const service = {
      updateChannelModelMapping: vi
        .fn()
        .mockResolvedValue(succeededMappingResult),
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

  it.each(["partial", "uncertain"] as const)(
    "refreshes the channel and rejects a non-replayable %s mapping write",
    async (outcome) => {
      const channel = { ref: modelResourceRef(1), modelMapping: "{}" } as any
      const service = {
        knownSecrets: [],
        knownSecretsComplete: true,
        updateChannelModelMapping: vi.fn().mockResolvedValue(
          outcome === "partial"
            ? {
                outcome,
                confirmedEffects: [
                  {
                    kind: "model-mapping-updated",
                    resourceKind: "channel",
                    resourceId: 1,
                  },
                ],
                completion: "uncertain",
                diagnostic: { message: `${outcome} mapping write` },
              }
            : {
                outcome,
                diagnostic: { message: `${outcome} mapping write` },
              },
        ),
        reconcileChannel: vi.fn().mockResolvedValue(undefined),
      } as any

      await expect(
        ModelRedirectService.applyModelMappingToChannel(
          channel,
          { "gpt-4o": "vendor/gpt-4o" },
          service,
        ),
      ).rejects.toThrow(`${outcome} mapping write`)

      expect(service.updateChannelModelMapping).toHaveBeenCalledOnce()
      expect(service.reconcileChannel).toHaveBeenCalledWith(channel)
    },
  )

  it("rejects an undefined mapping-writer result as an invalid mutation contract", async () => {
    const channel = { ref: modelResourceRef(1), modelMapping: "{}" } as any
    const service = {
      updateChannelModelMapping: vi.fn().mockResolvedValue(undefined),
    } as any

    await expect(
      ModelRedirectService.applyModelMappingToChannel(
        channel,
        { "gpt-4o": "vendor/gpt-4o" },
        service,
      ),
    ).rejects.toThrow("Invalid managed site mutation result")
  })
})

describe("ModelRedirectService.applyModelRedirect", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    updateChannelModelMappingMock.mockResolvedValue(succeededMappingResult)
    resolveManagedUpstreamResourceFeatureCapabilitiesMock.mockReturnValue({
      supported: false,
      siteType: SITE_TYPES.NEW_API,
      feature: "modelRedirect",
      reason: "feature-slice-disabled",
    })
    getSiteTypeCapabilitiesMock.mockReturnValue({
      managedSites: {
        models: {
          list: listChannelsMock,
          updateModelMapping: updateChannelModelMappingMock,
        },
      },
    })
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
        userId: "1",
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
        userId: "1",
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
        ref: modelResourceRef(1),
        name: "active-channel",
        disabled: false,
        models: ["openai/gpt-4o"],
      },
      {
        ref: modelResourceRef(2),
        name: "disabled-manual",
        disabled: true,
        models: ["openai/gpt-4o"],
      },
      {
        ref: modelResourceRef(3),
        name: "disabled-auto",
        disabled: true,
        models: ["openai/gpt-4o"],
      },
    ]

    listChannelsMock.mockResolvedValue({ items: channels })

    const mappingSpy = vi.spyOn(
      ModelRedirectService,
      "generateModelMappingForChannel",
    )
    mappingSpy.mockReturnValue({ "gpt-4o": "openai/gpt-4o" })

    const result = await ModelRedirectService.applyModelRedirect()

    expect(result).toMatchObject({
      success: true,
      updatedChannels: 1,
      errors: [],
    })
    expect(updateChannelModelMappingMock).toHaveBeenCalledWith(
      expect.objectContaining({ baseUrl: "https://example.com" }),
      modelResourceRef(1),
      ["openai/gpt-4o", "gpt-4o"],
      { "gpt-4o": "openai/gpt-4o" },
    )
  })

  it.each(["partial", "uncertain"] as const)(
    "refreshes channel inventory and counts a %s write as failed without replay",
    async (outcome) => {
      mockedHasValidConfig.mockReturnValue(true)
      mockedUserPreferences.getPreferences.mockResolvedValue({
        newApi: {
          baseUrl: "https://example.com",
          adminToken: "token",
          userId: "1",
        },
        modelRedirect: {
          ...DEFAULT_MODEL_REDIRECT_PREFERENCES,
          enabled: true,
          standardModels: ["gpt-4o"],
        },
      } as any)
      const channel = {
        ref: modelResourceRef(1),
        name: "uncertain-channel",
        disabled: false,
        models: ["vendor/gpt-4o"],
        modelMapping: "{}",
      }
      listChannelsMock.mockResolvedValue({ items: [channel] })
      vi.spyOn(
        ModelRedirectService,
        "generateModelMappingForChannel",
      ).mockReturnValue({ "gpt-4o": "vendor/gpt-4o" })
      updateChannelModelMappingMock.mockResolvedValue(
        outcome === "partial"
          ? {
              outcome,
              confirmedEffects: [
                {
                  kind: "model-mapping-updated",
                  resourceKind: "channel",
                  resourceId: 1,
                },
              ],
              completion: "uncertain",
              diagnostic: { message: `${outcome} mapping write` },
            }
          : {
              outcome,
              diagnostic: { message: `${outcome} mapping write` },
            },
      )

      const result = await ModelRedirectService.applyModelRedirect()

      expect(updateChannelModelMappingMock).toHaveBeenCalledOnce()
      expect(listChannelsMock).toHaveBeenCalledTimes(2)
      expect(result).toMatchObject({
        success: false,
        updatedChannels: 0,
      })
      expect(result.errors.join(" ")).toContain(
        "Model mapping update requires reconciliation",
      )
    },
  )

  it("redacts a config secret cleared by a rejected direct mapping adapter", async () => {
    const originalSecret = "MarbleCobaltFjord927"
    const mutableConfig = {
      baseUrl: "https://example.com",
      adminToken: originalSecret,
      userId: "1",
    }
    mockedHasValidConfig.mockReturnValue(true)
    mockedUserPreferences.getPreferences.mockResolvedValue({
      newApi: mutableConfig,
      modelRedirect: {
        ...DEFAULT_MODEL_REDIRECT_PREFERENCES,
        enabled: true,
        standardModels: ["gpt-4o"],
      },
    } as any)
    listChannelsMock.mockResolvedValue({
      items: [
        {
          ref: modelResourceRef(1),
          name: "rejected-channel",
          disabled: false,
          models: ["vendor/gpt-4o"],
          modelMapping: "{}",
        },
      ],
    })
    vi.spyOn(
      ModelRedirectService,
      "generateModelMappingForChannel",
    ).mockReturnValue({ "gpt-4o": "vendor/gpt-4o" })
    updateChannelModelMappingMock.mockImplementation(async (config) => {
      config.adminToken = ""
      return {
        outcome: "rejected",
        diagnostic: {
          message: `mapping rejected ${originalSecret}`,
          code: "upstream_rejected",
        },
      }
    })

    const result = await ModelRedirectService.applyModelRedirect()

    expect(result).toMatchObject({
      success: false,
      updatedChannels: 0,
    })
    expect(result.errors.join(" ")).toContain(
      "Model mapping update was rejected",
    )
    expect(result.errors.join(" ")).not.toContain(originalSecret)
    expect(mutableConfig.adminToken).toBe("")
    expect(updateChannelModelMappingMock).toHaveBeenCalledOnce()
  })

  it.each([
    { outcome: "rejected", credential: "channel-secret" },
    { outcome: "rejected", credential: "********" },
    { outcome: "uncertain", credential: undefined },
    { outcome: "uncertain", credential: "channel-secret" },
  ] as const)(
    "does not expose provider diagnostics for a $outcome projected channel with credential $credential",
    async ({ outcome, credential }) => {
      mockedHasValidConfig.mockReturnValue(true)
      mockedUserPreferences.getPreferences.mockResolvedValue({
        newApi: {
          baseUrl: "https://example.com",
          adminToken: "admin-secret",
          userId: "1",
        },
        modelRedirect: {
          ...DEFAULT_MODEL_REDIRECT_PREFERENCES,
          enabled: true,
          standardModels: ["gpt-4o"],
        },
      } as any)
      listChannelsMock.mockResolvedValue({
        items: [
          {
            ref: modelResourceRef(1),
            name: "channel",
            disabled: false,
            credential,
            models: ["vendor/gpt-4o"],
            modelMapping: "{}",
          },
        ],
      })
      vi.spyOn(
        ModelRedirectService,
        "generateModelMappingForChannel",
      ).mockReturnValue({ "gpt-4o": "vendor/gpt-4o" })
      updateChannelModelMappingMock.mockResolvedValue({
        outcome,
        diagnostic: {
          message:
            "provider failure admin-secret channel-secret hidden-header-secret",
        },
      })
      const result = await ModelRedirectService.applyModelRedirect()
      expect(result.success).toBe(false)
      expect(result.errors.join(" ")).toContain(
        outcome === "rejected"
          ? "Model mapping update was rejected"
          : "Model mapping update requires reconciliation",
      )
      expect(JSON.stringify(result)).not.toMatch(
        /admin-secret|channel-secret|hidden-header-secret|provider failure/,
      )
      expect(updateChannelModelMappingMock).toHaveBeenCalledOnce()
    },
  )

  it("deduplicates normalized existing and appended models before direct writes", async () => {
    mockedUserPreferences.getPreferences.mockResolvedValue({
      newApi: {
        baseUrl: "https://example.com",
        adminToken: "token",
        userId: "1",
      },
      modelRedirect: {
        ...DEFAULT_MODEL_REDIRECT_PREFERENCES,
        enabled: true,
        standardModels: ["alpha"],
      },
    } as any)
    listChannelsMock.mockResolvedValue({
      items: [
        {
          ref: modelResourceRef(1),
          name: "active-channel",
          disabled: false,
          models: ["alpha", "alpha", "beta", "alpha"],
        },
      ],
    })
    vi.spyOn(
      ModelRedirectService,
      "generateModelMappingForChannel",
    ).mockReturnValue({ " alpha ": "vendor/alpha", gamma: "vendor/gamma" })

    await ModelRedirectService.applyModelRedirect()

    expect(updateChannelModelMappingMock).toHaveBeenCalledWith(
      expect.objectContaining({ baseUrl: "https://example.com" }),
      modelResourceRef(1),
      ["alpha", "beta", "gamma"],
      { " alpha ": "vendor/alpha", gamma: "vendor/gamma" },
    )
  })

  it("rejects search-only capabilities for preview and apply", async () => {
    const searchChannelsMock = vi.fn().mockResolvedValue({ items: [] })
    getSiteTypeCapabilitiesMock.mockReturnValue({
      managedSites: {
        models: {
          search: searchChannelsMock,
          updateModelMapping: updateChannelModelMappingMock,
        },
      },
    })
    mockedUserPreferences.getPreferences.mockResolvedValue({
      newApi: {
        baseUrl: "https://example.com",
        adminToken: "token",
        userId: "1",
      },
      modelRedirect: {
        ...DEFAULT_MODEL_REDIRECT_PREFERENCES,
        enabled: true,
      },
    } as any)

    await expect(
      ModelRedirectService.listManagedSiteChannels(),
    ).resolves.toMatchObject({
      success: false,
      channels: [],
      message: "Model redirect is not supported for this managed site",
    })
    await expect(
      ModelRedirectService.applyModelRedirect(),
    ).resolves.toMatchObject({
      success: false,
      updatedChannels: 0,
      message: "Model redirect is not supported for this managed site",
    })
    expect(searchChannelsMock).not.toHaveBeenCalled()
    expect(updateChannelModelMappingMock).not.toHaveBeenCalled()
  })

  it("should collect errors when applying mapping fails for a channel", async () => {
    mockedHasValidConfig.mockReturnValue(true)
    mockedUserPreferences.getPreferences.mockResolvedValue({
      newApi: {
        baseUrl: "https://example.com",
        adminToken: "token",
        userId: "1",
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
        ref: modelResourceRef(1),
        name: "active-channel",
        disabled: false,
        models: ["openai/gpt-4o"],
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
