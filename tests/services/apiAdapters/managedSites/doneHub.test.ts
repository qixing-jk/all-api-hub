import { describe, expect, it, vi } from "vitest"

import {
  buildChannelName,
  buildChannelPayload,
  checkValidDoneHubConfig,
  prepareChannelFormData,
} from "~/services/managedSites/providers/doneHubService"
import { AuthTypeEnum } from "~/types"
import {
  buildApiToken,
  buildDisplaySiteData,
} from "~~/tests/test-utils/factories"

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
  fetchSiteUserGroups: vi.fn(),
}))

const newApiKeyManagement = vi.hoisted(() => {
  const doneHubKeyManagement = {
    fetchAvailableModels: vi.fn(),
  }

  return {
    doneHubKeyManagement,
    createNewApiKeyManagement: vi.fn(() => doneHubKeyManagement),
  }
})

const managedSiteModels = vi.hoisted(() => ({
  fetchManagedSiteAvailableModels: vi.fn(),
}))

vi.mock("~/services/apiService/doneHub", () => ({
  ...doneHubApi,
}))

vi.mock("~/services/apiAdapters/newApi/keyManagement", () => ({
  ...newApiKeyManagement,
}))

vi.mock(
  "~/services/managedSites/utils/fetchManagedSiteAvailableModels",
  () => ({
    ...managedSiteModels,
  }),
)

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
  })

  it("delegates managed-site query helpers to direct DoneHub-compatible helpers", async () => {
    const { doneHubManagedSiteCapabilities } = await import(
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

    await doneHubManagedSiteCapabilities.queries.fetchSiteUserGroups(config)
    await doneHubManagedSiteCapabilities.queries.fetchAccountAvailableModels(
      config,
    )

    expect(doneHubApi.fetchSiteUserGroups).toHaveBeenCalledWith(request)
    expect(
      newApiKeyManagement.doneHubKeyManagement.fetchAvailableModels,
    ).toHaveBeenCalledWith(request)
  })

  it("exposes provider config and draft functions", async () => {
    const { doneHubManagedSiteCapabilities } = await import(
      "~/services/apiAdapters/managedSites/doneHub"
    )

    expect(doneHubManagedSiteCapabilities.config.checkValid).toBe(
      checkValidDoneHubConfig,
    )
    expect(doneHubManagedSiteCapabilities.channelDrafts).toEqual({
      fetchAvailableModels: expect.any(Function),
      buildName: buildChannelName,
      prepareFormData: prepareChannelFormData,
      buildPayload: buildChannelPayload,
    })
    expect(doneHubManagedSiteCapabilities).not.toHaveProperty("imports")
  })

  it("injects DoneHub account model fallback into the provider draft capability", async () => {
    const { doneHubManagedSiteCapabilities } = await import(
      "~/services/apiAdapters/managedSites/doneHub"
    )
    const account = buildDisplaySiteData({
      id: "1",
      siteType: "done-hub",
      baseUrl: config.baseUrl,
    })
    const token = buildApiToken({
      id: 10,
      name: "token",
      key: "token-key",
    })

    await doneHubManagedSiteCapabilities.channelDrafts.fetchAvailableModels(
      account,
      token,
    )

    expect(
      managedSiteModels.fetchManagedSiteAvailableModels,
    ).toHaveBeenCalledWith(account, token, {
      fetchAccountAvailableModels:
        newApiKeyManagement.doneHubKeyManagement.fetchAvailableModels,
    })
  })
})
