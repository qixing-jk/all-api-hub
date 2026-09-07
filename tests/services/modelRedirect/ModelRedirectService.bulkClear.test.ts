import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { ModelRedirectService } from "~/services/models/modelRedirect/ModelRedirectService"
import { userPreferences } from "~/services/preferences/userPreferences"
import { modelResourceRef } from "~~/tests/test-utils/managedModelResource"

const {
  getSiteTypeCapabilitiesMock,
  resolveManagedUpstreamResourceFeatureCapabilitiesMock,
} = vi.hoisted(() => ({
  getSiteTypeCapabilitiesMock: vi.fn(),
  resolveManagedUpstreamResourceFeatureCapabilitiesMock: vi.fn(),
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

vi.mock("~/services/preferences/userPreferences", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("~/services/preferences/userPreferences")
    >()
  return {
    ...actual,
    userPreferences: {
      ...actual.userPreferences,
      getPreferences: vi.fn(),
    },
  }
})

const mockedUserPreferences = userPreferences as unknown as {
  getPreferences: ReturnType<typeof vi.fn>
}

describe("ModelRedirectService managed channel operations", () => {
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
    mockedUserPreferences.getPreferences.mockResolvedValue({
      managedSiteType: SITE_TYPES.NEW_API,
      newApi: {
        baseUrl: "https://example.com",
        adminToken: "token",
        userId: "1",
      },
    })
  })

  it("returns a clear error when managed site config is missing", async () => {
    mockedUserPreferences.getPreferences.mockResolvedValueOnce({
      managedSiteType: SITE_TYPES.NEW_API,
      newApi: {
        baseUrl: "",
        adminToken: "",
        userId: "",
      },
    })

    const result = await ModelRedirectService.clearChannelModelMappings([
      modelResourceRef(1),
      modelResourceRef(2),
    ])

    expect(result.success).toBe(false)
    expect(result.totalSelected).toBe(2)
    expect(result.clearedChannels).toBe(0)
    expect(result.failedChannels).toBe(2)
    expect(result.errors[0]).toContain("Managed site configuration is missing")
  })

  it("lists mapping preview facts without disclosing execution credentials", async () => {
    const channels = [
      {
        ref: modelResourceRef(1),
        name: "Example channel",
        models: ["model-a", "model-b"],
        credential: "private-key",
        modelMapping: '{"model-a":"remote-a"}',
      },
    ]
    listChannelsMock.mockResolvedValue({ items: channels })

    await expect(
      ModelRedirectService.listManagedSiteChannels(),
    ).resolves.toEqual({
      success: true,
      channels: [
        {
          ref: modelResourceRef(1),
          name: "Example channel",
          modelMapping: '{"model-a":"remote-a"}',
        },
      ],
      errors: [],
    })
    expect(listChannelsMock).toHaveBeenCalledWith(
      expect.objectContaining({ baseUrl: "https://example.com" }),
    )
  })

  it("rejects search-only capabilities without clearing a partial channel inventory", async () => {
    const searchChannelsMock = vi.fn().mockResolvedValue({ items: [] })
    getSiteTypeCapabilitiesMock.mockReturnValue({
      managedSites: {
        models: {
          search: searchChannelsMock,
          updateModelMapping: updateChannelModelMappingMock,
        },
      },
    })

    const result = await ModelRedirectService.clearChannelModelMappings([
      modelResourceRef(1),
      modelResourceRef(2),
    ])

    expect(result).toMatchObject({
      success: false,
      totalSelected: 2,
      clearedChannels: 0,
      failedChannels: 2,
      message: "Model redirect is not supported for this managed site",
    })
    expect(searchChannelsMock).not.toHaveBeenCalled()
    expect(updateChannelModelMappingMock).not.toHaveBeenCalled()
  })

  it("clears model mappings for all selected channels", async () => {
    listChannelsMock.mockResolvedValue({
      items: [
        {
          ref: modelResourceRef(1),
          name: "c1",
          models: ["a", "b"],
          modelMapping: '{"gpt-4o":"openai/gpt-4o"}',
        },
        {
          ref: modelResourceRef(2),
          name: "c2",
          models: ["a", "b"],
          modelMapping: '{"x":"y"}',
        },
      ],
    })
    updateChannelModelMappingMock.mockResolvedValue(succeededMappingResult)

    const result = await ModelRedirectService.clearChannelModelMappings([
      modelResourceRef(1),
      modelResourceRef(2),
    ])

    expect(result.success).toBe(true)
    expect(result.totalSelected).toBe(2)
    expect(result.clearedChannels).toBe(2)
    expect(result.failedChannels).toBe(0)
    expect(updateChannelModelMappingMock).toHaveBeenCalledTimes(2)
    expect(updateChannelModelMappingMock).toHaveBeenCalledWith(
      expect.objectContaining({ baseUrl: "https://example.com" }),
      modelResourceRef(1),
      ["a", "b"],
      {},
    )
    expect(updateChannelModelMappingMock).toHaveBeenCalledWith(
      expect.objectContaining({ baseUrl: "https://example.com" }),
      modelResourceRef(2),
      ["a", "b"],
      {},
    )
  })

  it("counts empty model_mapping channels as skipped and does not update them", async () => {
    listChannelsMock.mockResolvedValue({
      items: [
        {
          ref: modelResourceRef(1),
          name: "empty",
          models: ["a", "b"],
          modelMapping: "{}",
        },
        {
          ref: modelResourceRef(2),
          name: "non-empty",
          models: ["a", "b"],
          modelMapping: '{"x":"y"}',
        },
      ],
    })
    updateChannelModelMappingMock.mockResolvedValue(succeededMappingResult)

    const result = await ModelRedirectService.clearChannelModelMappings([
      modelResourceRef(1),
      modelResourceRef(2),
    ])

    expect(result.success).toBe(true)
    expect(result.totalSelected).toBe(2)
    expect(result.clearedChannels).toBe(1)
    expect(result.skippedChannels).toBe(1)
    expect(result.failedChannels).toBe(0)
    expect(updateChannelModelMappingMock).toHaveBeenCalledTimes(1)
    expect(updateChannelModelMappingMock).toHaveBeenCalledWith(
      expect.objectContaining({ baseUrl: "https://example.com" }),
      modelResourceRef(2),
      ["a", "b"],
      {},
    )
    expect(updateChannelModelMappingMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ baseUrl: "https://example.com" }),
      modelResourceRef(1),
      expect.anything(),
      {},
    )
  })

  it("continues on partial failures and reports per-channel errors", async () => {
    listChannelsMock.mockResolvedValue({
      items: [
        {
          ref: modelResourceRef(1),
          name: "c1",
          models: ["a", "b"],
          modelMapping: '{"gpt-4o":"openai/gpt-4o"}',
        },
        {
          ref: modelResourceRef(2),
          name: "c2",
          models: ["a", "b"],
          modelMapping: '{"x":"y"}',
        },
      ],
    })

    updateChannelModelMappingMock
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce(succeededMappingResult)

    const result = await ModelRedirectService.clearChannelModelMappings([
      modelResourceRef(1),
      modelResourceRef(2),
    ])

    expect(result.success).toBe(false)
    expect(result.clearedChannels).toBe(1)
    expect(result.failedChannels).toBe(1)
    expect(result.errors.join(" ")).toContain("boom")
    expect(result.results).toHaveLength(2)
  })

  it.each(["partial", "uncertain"] as const)(
    "refreshes channel inventory and never replays a %s clear write",
    async (outcome) => {
      listChannelsMock.mockResolvedValue({
        items: [
          {
            ref: modelResourceRef(1),
            name: "c1",
            models: ["a", "b"],
            modelMapping: '{"x":"y"}',
          },
        ],
      })
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
              diagnostic: { message: `${outcome} clear write` },
            }
          : {
              outcome,
              diagnostic: { message: `${outcome} clear write` },
            },
      )

      const result = await ModelRedirectService.clearChannelModelMappings([
        modelResourceRef(1),
      ])

      expect(updateChannelModelMappingMock).toHaveBeenCalledOnce()
      expect(listChannelsMock).toHaveBeenCalledTimes(2)
      expect(result).toMatchObject({
        success: false,
        clearedChannels: 0,
        failedChannels: 1,
      })
      expect(result.errors.join(" ")).toContain(
        "Model mapping update requires reconciliation",
      )
    },
  )

  it("uses a no-op reconciliation when an injected writer omits the optional hook", async () => {
    const channel = {
      ref: modelResourceRef(1),
      name: "optional-reconcile",
      models: ["a", "b"],
      modelMapping: '{"x":"y"}',
    }
    const updateChannelModelMapping = vi.fn().mockResolvedValue({
      outcome: "uncertain",
      diagnostic: { message: "clear state uncertain" },
    })
    listChannelsMock.mockResolvedValue({ items: [channel] })
    const writerFactorySpy = vi
      .spyOn(ModelRedirectService as any, "createModelMappingWriter")
      .mockReturnValue({
        knownSecrets: [],
        knownSecretsComplete: true,
        updateChannelModelMapping,
      })

    try {
      const result = await ModelRedirectService.clearChannelModelMappings([
        modelResourceRef(1),
      ])

      expect(result).toMatchObject({
        success: false,
        clearedChannels: 0,
        failedChannels: 1,
      })
      expect(result.errors.join(" ")).toContain("clear state uncertain")
      expect(updateChannelModelMapping).toHaveBeenCalledOnce()
    } finally {
      writerFactorySpy.mockRestore()
    }
  })

  it("redacts a config secret cleared by a rejected direct clear adapter", async () => {
    const originalSecret = "WillowAmberQuartz418"
    const mutableConfig = {
      baseUrl: "https://example.com",
      adminToken: originalSecret,
      userId: "1",
    }
    mockedUserPreferences.getPreferences.mockResolvedValue({
      managedSiteType: SITE_TYPES.NEW_API,
      newApi: mutableConfig,
    })
    listChannelsMock.mockResolvedValue({
      items: [
        {
          ref: modelResourceRef(1),
          name: "c1",
          models: ["a", "b"],
          modelMapping: '{"x":"y"}',
        },
      ],
    })
    updateChannelModelMappingMock.mockImplementation(async (config) => {
      config.adminToken = ""
      return {
        outcome: "rejected",
        diagnostic: {
          message: `clear rejected ${originalSecret}`,
          code: "upstream_rejected",
        },
      }
    })

    const result = await ModelRedirectService.clearChannelModelMappings([
      modelResourceRef(1),
    ])

    expect(result).toMatchObject({
      success: false,
      clearedChannels: 0,
      failedChannels: 1,
    })
    expect(result.errors.join(" ")).toContain(
      "Model mapping update was rejected",
    )
    expect(result.errors.join(" ")).not.toContain(originalSecret)
    expect(mutableConfig.adminToken).toBe("")
    expect(updateChannelModelMappingMock).toHaveBeenCalledOnce()
  })

  it("counts an undefined clear-writer result as an invalid mutation contract", async () => {
    listChannelsMock.mockResolvedValue({
      items: [
        {
          ref: modelResourceRef(1),
          name: "c1",
          models: ["a", "b"],
          modelMapping: '{"x":"y"}',
        },
      ],
    })
    updateChannelModelMappingMock.mockResolvedValue(undefined)

    const result = await ModelRedirectService.clearChannelModelMappings([
      modelResourceRef(1),
    ])

    expect(result).toMatchObject({
      success: false,
      clearedChannels: 0,
      failedChannels: 1,
    })
    expect(result.errors.join(" ")).toContain(
      "Invalid managed site mutation result",
    )
  })

  it("reports missing channels as failures", async () => {
    listChannelsMock.mockResolvedValue({
      items: [{ ref: modelResourceRef(1), name: "c1", models: ["a", "b"] }],
    })

    const result = await ModelRedirectService.clearChannelModelMappings([
      modelResourceRef(1),
      modelResourceRef(999),
    ])

    expect(result.success).toBe(false)
    expect(result.failedChannels).toBe(1)
    expect(result.errors.join(" ")).toContain("Channel not found")
  })

  it("preserves opaque references when clearing mappings", async () => {
    const ref = modelResourceRef("provider/key:alpha")
    listChannelsMock.mockResolvedValue({
      items: [
        {
          ref,
          name: "Opaque",
          models: ["model-a"],
          modelMapping: '{"a":"b"}',
        },
      ],
    })

    const result = await ModelRedirectService.clearChannelModelMappings([ref])

    expect(result).toMatchObject({
      success: true,
      clearedChannels: 1,
      results: [{ resourceRef: ref, success: true }],
    })
    expect(updateChannelModelMappingMock).toHaveBeenCalledWith(
      expect.any(Object),
      ref,
      ["model-a"],
      {},
    )
  })

  it.each([
    modelResourceRef(1, { scopeKey: "https://other.example" }),
    modelResourceRef(1, { siteType: SITE_TYPES.VELOERA }),
  ])(
    "rejects a foreign selection before listing or writing",
    async (foreignRef) => {
      const result = await ModelRedirectService.clearChannelModelMappings([
        modelResourceRef(1),
        foreignRef,
      ])

      expect(result.success).toBe(false)
      expect(listChannelsMock).not.toHaveBeenCalled()
      expect(updateChannelModelMappingMock).not.toHaveBeenCalled()
    },
  )

  it("rejects a foreign inventory before clearing any mappings", async () => {
    listChannelsMock.mockResolvedValue({
      items: [
        {
          ref: modelResourceRef(1),
          name: "Current",
          models: ["a"],
          modelMapping: '{"a":"b"}',
        },
        {
          ref: modelResourceRef(1, { scopeKey: "https://other.example" }),
          name: "Other",
          models: ["a"],
          modelMapping: '{"a":"b"}',
        },
      ],
    })

    const result = await ModelRedirectService.clearChannelModelMappings([
      modelResourceRef(1),
    ])

    expect(result.success).toBe(false)
    expect(updateChannelModelMappingMock).not.toHaveBeenCalled()
  })
})
