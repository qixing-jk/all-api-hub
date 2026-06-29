import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  buildChannelName,
  buildChannelPayload,
  checkValidOctopusConfig,
  fetchAvailableModels,
  prepareChannelFormData,
} from "~/services/managedSites/providers/octopus"
import { OctopusOutboundType } from "~/types/octopus"

const octopusApi = vi.hoisted(() => ({
  listChannels: vi.fn(),
  searchChannels: vi.fn(),
  createChannel: vi.fn(),
  updateChannel: vi.fn(),
  deleteChannel: vi.fn(),
  fetchGroups: vi.fn(),
  fetchAvailableModels: vi.fn(),
}))

const userPreferences = vi.hoisted(() => ({
  getPreferences: vi.fn(),
}))

vi.mock("~/services/apiService/octopus", () => ({
  ...octopusApi,
}))

vi.mock("~/services/preferences/userPreferences", () => ({
  userPreferences,
}))

describe("Octopus managed-site channel capability", () => {
  const config = {
    baseUrl: "https://octopus.example.invalid",
    username: "admin",
    password: "password",
  }
  const octopusChannel = {
    id: 7,
    name: "Octopus channel",
    type: OctopusOutboundType.OpenAIChat,
    enabled: true,
    base_urls: [{ url: "https://upstream.example.invalid/v1" }],
    keys: [{ enabled: true, channel_key: "sk-test" }],
    model: "gpt-4o",
    proxy: false,
    auto_sync: true,
    auto_group: 0,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    userPreferences.getPreferences.mockResolvedValue({
      octopus: config,
    })
  })

  it("normalizes direct Octopus search and list results to managed-site channel list data", async () => {
    octopusApi.searchChannels.mockResolvedValue([octopusChannel])
    octopusApi.listChannels.mockResolvedValue([octopusChannel])

    const { octopusManagedSiteChannels } = await import(
      "~/services/apiAdapters/managedSites/octopus"
    )

    await expect(
      octopusManagedSiteChannels.search(config, "octopus"),
    ).resolves.toMatchObject({
      items: [
        {
          id: 7,
          name: "Octopus channel",
          base_url: "https://upstream.example.invalid/v1",
          key: "sk-test",
          models: "gpt-4o",
          _octopusData: octopusChannel,
        },
      ],
      total: 1,
      type_counts: {
        [String(OctopusOutboundType.OpenAIChat)]: 1,
      },
    })
    await expect(octopusManagedSiteChannels.list?.(config)).resolves.toEqual({
      items: [
        expect.objectContaining({
          id: 7,
          _octopusData: octopusChannel,
        }),
      ],
      total: 1,
      type_counts: {
        [String(OctopusOutboundType.OpenAIChat)]: 1,
      },
    })
  })

  it("returns null when Octopus channel search fails", async () => {
    octopusApi.searchChannels.mockRejectedValue(new Error("search failed"))
    const { octopusManagedSiteChannels } = await import(
      "~/services/apiAdapters/managedSites/octopus"
    )

    await expect(
      octopusManagedSiteChannels.search(config, "octopus"),
    ).resolves.toBeNull()
  })

  it("maps Octopus create payloads and preserves success messages", async () => {
    octopusApi.createChannel.mockResolvedValue({
      success: true,
      data: { id: 8 },
      message: "",
    })
    const { octopusManagedSiteChannels } = await import(
      "~/services/apiAdapters/managedSites/octopus"
    )

    await expect(
      octopusManagedSiteChannels.create(config, {
        mode: "single",
        channel: {
          name: "",
          type: 1,
          status: 1,
        },
      }),
    ).resolves.toEqual({
      success: true,
      data: { id: 8 },
      message: "success",
    })

    expect(octopusApi.createChannel).toHaveBeenCalledWith(config, {
      name: "",
      type: OctopusOutboundType.OpenAIResponse,
      enabled: true,
      base_urls: [{ url: "" }],
      keys: [{ enabled: true, channel_key: "" }],
      model: undefined,
      auto_sync: true,
      auto_group: 0,
    })
  })

  it("returns safe ApiResponse fallbacks for Octopus create failures", async () => {
    octopusApi.createChannel.mockRejectedValue(new Error("create failed"))
    const { octopusManagedSiteChannels } = await import(
      "~/services/apiAdapters/managedSites/octopus"
    )

    await expect(
      octopusManagedSiteChannels.create(config, {
        mode: "single",
        channel: { name: "broken", status: 1 },
      }),
    ).resolves.toEqual({
      success: false,
      data: null,
      message: "create failed",
    })
  })

  it("exposes provider config and draft functions", async () => {
    const { octopusManagedSiteCapabilities } = await import(
      "~/services/apiAdapters/managedSites/octopus"
    )

    expect(octopusManagedSiteCapabilities.config.checkValid).toBe(
      checkValidOctopusConfig,
    )
    await expect(octopusManagedSiteCapabilities.config.get()).resolves.toEqual(
      config,
    )
    expect(octopusManagedSiteCapabilities.channelDrafts).toEqual({
      fetchAvailableModels,
      buildName: buildChannelName,
      prepareFormData: prepareChannelFormData,
      buildPayload: buildChannelPayload,
    })
    expect(octopusManagedSiteCapabilities).not.toHaveProperty("imports")
  })

  it("preserves an explicit empty base URL update", async () => {
    octopusApi.updateChannel.mockResolvedValue({
      success: true,
      data: null,
    })
    const { octopusManagedSiteChannels } = await import(
      "~/services/apiAdapters/managedSites/octopus"
    )

    await octopusManagedSiteChannels.update(config, {
      id: 7,
      base_url: "",
    })

    expect(octopusApi.updateChannel).toHaveBeenCalledWith(config, {
      id: 7,
      name: undefined,
      type: undefined,
      enabled: undefined,
      base_urls: [{ url: "" }],
      model: undefined,
    })
  })

  it("maps Octopus update fields and returns safe failure responses", async () => {
    octopusApi.updateChannel.mockResolvedValueOnce({
      success: true,
      data: { id: 7 },
      message: "",
    })
    const { octopusManagedSiteChannels } = await import(
      "~/services/apiAdapters/managedSites/octopus"
    )

    await expect(
      octopusManagedSiteChannels.update(config, {
        id: 7,
        name: "Updated",
        type: 1,
        status: 0,
        models: "gpt-4o",
      } as Parameters<typeof octopusManagedSiteChannels.update>[1]),
    ).resolves.toEqual({
      success: true,
      data: { id: 7 },
      message: "success",
    })

    expect(octopusApi.updateChannel).toHaveBeenLastCalledWith(config, {
      id: 7,
      name: "Updated",
      type: OctopusOutboundType.OpenAIResponse,
      enabled: false,
      base_urls: undefined,
      model: "gpt-4o",
    })

    octopusApi.updateChannel.mockRejectedValueOnce(new Error("update failed"))
    await expect(
      octopusManagedSiteChannels.update(config, { id: 7 }),
    ).resolves.toEqual({
      success: false,
      data: null,
      message: "update failed",
    })
  })

  it("maps Octopus delete responses and failures", async () => {
    octopusApi.deleteChannel.mockResolvedValueOnce({
      success: true,
      data: null,
      message: "",
    })
    const { octopusManagedSiteChannels } = await import(
      "~/services/apiAdapters/managedSites/octopus"
    )

    await expect(octopusManagedSiteChannels.delete(config, 7)).resolves.toEqual(
      {
        success: true,
        data: null,
        message: "success",
      },
    )
    expect(octopusApi.deleteChannel).toHaveBeenCalledWith(config, 7)

    octopusApi.deleteChannel.mockRejectedValueOnce(new Error("delete failed"))
    await expect(octopusManagedSiteChannels.delete(config, 7)).resolves.toEqual(
      {
        success: false,
        data: null,
        message: "delete failed",
      },
    )
  })
})
