import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { ModelRedirectService } from "~/services/models/modelRedirect/ModelRedirectService"
import { userPreferences } from "~/services/preferences/userPreferences"

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

vi.mock("~/services/managedSites/managedUpstreamResourceService", () => ({
  resolveManagedUpstreamResourceFeatureCapabilities: (...args: unknown[]) =>
    resolveManagedUpstreamResourceFeatureCapabilitiesMock(...args),
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
        channels: {
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

    const result = await ModelRedirectService.clearChannelModelMappings([1, 2])

    expect(result.success).toBe(false)
    expect(result.totalSelected).toBe(2)
    expect(result.clearedChannels).toBe(0)
    expect(result.failedChannels).toBe(2)
    expect(result.errors[0]).toContain("Managed site configuration is missing")
  })

  it("lists the complete managed-site channel inventory", async () => {
    const channels = [
      { id: 1, name: "Example channel", models: "model-a,model-b" },
    ]
    listChannelsMock.mockResolvedValue({ items: channels })

    await expect(
      ModelRedirectService.listManagedSiteChannels(),
    ).resolves.toEqual({
      success: true,
      channels,
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
        channels: {
          search: searchChannelsMock,
          updateModelMapping: updateChannelModelMappingMock,
        },
      },
    })

    const result = await ModelRedirectService.clearChannelModelMappings([1, 2])

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
          id: 1,
          name: "c1",
          models: "a,b",
          model_mapping: '{"gpt-4o":"openai/gpt-4o"}',
        },
        { id: 2, name: "c2", models: "a,b", model_mapping: '{"x":"y"}' },
      ],
    })
    updateChannelModelMappingMock.mockResolvedValue(succeededMappingResult)

    const result = await ModelRedirectService.clearChannelModelMappings([1, 2])

    expect(result.success).toBe(true)
    expect(result.totalSelected).toBe(2)
    expect(result.clearedChannels).toBe(2)
    expect(result.failedChannels).toBe(0)
    expect(updateChannelModelMappingMock).toHaveBeenCalledTimes(2)
    expect(updateChannelModelMappingMock).toHaveBeenCalledWith(
      expect.objectContaining({ baseUrl: "https://example.com" }),
      1,
      ["a", "b"],
      {},
    )
    expect(updateChannelModelMappingMock).toHaveBeenCalledWith(
      expect.objectContaining({ baseUrl: "https://example.com" }),
      2,
      ["a", "b"],
      {},
    )
  })

  it("counts empty model_mapping channels as skipped and does not update them", async () => {
    listChannelsMock.mockResolvedValue({
      items: [
        { id: 1, name: "empty", models: "a,b", model_mapping: "{}" },
        { id: 2, name: "non-empty", models: "a,b", model_mapping: '{"x":"y"}' },
      ],
    })
    updateChannelModelMappingMock.mockResolvedValue(succeededMappingResult)

    const result = await ModelRedirectService.clearChannelModelMappings([1, 2])

    expect(result.success).toBe(true)
    expect(result.totalSelected).toBe(2)
    expect(result.clearedChannels).toBe(1)
    expect(result.skippedChannels).toBe(1)
    expect(result.failedChannels).toBe(0)
    expect(updateChannelModelMappingMock).toHaveBeenCalledTimes(1)
    expect(updateChannelModelMappingMock).toHaveBeenCalledWith(
      expect.objectContaining({ baseUrl: "https://example.com" }),
      2,
      ["a", "b"],
      {},
    )
    expect(updateChannelModelMappingMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ baseUrl: "https://example.com" }),
      1,
      expect.anything(),
      {},
    )
  })

  it("uses resource detail drafts for clear writes when the resource feature is supported", async () => {
    const channel = {
      id: 1,
      name: "c1",
      models: "a,b",
      model_mapping: '{"gpt-4o":"openai/gpt-4o"}',
    }
    listChannelsMock.mockResolvedValue({
      items: [channel],
    })

    const detail = {
      summary: {
        ref: {
          managedSiteType: SITE_TYPES.NEW_API,
          scopeKey: "https://example.com",
          resourceId: "1",
        },
      },
      native: {
        ...channel,
        key: "sk-real-key",
      },
    }
    const resources = {
      items: {
        list: vi.fn().mockResolvedValue({
          items: [detail.summary],
          total: 1,
        }),
        getDetail: vi.fn().mockResolvedValue(detail),
        update: vi.fn().mockResolvedValue(succeededMappingResult),
      },
      drafts: {
        prepareEditDraft: vi.fn().mockReturnValue({
          name: "c1",
          type: 1,
          key: "sk-real-key",
          base_url: "https://upstream.example.invalid",
          models: ["a", "b"],
          groups: [],
          priority: 0,
          weight: 1,
          status: 1,
        }),
      },
    }
    resolveManagedUpstreamResourceFeatureCapabilitiesMock.mockReturnValue({
      supported: true,
      siteType: SITE_TYPES.NEW_API,
      feature: "modelRedirect",
      capabilities: resources,
    })

    const result = await ModelRedirectService.clearChannelModelMappings([1])

    expect(result.success).toBe(true)
    expect(result.clearedChannels).toBe(1)
    expect(updateChannelModelMappingMock).not.toHaveBeenCalled()
    expect(resources.items.update).toHaveBeenCalledWith(
      expect.objectContaining({ baseUrl: "https://example.com" }),
      expect.objectContaining({
        native: expect.objectContaining({
          model_mapping: "{}",
          models: "a,b",
          key: "sk-real-key",
        }),
      }),
      expect.objectContaining({
        models: ["a", "b"],
        key: "sk-real-key",
      }),
    )
  })

  it("continues on partial failures and reports per-channel errors", async () => {
    listChannelsMock.mockResolvedValue({
      items: [
        {
          id: 1,
          name: "c1",
          models: "a,b",
          model_mapping: '{"gpt-4o":"openai/gpt-4o"}',
        },
        { id: 2, name: "c2", models: "a,b", model_mapping: '{"x":"y"}' },
      ],
    })

    updateChannelModelMappingMock
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce(succeededMappingResult)

    const result = await ModelRedirectService.clearChannelModelMappings([1, 2])

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
            id: 1,
            name: "c1",
            models: "a,b",
            model_mapping: '{"x":"y"}',
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

      const result = await ModelRedirectService.clearChannelModelMappings([1])

      expect(updateChannelModelMappingMock).toHaveBeenCalledOnce()
      expect(listChannelsMock).toHaveBeenCalledTimes(2)
      expect(result).toMatchObject({
        success: false,
        clearedChannels: 0,
        failedChannels: 1,
      })
      expect(result.errors.join(" ")).toContain(`${outcome} clear write`)
    },
  )

  it("uses a no-op reconciliation when an injected writer omits the optional hook", async () => {
    const channel = {
      id: 1,
      name: "optional-reconcile",
      models: "a,b",
      model_mapping: '{"x":"y"}',
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
      const result = await ModelRedirectService.clearChannelModelMappings([1])

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
          id: 1,
          name: "c1",
          models: "a,b",
          model_mapping: '{"x":"y"}',
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

    const result = await ModelRedirectService.clearChannelModelMappings([1])

    expect(result).toMatchObject({
      success: false,
      clearedChannels: 0,
      failedChannels: 1,
    })
    expect(result.errors.join(" ")).toContain("clear rejected")
    expect(result.errors.join(" ")).not.toContain(originalSecret)
    expect(mutableConfig.adminToken).toBe("")
    expect(updateChannelModelMappingMock).toHaveBeenCalledOnce()
  })

  it("counts an undefined clear-writer result as an invalid mutation contract", async () => {
    listChannelsMock.mockResolvedValue({
      items: [
        {
          id: 1,
          name: "c1",
          models: "a,b",
          model_mapping: '{"x":"y"}',
        },
      ],
    })
    updateChannelModelMappingMock.mockResolvedValue(undefined)

    const result = await ModelRedirectService.clearChannelModelMappings([1])

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
      items: [{ id: 1, name: "c1", models: "a,b" }],
    })

    const result = await ModelRedirectService.clearChannelModelMappings([
      1, 999,
    ])

    expect(result.success).toBe(false)
    expect(result.failedChannels).toBe(1)
    expect(result.errors.join(" ")).toContain("Channel not found")
  })
})
