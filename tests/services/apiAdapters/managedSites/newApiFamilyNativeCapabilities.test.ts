import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import type { ManagedResourceRef } from "~/services/apiAdapters/contracts/managedResourceNative"
import { doneHubManagedSiteCapabilities } from "~/services/apiAdapters/managedSites/doneHub"
import { newApiManagedSiteCapabilities } from "~/services/apiAdapters/managedSites/newApi"
import { veloeraManagedSiteCapabilities } from "~/services/apiAdapters/managedSites/veloera"
import { PROTECTION_BYPASS_USER_COMMANDS } from "~/services/protectionBypass/contracts"
import { AuthTypeEnum } from "~/types"
import { userCommandExecution } from "~~/tests/services/protectionBypass/fixtures"
import { buildManagedSiteChannel } from "~~/tests/test-utils/factories"
import { modelResourceRef } from "~~/tests/test-utils/managedModelResource"
import { matchingResourceRef } from "~~/tests/test-utils/managedResourceMatching"

const apis = vi.hoisted(() => ({
  newApi: { listAllChannels: vi.fn(), searchChannel: vi.fn() },
  doneHub: {
    listAllChannels: vi.fn(),
    fetchChannelRaw: vi.fn(),
    searchChannel: vi.fn(),
  },
  veloera: { listAllChannels: vi.fn(), fetchChannel: vi.fn() },
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
vi.mock(
  "~/services/managedSites/providers/newApiChannelSecrets",
  async (original) => ({
    ...(await original<
      typeof import("~/services/managedSites/providers/newApiChannelSecrets")
    >()),
    ...apis.newApiSecrets,
  }),
)

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
const nativeCandidate = {
  id: 7,
  name: "Native channel",
  type: 1,
  base_url: "https://upstream.example",
  key: "********",
  models: "model-a,model-b",
}

const { id: resourceId, ...candidateFacts } = nativeCandidate
const candidate = { ...candidateFacts, ref: matchingResourceRef(resourceId) }

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

const modelProviders = [
  ...matchingProviders,
  {
    name: "Veloera",
    capabilities: veloeraManagedSiteCapabilities,
    api: apis.veloera,
  },
]

describe("New API family native capability consumers", () => {
  beforeEach(() => vi.resetAllMocks())

  it.each(modelProviders)(
    "rejects a mixed-deployment $name hydration batch before revealing any key",
    async ({ capabilities }) => {
      const candidates = [
        {
          ...candidate,
          ref: matchingResourceRef(7, { siteType: capabilities.siteType }),
        },
        {
          ...candidate,
          ref: matchingResourceRef(8, {
            siteType: capabilities.siteType,
            scopeKey: "https://other.example",
          }),
        },
      ]

      await expect(
        capabilities.matching.hydrateComparableKeys!(config, candidates),
      ).rejects.toMatchObject({ failure: { code: "validation_failed" } })
      expect(
        apis.newApiSecrets.hydrateComparableChannelKeys,
      ).not.toHaveBeenCalled()
      expect(apis.newApiSecrets.fetchChannelSecretKey).not.toHaveBeenCalled()
      expect(apis.doneHub.fetchChannelRaw).not.toHaveBeenCalled()
      expect(apis.veloera.fetchChannel).not.toHaveBeenCalled()
    },
  )

  it.each(modelProviders)(
    "validates the full resource identity before a $name secret read",
    async ({ capabilities }) => {
      const ref = matchingResourceRef(7, { siteType: capabilities.siteType })
      for (const foreignRef of [
        { ...ref, siteType: SITE_TYPES.AXON_HUB },
        { ...ref, scopeKey: "https://other.example" },
        { ...ref, kind: "token" as ManagedResourceRef["kind"] },
      ]) {
        await expect(
          capabilities.matching.fetchSecretKey!(config, foreignRef),
        ).rejects.toMatchObject({ failure: { code: "validation_failed" } })
      }
      expect(apis.newApiSecrets.fetchChannelSecretKey).not.toHaveBeenCalled()
      expect(apis.doneHub.fetchChannelRaw).not.toHaveBeenCalled()
      expect(apis.veloera.fetchChannel).not.toHaveBeenCalled()
    },
  )

  it.each(modelProviders)(
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
            ref: modelResourceRef(7, {
              siteType: capabilities.siteType,
              scopeKey: config.baseUrl,
            }),
            name: "Native channel",
            type: 1,
            baseUrl: "https://upstream.example",
            credential: "********",
            models: ["model-a", "model-b"],
            disabled: true,
            modelMapping: '{"model-a":"remote-a"}',
          },
        ],
        total: 1,
      })
      expect(api.listAllChannels).toHaveBeenCalledWith(
        { ...request, abortSignal: signal, bypassSiteRequestLimit: true },
        options,
      )
      expect(channel.balance).toBe(123)
    },
  )

  it.each(modelProviders)(
    "marks only explicit $name disabled states as disabled for model tasks",
    async ({ capabilities, api }) => {
      api.listAllChannels.mockResolvedValue({
        items: [
          { ...channel, id: 10, status: 0 },
          { ...channel, id: 11, status: 1 },
          { ...channel, id: 12, status: 2 },
          { ...channel, id: 13, status: 3 },
          { ...channel, id: 14, status: 99 },
        ],
        total: 5,
        type_counts: { "1": 5 },
      })

      await expect(
        capabilities.models.list(config, undefined),
      ).resolves.toMatchObject({
        items: [
          {
            ref: modelResourceRef(10, {
              siteType: capabilities.siteType,
              scopeKey: config.baseUrl,
            }),
            disabled: false,
          },
          {
            ref: modelResourceRef(11, {
              siteType: capabilities.siteType,
              scopeKey: config.baseUrl,
            }),
            disabled: false,
          },
          {
            ref: modelResourceRef(12, {
              siteType: capabilities.siteType,
              scopeKey: config.baseUrl,
            }),
            disabled: true,
          },
          {
            ref: modelResourceRef(13, {
              siteType: capabilities.siteType,
              scopeKey: config.baseUrl,
            }),
            disabled: true,
          },
          {
            ref: modelResourceRef(14, {
              siteType: capabilities.siteType,
              scopeKey: config.baseUrl,
            }),
            disabled: false,
          },
        ],
      })
    },
  )

  it.each(matchingProviders)(
    "limits $name search results to duplicate-matching evidence",
    async ({ capabilities, api }) => {
      api.searchChannel.mockResolvedValue(inventory)

      await expect(
        capabilities.matching.search(config, "https://upstream.example"),
      ).resolves.toEqual({
        items: [
          {
            ...candidate,
            ref: matchingResourceRef(7, { siteType: capabilities.siteType }),
          },
        ],
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

    await expect(
      matching.fetchSecretKey!(config, candidate.ref),
    ).rejects.toThrow("explicit intent")
    await expect(
      matching.hydrateComparableKeys!(config, [candidate]),
    ).rejects.toThrow("explicit intent")
    expect(apis.newApiSecrets.fetchChannelSecretKey).not.toHaveBeenCalled()
    expect(
      apis.newApiSecrets.hydrateComparableChannelKeys,
    ).not.toHaveBeenCalled()
  })

  it.each([7, "7"])(
    "preserves explicit intent and cancellation for New API matching key read %s",
    async (resourceId) => {
      const matching = newApiManagedSiteCapabilities.matching
      const options = {
        signal: new AbortController().signal,
        protectionBypassExecution: userCommandExecution(
          PROTECTION_BYPASS_USER_COMMANDS.ManageSiteChannels,
        ),
      }
      apis.newApiSecrets.fetchChannelSecretKey.mockResolvedValue("resolved-key")
      apis.newApiSecrets.hydrateComparableChannelKeys.mockResolvedValue([
        { ...nativeCandidate, key: "resolved-key" },
      ])

      await expect(
        matching.fetchSecretKey!(
          config,
          matchingResourceRef(resourceId),
          options,
        ),
      ).resolves.toBe("resolved-key")
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
      ).toHaveBeenCalledWith(config, [nativeCandidate], options)
    },
  )

  it.each(matchingProviders)(
    "rejects opaque $name identities before secret access",
    async ({ capabilities }) => {
      for (const resourceId of [
        "opaque-id",
        "7x",
        "1e2",
        "0x7",
        "07",
        " 7 ",
        "0",
        "-1",
        "9007199254740992",
      ]) {
        await expect(
          capabilities.matching.fetchSecretKey!(
            config,
            matchingResourceRef(resourceId, {
              siteType: capabilities.siteType,
            }),
          ),
        ).rejects.toThrow("Invalid numeric resource id")
      }
      expect(apis.newApiSecrets.fetchChannelSecretKey).not.toHaveBeenCalled()
      expect(apis.doneHub.fetchChannelRaw).not.toHaveBeenCalled()
    },
  )

  it.each([7, "7"])(
    "resolves a DoneHub matching key through native channel %s",
    async (resourceId) => {
      apis.doneHub.fetchChannelRaw.mockResolvedValue(
        buildManagedSiteChannel({ id: 7, key: "resolved-key" }),
      )

      await expect(
        doneHubManagedSiteCapabilities.matching.fetchSecretKey!(
          config,
          matchingResourceRef(resourceId, {
            siteType: doneHubManagedSiteCapabilities.siteType,
          }),
        ),
      ).resolves.toBe("resolved-key")
      expect(apis.doneHub.fetchChannelRaw).toHaveBeenCalledWith(request, 7)
    },
  )
})
