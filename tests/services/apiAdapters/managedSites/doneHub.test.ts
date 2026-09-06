import { beforeEach, describe, expect, it, vi } from "vitest"

import { doneHubManagedResourceModels } from "~/services/apiAdapters/managedSites/doneHub"
import { AuthTypeEnum } from "~/types"
import {
  CHANNEL_MUTATION_SCENARIOS,
  testManagedSiteChannelMutationContract,
  type ChannelMutationScenario,
} from "~~/tests/services/apiAdapters/managedSites/channelMutationContract"
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
  fetchChannelRaw: vi.fn(),
  normalizeDoneHubChannel: vi.fn((channel) => channel),
  fetchChannelModels: vi.fn(),
  fetchDraftChannelModels: vi.fn(),
  updateChannelModels: vi.fn(),
  updateChannelModelMapping: vi.fn(),
  updateDoneHubChannelFields: vi.fn(),
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

  beforeEach(() => {
    vi.clearAllMocks()
  })

  const createPayload = {
    mode: "single",
    channel: { name: "channel", status: 1 },
  } as const
  const updatePayload = { id: 7, name: "updated" }
  const models = ["model-a", "model-b"]
  const modelMapping = { "model-a": "upstream-model-a" }

  const arrangeRestMutation =
    (mock: typeof doneHubApi.createChannel, successData: unknown) =>
    (scenario: ChannelMutationScenario) => {
      doneHubApi.fetchChannelRaw.mockResolvedValue({
        id: 7,
        name: "preserved",
        key: "sk-preserved",
      })
      const raw =
        scenario === CHANNEL_MUTATION_SCENARIOS.PreflightCancellation
          ? new DOMException("cancelled", "AbortError")
          : new TypeError("Failed to fetch")
      const rejectionResponse = {
        success: false,
        data: null,
        message: "provider rejected",
      }
      mock.mockImplementation(async (request) => {
        if (scenario === CHANNEL_MUTATION_SCENARIOS.PreflightCancellation) {
          throw raw
        }
        request.observer?.onDispatch()
        if (scenario === CHANNEL_MUTATION_SCENARIOS.PostDispatchAmbiguity) {
          throw raw
        }
        request.observer?.onResponse()
        if (scenario === CHANNEL_MUTATION_SCENARIOS.Rejected) {
          return rejectionResponse
        }
        return { success: true, data: successData, message: "success" }
      })
      return { raw, rejectionResponse }
    }

  testManagedSiteChannelMutationContract([
    {
      name: "create",
      effect: { kind: "resource-created", resourceKind: "channel" },
      successData: { id: 17 },
      arrange: arrangeRestMutation(doneHubApi.createChannel, { id: 17 }),
      invoke: async () => {
        const { doneHubManagedSiteChannels } = await import(
          "~/services/apiAdapters/managedSites/doneHub"
        )
        return await doneHubManagedSiteChannels.create(config, createPayload)
      },
      assertRequestPayload: () =>
        expect(doneHubApi.createChannel.mock.calls.at(-1)?.[1]).toBe(
          createPayload,
        ),
    },
    {
      name: "update",
      effect: {
        kind: "resource-updated",
        resourceKind: "channel",
        resourceId: 7,
      },
      successData: { id: 7 },
      arrange: arrangeRestMutation(doneHubApi.updateChannel, { id: 7 }),
      invoke: async () => {
        const { doneHubManagedSiteChannels } = await import(
          "~/services/apiAdapters/managedSites/doneHub"
        )
        return await doneHubManagedSiteChannels.update(config, updatePayload)
      },
      assertRequestPayload: () =>
        expect(doneHubApi.updateChannel.mock.calls.at(-1)?.[1]).toBe(
          updatePayload,
        ),
    },
    {
      name: "delete",
      effect: {
        kind: "resource-deleted",
        resourceKind: "channel",
        resourceId: 7,
      },
      successData: undefined,
      arrange: arrangeRestMutation(doneHubApi.deleteChannel, null),
      invoke: async () => {
        const { doneHubManagedSiteChannels } = await import(
          "~/services/apiAdapters/managedSites/doneHub"
        )
        return await doneHubManagedSiteChannels.delete(config, 7)
      },
      assertRequestPayload: () =>
        expect(doneHubApi.deleteChannel.mock.calls.at(-1)?.[1]).toBe(7),
    },
    {
      name: "updateModels",
      effect: {
        kind: "models-updated",
        resourceKind: "channel",
        resourceId: 7,
      },
      successData: undefined,
      arrange: arrangeRestMutation(doneHubApi.updateDoneHubChannelFields, null),
      invoke: async () => {
        return await doneHubManagedResourceModels.updateModels!(
          config,
          7,
          models,
        )
      },
      assertRequestPayload: () =>
        expect(
          doneHubApi.updateDoneHubChannelFields.mock.calls.at(-1)?.slice(1),
        ).toEqual([
          {
            id: 7,
            name: "preserved",
            key: "sk-preserved",
            models: "model-a,model-b",
          },
          undefined,
        ]),
    },
    {
      name: "updateModelMapping",
      effect: {
        kind: "model-mapping-updated",
        resourceKind: "channel",
        resourceId: 7,
      },
      successData: undefined,
      arrange: arrangeRestMutation(doneHubApi.updateDoneHubChannelFields, null),
      invoke: async () => {
        return await doneHubManagedResourceModels.updateModelMapping!(
          config,
          7,
          models,
          modelMapping,
        )
      },
      assertRequestPayload: () =>
        expect(
          doneHubApi.updateDoneHubChannelFields.mock.calls.at(-1)?.slice(1),
        ).toEqual([
          {
            id: 7,
            name: "preserved",
            key: "sk-preserved",
            models: "model-a,model-b",
            model_mapping: JSON.stringify(modelMapping),
          },
          undefined,
        ]),
    },
  ])

  it("preserves response-received DoneHub error identity", async () => {
    const responseError = new Error("malformed provider response")
    doneHubApi.createChannel.mockImplementationOnce(async (request) => {
      request.observer?.onDispatch()
      request.observer?.onResponse()
      throw responseError
    })
    const { doneHubManagedSiteChannels } = await import(
      "~/services/apiAdapters/managedSites/doneHub"
    )

    await expect(
      doneHubManagedSiteChannels.create(config, createPayload),
    ).rejects.toBe(responseError)
  })

  it("uses fixed diagnostic copy when a DoneHub rejection message is blank", async () => {
    const rejectionResponse = { success: false, data: null, message: "   " }
    doneHubApi.createChannel.mockImplementationOnce(async (request) => {
      request.observer?.onDispatch()
      request.observer?.onResponse()
      return rejectionResponse
    })
    const { doneHubManagedSiteChannels } = await import(
      "~/services/apiAdapters/managedSites/doneHub"
    )

    await expect(
      doneHubManagedSiteChannels.create(config, createPayload),
    ).resolves.toEqual({
      outcome: "rejected",
      diagnostic: {
        message: "Provider rejected the mutation",
        raw: rejectionResponse,
      },
    })
  })

  it.each([
    new DOMException("cancelled", "AbortError"),
    new TypeError("Failed to fetch"),
  ])(
    "keeps DoneHub model-update preflight failure %s undispatched",
    async (raw) => {
      doneHubApi.fetchChannelRaw.mockRejectedValue(raw)

      await expect(
        doneHubManagedResourceModels.updateModels!(config, 7, models),
      ).resolves.toMatchObject({
        outcome: "rejected",
        diagnostic: { raw },
      })
      expect(doneHubApi.updateDoneHubChannelFields).not.toHaveBeenCalled()
    },
  )

  it.each(["models", "mapping"] as const)(
    "preserves exact %s PUT options while keeping the preflight observer-free",
    async (operation) => {
      const controller = new AbortController()
      const options = {
        signal: controller.signal,
        bypassSiteRequestLimit: true,
      }
      const preserved = {
        id: 7,
        name: "preserved",
        key: "sk-preserved",
        base_url: "https://upstream.example.invalid",
      }
      doneHubApi.fetchChannelRaw.mockResolvedValue(preserved)
      doneHubApi.updateDoneHubChannelFields.mockImplementation(
        async (request) => {
          request.observer?.onDispatch()
          request.observer?.onResponse()
          return { success: true, data: null, message: "success" }
        },
      )

      if (operation === "models") {
        await doneHubManagedResourceModels.updateModels!(
          config,
          7,
          models,
          options,
        )
      } else {
        await doneHubManagedResourceModels.updateModelMapping!(
          config,
          7,
          models,
          modelMapping,
          options,
        )
      }

      const expectedRequest = {
        baseUrl: config.baseUrl,
        auth: {
          authType: AuthTypeEnum.AccessToken,
          accessToken: config.adminToken,
          userId: config.userId,
        },
        abortSignal: options.signal,
        bypassSiteRequestLimit: true,
      }
      expect(doneHubApi.fetchChannelRaw).toHaveBeenCalledWith(
        expectedRequest,
        7,
        options,
      )
      expect(
        doneHubApi.fetchChannelRaw.mock.calls.at(-1)?.[0],
      ).not.toHaveProperty("observer")
      expect(doneHubApi.updateDoneHubChannelFields).toHaveBeenCalledWith(
        {
          ...expectedRequest,
          observer: {
            onDispatch: expect.any(Function),
            onResponse: expect.any(Function),
          },
        },
        {
          ...preserved,
          models: "model-a,model-b",
          ...(operation === "mapping"
            ? { model_mapping: JSON.stringify(modelMapping) }
            : {}),
        },
        options,
      )
    },
  )

  it("delegates channel operations and model sync to direct DoneHub helpers", async () => {
    doneHubApi.fetchChannelRaw.mockResolvedValue({ id: 1, name: "preserved" })
    doneHubApi.updateDoneHubChannelFields.mockImplementation(
      async (request) => {
        request.observer?.onDispatch()
        request.observer?.onResponse()
        return { success: true, data: null, message: "success" }
      },
    )
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
    await doneHubManagedResourceModels.fetchModels?.(config, 1)
    await doneHubManagedResourceModels.fetchDraftModels?.(
      config,
      {
        channelType: "1",
        baseUrl: "https://upstream.example.invalid",
        credential: "credential-placeholder",
      },
      { bypassSiteRequestLimit: true },
    )
    await doneHubManagedResourceModels.updateModels?.(config, 1, ["model-a"])
    await doneHubManagedResourceModels.updateModelMapping?.(
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
    expect(doneHubApi.createChannel).toHaveBeenCalledWith(
      expect.objectContaining(request),
      {
        mode: "single",
        channel: { name: "channel", status: 1 },
      },
    )
    expect(doneHubApi.updateChannel).toHaveBeenCalledWith(
      expect.objectContaining(request),
      { id: 1 },
    )
    expect(doneHubApi.deleteChannel).toHaveBeenCalledWith(
      expect.objectContaining(request),
      1,
    )
    expect(doneHubApi.fetchChannelModels).toHaveBeenCalledWith(
      request,
      1,
      undefined,
    )
    expect(doneHubApi.fetchDraftChannelModels).toHaveBeenCalledWith(
      { ...request, bypassSiteRequestLimit: true },
      {
        type: 1,
        baseUrl: "https://upstream.example.invalid",
        key: "credential-placeholder",
      },
      { bypassSiteRequestLimit: true },
    )
    expect(doneHubApi.fetchChannelRaw).toHaveBeenCalledWith(
      request,
      1,
      undefined,
    )
    expect(doneHubApi.updateDoneHubChannelFields).toHaveBeenLastCalledWith(
      expect.objectContaining(request),
      {
        id: 1,
        name: "preserved",
        models: "model-a",
        model_mapping: JSON.stringify({
          "model-a": "upstream-model-a",
        }),
      },
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

    await doneHubManagedSiteCapabilities.queries.siteUserGroups!.fetch(config)
    await doneHubManagedSiteCapabilities.queries.accountAvailableModels!.fetch(
      config,
    )

    expect(doneHubApi.fetchSiteUserGroups).toHaveBeenCalledWith(request)
    expect(
      newApiKeyManagement.doneHubKeyManagement.fetchAvailableModels,
    ).toHaveBeenCalledWith(request)
  })

  it("fetches and hydrates DoneHub secret keys for masked comparable channels", async () => {
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

    doneHubApi.fetchChannel.mockResolvedValueOnce({
      id: 42,
      key: "sk-real",
    })
    await expect(
      doneHubManagedSiteChannels.fetchSecretKey?.(config, 42),
    ).resolves.toBe("sk-real")
    expect(doneHubApi.fetchChannel).toHaveBeenCalledWith(request, 42)

    doneHubApi.fetchChannel.mockResolvedValueOnce({
      id: 7,
      key: "sk-hydrated",
    })
    await expect(
      doneHubManagedSiteChannels.hydrateComparableKeys?.(config, [
        { id: 1, key: "sk-live" },
        { id: 7, key: "sk-********" },
      ] as never),
    ).resolves.toEqual([
      { id: 1, key: "sk-live" },
      { id: 7, key: "sk-hydrated" },
    ])
    expect(doneHubApi.fetchChannel).toHaveBeenCalledWith(request, 7)
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
