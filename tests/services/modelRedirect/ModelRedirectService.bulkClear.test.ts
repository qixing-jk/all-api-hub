import { beforeEach, describe, expect, it, vi } from "vitest"

import { NEW_API } from "~/constants/siteType"
import { ModelRedirectService } from "~/services/modelRedirect/ModelRedirectService"
import { userPreferences } from "~/services/userPreferences"
import {
  getManagedSiteAdminConfig,
  getManagedSiteConfig,
} from "~/utils/managedSite"

const listChannelsMock = vi.fn()
const updateChannelModelMappingMock = vi.fn()

vi.mock("~/services/modelSync", () => {
  class ModelSyncServiceMock {
    listChannels = listChannelsMock
    updateChannelModelMapping = updateChannelModelMappingMock
  }

  return {
    ModelSyncService: ModelSyncServiceMock,
  }
})

vi.mock("~/services/userPreferences", () => ({
  userPreferences: {
    getPreferences: vi.fn(),
  },
}))

vi.mock("~/utils/managedSite", () => ({
  getManagedSiteAdminConfig: vi.fn(),
  getManagedSiteConfig: vi.fn(),
}))
const mockedUserPreferences = userPreferences as unknown as {
  getPreferences: ReturnType<typeof vi.fn>
}
const mockedGetManagedSiteAdminConfig =
  getManagedSiteAdminConfig as unknown as ReturnType<typeof vi.fn>
const mockedGetManagedSiteConfig =
  getManagedSiteConfig as unknown as ReturnType<typeof vi.fn>

describe("ModelRedirectService.clearChannelModelMappings", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedUserPreferences.getPreferences.mockResolvedValue({})
    mockedGetManagedSiteAdminConfig.mockReturnValue({
      baseUrl: "https://example.com",
      adminToken: "token",
      userId: "1",
    })
    mockedGetManagedSiteConfig.mockReturnValue({
      siteType: NEW_API,
      config: {
        baseUrl: "https://example.com",
        adminToken: "token",
        userId: "1",
      },
    })
  })

  it("returns a clear error when managed site config is missing", async () => {
    mockedGetManagedSiteAdminConfig.mockReturnValue(null)

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
