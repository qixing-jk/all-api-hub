import { beforeEach, describe, expect, it, vi } from "vitest"

import { doneHubManagedSiteCapabilities } from "~/services/apiAdapters/managedSites/doneHub"
import { newApiManagedSiteCapabilities } from "~/services/apiAdapters/managedSites/newApi"
import { veloeraManagedSiteCapabilities } from "~/services/apiAdapters/managedSites/veloera"
import { PROTECTION_BYPASS_USER_COMMANDS } from "~/services/protectionBypass/contracts"
import { AuthTypeEnum } from "~/types"
import { userCommandExecution } from "~~/tests/services/protectionBypass/fixtures"
import { buildManagedSiteChannel } from "~~/tests/test-utils/factories"

const apis = vi.hoisted(() => ({
  newApi: { listAllChannels: vi.fn(), searchChannel: vi.fn() },
  doneHub: {
    listAllChannels: vi.fn(),
    searchChannel: vi.fn(),
    fetchChannel: vi.fn(),
  },
  veloera: { listAllChannels: vi.fn() },
  newApiSecrets: {
    fetchChannelSecretKey: vi.fn(),
    hydrateComparableChannelKeys: vi.fn(),
  },
}))

vi.mock(
  "~/services/apiService/newApiFamily/channelManagement",
  async (original) => ({
    ...(await original<
      typeof import("~/services/apiService/newApiFamily/channelManagement")
    >()),
    ...apis.newApi,
  }),
)
vi.mock("~/services/apiService/doneHub", async (original) => ({
  ...(await original<typeof import("~/services/apiService/doneHub")>()),
  ...apis.doneHub,
}))
vi.mock("~/services/apiService/veloera", async (original) => ({
  ...(await original<typeof import("~/services/apiService/veloera")>()),
  ...apis.veloera,
}))
vi.mock("~/services/managedSites/providers/newApi", async (original) => ({
  ...(await original<
    typeof import("~/services/managedSites/providers/newApi")
  >()),
  ...apis.newApiSecrets,
}))

const config = {
  baseUrl: "https://managed.example",
  adminToken: "test-admin-key",
  userId: "42",
}

const request = {
  baseUrl: "https://managed.example",
  auth: {
    authType: AuthTypeEnum.AccessToken,
    accessToken: "test-admin-key",
    userId: "42",
  },
}

const channel = buildManagedSiteChannel({
  id: 7,
  name: "Native channel",
  type: 1,
  base_url: "https://upstream.example",
  key: "********",
  models: "model-a,model-b",
  status: 2,
  model_mapping: '{"model-a":"remote-a"}',
  balance: 123,
})

const inventory = { items: [channel], total: 1, type_counts: { "1": 1 } }
const candidate = {
  id: 7,
  name: "Native channel",
  type: 1,
  base_url: "https://upstream.example",
  key: "********",
  models: "model-a,model-b",
}

const matchingProviders = [
  {
    name: "New API",
    capabilities: newApiManagedSiteCapabilities,
    api: apis.newApi,
  },
  {
    name: "DoneHub",
    capabilities: doneHubManagedSiteCapabilities,
    api: apis.doneHub,
  },
]

