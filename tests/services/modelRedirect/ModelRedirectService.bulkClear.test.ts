import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { ModelRedirectService } from "~/services/models/modelRedirect/ModelRedirectService"
import { userPreferences } from "~/services/preferences/userPreferences"

const { resolveManagedUpstreamResourceFeatureCapabilitiesMock } = vi.hoisted(
  () => ({
    resolveManagedUpstreamResourceFeatureCapabilitiesMock: vi.fn(),
  }),
)

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

describe("ModelRedirectService.clearChannelModelMappings", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resolveManagedUpstreamResourceFeatureCapabilitiesMock.mockReturnValue({
      supported: false,
      siteType: SITE_TYPES.NEW_API,
      feature: "modelRedirect",
      reason: "feature-slice-disabled",
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
    updateChannelModelMappingMock.mockResolvedValue(undefined)

    const result = await ModelRedirectService.clearChannelModelMappings([1, 2])

    expect(result.success).toBe(true)
    expect(result.totalSelected).toBe(2)
    expect(result.clearedChannels).toBe(2)
    expect(result.failedChannels).toBe(0)
    expect(updateChannelModelMappingMock).toHaveBeenCalledTimes(2)
    expect(updateChannelModelMappingMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1 }),
      {},
    )
    expect(updateChannelModelMappingMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: 2 }),
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
    updateChannelModelMappingMock.mockResolvedValue(undefined)

    const result = await ModelRedirectService.clearChannelModelMappings([1, 2])

    expect(result.success).toBe(true)
    expect(result.totalSelected).toBe(2)
    expect(result.clearedChannels).toBe(1)
    expect(result.skippedChannels).toBe(1)
    expect(result.failedChannels).toBe(0)
    expect(updateChannelModelMappingMock).toHaveBeenCalledTimes(1)
    expect(updateChannelModelMappingMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: 2 }),
      {},
    )
    expect(updateChannelModelMappingMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ id: 1 }),
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
        update: vi.fn().mockResolvedValue({ success: true }),
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
      .mockResolvedValueOnce(undefined)

    const result = await ModelRedirectService.clearChannelModelMappings([1, 2])

    expect(result.success).toBe(false)
    expect(result.clearedChannels).toBe(1)
    expect(result.failedChannels).toBe(1)
    expect(result.errors.join(" ")).toContain("boom")
    expect(result.results).toHaveLength(2)
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
