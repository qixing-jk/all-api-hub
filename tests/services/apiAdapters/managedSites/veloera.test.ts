import { describe, expect, it, vi } from "vitest"

import {
  autoConfigToVeloera,
  buildChannelName,
  buildChannelPayload,
  checkValidVeloeraConfig,
  fetchAvailableModels,
  prepareChannelFormData,
} from "~/services/managedSites/providers/veloera"
import { AuthTypeEnum } from "~/types"

const veloeraApi = vi.hoisted(() => ({
  searchChannel: vi.fn(),
  listAllChannels: vi.fn(),
  createChannel: vi.fn(),
  updateChannel: vi.fn(),
  deleteChannel: vi.fn(),
  fetchChannel: vi.fn(),
  fetchChannelModels: vi.fn(),
  updateChannelModels: vi.fn(),
  updateChannelModelMapping: vi.fn(),
}))

const getApiService = vi.hoisted(() => vi.fn())

vi.mock("~/services/apiService/veloera", () => ({
  ...veloeraApi,
}))

vi.mock("~/services/apiService", () => ({
  getApiService,
}))

describe("Veloera managed-site channel capability", () => {
  const config = {
    baseUrl: "https://veloera.example.invalid",
    adminToken: "admin-token",
    userId: "42",
  }

  it("delegates channel operations to direct Veloera helpers", async () => {
    const { veloeraManagedSiteChannels } = await import(
      "~/services/apiAdapters/managedSites/veloera"
    )
    const request = {
      baseUrl: config.baseUrl,
      auth: {
        authType: AuthTypeEnum.AccessToken,
        accessToken: config.adminToken,
        userId: config.userId,
      },
    }

    await veloeraManagedSiteChannels.search(config, "keyword")
    await veloeraManagedSiteChannels.list?.(config, {
      beforeRequest: vi.fn(),
      bypassSiteRequestLimit: true,
    })
    await veloeraManagedSiteChannels.create(config, {
      mode: "single",
      channel: { name: "channel", status: 1 },
    })
    await veloeraManagedSiteChannels.update(config, { id: 1 })
    await veloeraManagedSiteChannels.delete(config, 1)
    await veloeraManagedSiteChannels.fetchModels?.(config, 1, {
      signal: new AbortController().signal,
    })
    await veloeraManagedSiteChannels.updateModels?.(
      config,
      1,
      ["gpt-4o", "claude-3"],
      { signal: new AbortController().signal },
    )
    await veloeraManagedSiteChannels.updateModelMapping?.(
      config,
      1,
      ["gpt-4o", "claude-3"],
      { "gpt-4o": "gpt-4o" },
      { signal: new AbortController().signal },
    )

    expect(veloeraApi.searchChannel).toHaveBeenCalledWith(request, "keyword")
    expect(veloeraApi.listAllChannels).toHaveBeenCalledWith(
      { ...request, bypassSiteRequestLimit: true },
      {
        beforeRequest: expect.any(Function),
        bypassSiteRequestLimit: true,
      },
    )
    expect(veloeraApi.createChannel).toHaveBeenCalledWith(request, {
      mode: "single",
      channel: { name: "channel", status: 1 },
    })
    expect(veloeraApi.updateChannel).toHaveBeenCalledWith(request, { id: 1 })
    expect(veloeraApi.deleteChannel).toHaveBeenCalledWith(request, 1)
    expect(veloeraApi.fetchChannelModels).toHaveBeenCalledWith(request, 1, {
      signal: expect.any(AbortSignal),
    })
    expect(veloeraApi.updateChannelModels).toHaveBeenCalledWith(
      request,
      1,
      "gpt-4o,claude-3",
      { signal: expect.any(AbortSignal) },
    )
    expect(veloeraApi.updateChannelModelMapping).toHaveBeenCalledWith(
      request,
      1,
      "gpt-4o,claude-3",
      JSON.stringify({ "gpt-4o": "gpt-4o" }),
      { signal: expect.any(AbortSignal) },
    )
    expect(getApiService).not.toHaveBeenCalled()
  })

  it("exposes provider config, draft, and import workflow functions", async () => {
    const { veloeraManagedSiteCapabilities } = await import(
      "~/services/apiAdapters/managedSites/veloera"
    )

    expect(veloeraManagedSiteCapabilities.config.checkValid).toBe(
      checkValidVeloeraConfig,
    )
    expect(veloeraManagedSiteCapabilities.channelDrafts).toEqual({
      fetchAvailableModels,
      buildName: buildChannelName,
      prepareFormData: prepareChannelFormData,
      buildPayload: buildChannelPayload,
    })
    expect(veloeraManagedSiteCapabilities.imports.autoConfig).toBe(
      autoConfigToVeloera,
    )
  })
})
