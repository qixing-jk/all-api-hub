import { describe, expect, it, vi } from "vitest"

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
}))

vi.mock("~/services/apiService/octopus", () => ({
  ...octopusApi,
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

  it("exposes provider config and draft functions", async () => {
    const { octopusManagedSiteCapabilities } = await import(
      "~/services/apiAdapters/managedSites/octopus"
    )

    expect(octopusManagedSiteCapabilities.config.checkValid).toBe(
      checkValidOctopusConfig,
    )
    expect(octopusManagedSiteCapabilities.channelDrafts).toEqual({
      fetchAvailableModels,
      buildName: buildChannelName,
      prepareFormData: prepareChannelFormData,
      buildPayload: buildChannelPayload,
    })
    expect(octopusManagedSiteCapabilities).not.toHaveProperty("imports")
  })
})