describe("New API family native capability consumers", () => {
  beforeEach(() => vi.resetAllMocks())

  it.each([
    ...matchingProviders,
    {
      name: "Veloera",
      capabilities: veloeraManagedSiteCapabilities,
      api: apis.veloera,
    },
  ])(
    "retains $name model-task inputs and request controls without CRUD metadata",
    async ({ capabilities, api }) => {
      api.listAllChannels.mockResolvedValue(inventory)
      const signal = new AbortController().signal
      const options = {
        signal,
        beforeRequest: vi.fn(),
        bypassSiteRequestLimit: true,
      }

      await expect(capabilities.models.list(config, options)).resolves.toEqual({
        items: [
          {
            id: 7,
            name: "Native channel",
            type: 1,
            base_url: "https://upstream.example",
            key: "********",
            models: "model-a,model-b",
            status: 2,
            model_mapping: '{"model-a":"remote-a"}',
          },
        ],
        total: 1,
        type_counts: { "1": 1 },
      })
      expect(api.listAllChannels).toHaveBeenCalledWith(
        { ...request, abortSignal: signal, bypassSiteRequestLimit: true },
        options,
      )
      expect(channel.balance).toBe(123)
    },
  )

  it.each(matchingProviders)(
    "limits $name search results to duplicate-matching evidence",
    async ({ capabilities, api }) => {
      api.searchChannel.mockResolvedValue(inventory)

      await expect(
        capabilities.matching.search(config, "https://upstream.example"),
      ).resolves.toEqual({
        items: [candidate],
        total: 1,
        type_counts: { "1": 1 },
      })
      expect(api.searchChannel).toHaveBeenCalledWith(
        request,
        "https://upstream.example",
      )
    },
  )

  it.each(matchingProviders)(
    "preserves an unavailable $name inventory instead of reporting an empty search",
    async ({ capabilities, api }) => {
      api.searchChannel.mockResolvedValue(null)

      await expect(
        capabilities.matching.search(config, "upstream"),
      ).resolves.toBeNull()
    },
  )

  it("requires explicit intent for both New API hidden-key matching entrypoints", async () => {
    const matching = newApiManagedSiteCapabilities.matching

    await expect(matching.fetchSecretKey!(config, 7)).rejects.toThrow(
      "explicit intent",
    )
    await expect(
      matching.hydrateComparableKeys!(config, [candidate]),
    ).rejects.toThrow("explicit intent")
    expect(apis.newApiSecrets.fetchChannelSecretKey).not.toHaveBeenCalled()
    expect(
      apis.newApiSecrets.hydrateComparableChannelKeys,
    ).not.toHaveBeenCalled()
  })

  it("preserves explicit intent and cancellation for New API matching key reads", async () => {
    const matching = newApiManagedSiteCapabilities.matching
    const options = {
      signal: new AbortController().signal,
      protectionBypassExecution: userCommandExecution(
        PROTECTION_BYPASS_USER_COMMANDS.ManageSiteChannels,
      ),
    }
    apis.newApiSecrets.fetchChannelSecretKey.mockResolvedValue("resolved-key")
    apis.newApiSecrets.hydrateComparableChannelKeys.mockResolvedValue([
      { ...candidate, key: "resolved-key" },
    ])

    await expect(matching.fetchSecretKey!(config, 7, options)).resolves.toBe(
      "resolved-key",
    )
    await expect(
      matching.hydrateComparableKeys!(config, [candidate], options),
    ).resolves.toEqual([{ ...candidate, key: "resolved-key" }])
    expect(apis.newApiSecrets.fetchChannelSecretKey).toHaveBeenCalledWith(
      config,
      7,
      options,
    )
    expect(
      apis.newApiSecrets.hydrateComparableChannelKeys,
    ).toHaveBeenCalledWith(config, [candidate], options)
  })

  it.each(matchingProviders)(
    "rejects opaque $name identities before secret access",
    async ({ capabilities }) => {
      await expect(
        capabilities.matching.fetchSecretKey!(config, "opaque-id"),
      ).rejects.toThrow("Invalid numeric resource id")
      expect(apis.newApiSecrets.fetchChannelSecretKey).not.toHaveBeenCalled()
      expect(apis.doneHub.fetchChannel).not.toHaveBeenCalled()
    },
  )

  it("resolves a DoneHub matching key through the selected native channel", async () => {
    apis.doneHub.fetchChannel.mockResolvedValue(
      buildManagedSiteChannel({ id: 7, key: "resolved-key" }),
    )

    await expect(
      doneHubManagedSiteCapabilities.matching.fetchSecretKey!(config, 7),
    ).resolves.toBe("resolved-key")
    expect(apis.doneHub.fetchChannel).toHaveBeenCalledWith(request, 7)
  })
})
