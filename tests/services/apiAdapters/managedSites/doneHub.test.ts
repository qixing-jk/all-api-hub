import { describe, expect, it, vi } from "vitest"

import {
  buildChannelName,
  buildChannelPayload,
  checkValidDoneHubConfig,
  fetchAvailableModels,
  prepareChannelFormData,
} from "~/services/managedSites/providers/doneHubService"
import { AuthTypeEnum } from "~/types"

const doneHubApi = vi.hoisted(() => ({
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

vi.mock("~/services/apiService/doneHub", () => ({
  ...doneHubApi,
}))

vi.mock("~/services/apiService", () => ({
  getApiService,
}))

describe("DoneHub managed-site channel capability", () => {
  const config = {
    baseUrl: "https://done-hub.example.invalid",
    adminToken: "admin-token",
    userId: "42",
  }

  it("delegates channel operations and model sync to direct DoneHub helpers", async () => {
    const { doneHubManagedSiteChannels } = await import(
      "~/services/apiAdapters/managedSites/doneHub"
    )
    const request = {
      baseUrl: config.baseUrl,
      auth: {
        authType: AuthTypeEnum.AccessToken,
        accessToken: config.adminToken,
        userId: config.userId,
      },
    }

    await doneHubManagedSiteChannels.search(config, "keyword")
    await doneHubManagedSiteChannels.list?.(config, {
      bypassSiteRequestLimit: true,
    })
    await doneHubManagedSiteChannels.create(config, {
      mode: "single",
      channel: { name: "channel", status: 1 },
    })
    await doneHubManagedSiteChannels.update(config, { id: 1 })
    await doneHubManagedSiteChannels.delete(config, 1)
    await doneHubManagedSiteChannels.fetchModels?.(config, 1)
    await doneHubManagedSiteChannels.updateModels?.(config, 1, ["model-a"])
    await doneHubManagedSiteChannels.updateModelMapping?.(
      config,
      1,
      ["model-a"],
      { "model-a": "upstream-model-a" },
    )

    expect(doneHubApi.searchChannel).toHaveBeenCalledWith(request, "keyword")
    expect(doneHubApi.listAllChannels).toHaveBeenCalledWith(
      { ...request, bypassSiteRequestLimit: true },
      { bypassSiteRequestLimit: true },
    )
    expect(doneHubApi.createChannel).toHaveBeenCalledWith(request, {
      mode: "single",
      channel: { name: "channel", status: 1 },
    })
    expect(doneHubApi.updateChannel).toHaveBeenCalledWith(request, { id: 1 })
    expect(doneHubApi.deleteChannel).toHaveBeenCalledWith(request, 1)
    expect(doneHubApi.fetchChannelModels).toHaveBeenCalledWith(
      request,
      1,
      undefined,
    )
    expect(doneHubApi.updateChannelModels).toHaveBeenCalledWith(
      request,
      1,
      "model-a",
      undefined,
    )
    expect(doneHubApi.updateChannelModelMapping).toHaveBeenCalledWith(
      request,
      1,
      "model-a",
      JSON.stringify({ "model-a": "upstream-model-a" }),
      undefined,
    )
    expect(getApiService).not.toHaveBeenCalled()
  })

  it("exposes provider config and draft functions", async () => {
    const { doneHubManagedSiteCapabilities } = await import(
      "~/services/apiAdapters/managedSites/doneHub"
    )

    expect(doneHubManagedSiteCapabilities.config.checkValid).toBe(
      checkValidDoneHubConfig,
    )
    expect(doneHubManagedSiteCapabilities.channelDrafts).toEqual({
      fetchAvailableModels,
      buildName: buildChannelName,
      prepareFormData: prepareChannelFormData,
      buildPayload: buildChannelPayload,
    })
    expect(doneHubManagedSiteCapabilities).not.toHaveProperty("imports")
  })
})
