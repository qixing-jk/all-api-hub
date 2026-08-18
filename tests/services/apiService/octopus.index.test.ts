import { beforeEach, describe, expect, it, vi } from "vitest"

import { octopusManagedSiteChannels } from "~/services/apiAdapters/managedSites/octopus"
import {
  createChannel,
  deleteChannel,
  fetchAccountAvailableModels,
  fetchAvailableModels,
  fetchGroups,
  fetchRemoteModels,
  fetchSiteUserGroups,
  listChannels,
  OctopusMutationApiError,
  searchChannels,
  updateChannel,
  validateOctopusConfig,
} from "~/services/apiService/octopus"
import {
  createAutomaticProtectionBypassExecution,
  PROTECTION_BYPASS_AUTOMATIC_TRIGGERS,
  PROTECTION_BYPASS_FEATURES,
  PROTECTION_BYPASS_SURFACES,
} from "~/services/protectionBypass/contracts"
import { OctopusAutoGroupType, OctopusOutboundType } from "~/types/octopus"

const {
  mockGetValidSession,
  mockClearCache,
  mockValidateConfig,
  mockGetPreferences,
  mockTempWindowOctopusApiFetch,
  mockLogger,
} = vi.hoisted(() => ({
  mockGetValidSession: vi.fn(),
  mockClearCache: vi.fn(),
  mockValidateConfig: vi.fn(),
  mockGetPreferences: vi.fn(),
  mockTempWindowOctopusApiFetch: vi.fn(),
  mockLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock("~/services/apiService/octopus/auth", () => ({
  OCTOPUS_AUTH_MODES: {
    Bearer: "bearer",
    Cookie: "cookie",
  },
  octopusAuthManager: {
    getValidSession: mockGetValidSession,
    clearCache: mockClearCache,
    validateConfig: mockValidateConfig,
  },
}))

vi.mock("~/services/preferences/userPreferences", () => ({
  userPreferences: {
    getPreferences: mockGetPreferences,
  },
}))

vi.mock("~/services/apiService/octopus/tempContextClient", () => ({
  tempWindowOctopusApiFetch: mockTempWindowOctopusApiFetch,
}))

vi.mock("~/utils/core/logger", () => ({
  createLogger: () => mockLogger,
}))

describe("Octopus API service", () => {
  const config = {
    baseUrl: "https://octopus.example.com/",
    username: "alice",
    password: "secret",
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockTempWindowOctopusApiFetch.mockReset()
    vi.unstubAllGlobals()
    mockGetValidSession.mockResolvedValue({
      mode: "bearer",
      token: "jwt-token",
      expireAt: 1_700_000_900_000,
    })
    mockValidateConfig.mockResolvedValue({ success: true })
  })

  it("lists channels with JWT auth headers", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          success: true,
          data: [
            {
              id: 1,
              name: "Main",
              base_urls: [{ url: "https://api.example.com/v1" }],
            },
          ],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    )
    vi.stubGlobal("fetch", fetchMock)

    const result = await listChannels(config)

    expect(result).toEqual([
      {
        id: 1,
        name: "Main",
        base_urls: [{ url: "https://api.example.com/v1" }],
      },
    ])
    const [, request] = fetchMock.mock.calls[0]
    const headers = request.headers as Headers
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://octopus.example.com/api/v1/channel/list",
    )
    expect(headers.get("Authorization")).toBe("Bearer jwt-token")
    expect(headers.get("Content-Type")).toBe("application/json")
  })

  it("lists channels with the current Octopus cookie session", async () => {
    mockGetValidSession.mockResolvedValueOnce({
      mode: "cookie",
      expireAt: 1_700_000_900_000,
    })
    mockTempWindowOctopusApiFetch.mockResolvedValueOnce({
      success: true,
      status: 200,
      data: {
        code: 200,
        message: "success",
        data: [
          {
            id: 1,
            name: "Current",
            type: "openai_responses",
            enabled: true,
            base_url: "https://api.example.invalid/v1",
            key: "credential-placeholder",
            model: "model-a",
            custom_model: "model-b",
            proxy: false,
            auto_sync: true,
            custom_header: null,
          },
        ],
      },
      transportLifecycle: {
        upstreamRequestDispatched: true,
        upstreamResponseReceived: true,
      },
    })

    await expect(listChannels(config)).resolves.toEqual([
      expect.objectContaining({
        id: 1,
        name: "Current",
        type: OctopusOutboundType.OpenAIResponse,
        base_urls: [{ url: "https://api.example.invalid/v1" }],
        keys: [{ enabled: true, channel_key: "credential-placeholder" }],
        model: "model-a",
        custom_model: "model-b",
        auto_group: OctopusAutoGroupType.None,
        custom_header: [],
      }),
    ])

    expect(mockTempWindowOctopusApiFetch).toHaveBeenCalledOnce()
    const request = mockTempWindowOctopusApiFetch.mock.calls[0][0]
    const headers = new Headers(request.fetchOptions.headers)
    expect(request.fetchOptions.credentials).toBe("include")
    expect(headers.get("Authorization")).toBeNull()
    expect(headers.get("Content-Type")).toBe("application/json")
    expect(request.fetchUrl).toBe(
      "https://octopus.example.com/api/v1/channel/list",
    )
  })

  it("validates cookie configurations through a protected channel read", async () => {
    mockGetValidSession.mockResolvedValueOnce({
      mode: "cookie",
      expireAt: 1_700_000_900_000,
    })
    mockTempWindowOctopusApiFetch.mockResolvedValueOnce({
      success: true,
      status: 200,
      data: { code: 200, data: [] },
      transportLifecycle: {
        upstreamRequestDispatched: true,
        upstreamResponseReceived: true,
      },
    })

    await expect(validateOctopusConfig(config)).resolves.toEqual({
      success: true,
    })

    expect(mockValidateConfig).toHaveBeenCalledWith(config)
    expect(mockTempWindowOctopusApiFetch).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceBinding: "configuration_test",
        protectionBypassExecution: expect.objectContaining({
          kind: "user_command",
          command: "manage_site_channels",
          surface: "options",
        }),
      }),
    )
  })

  it("does not probe channels after authentication validation fails", async () => {
    mockValidateConfig.mockResolvedValueOnce({
      success: false,
      error: "bad credentials",
    })

    await expect(validateOctopusConfig(config)).resolves.toEqual({
      success: false,
      error: "bad credentials",
    })
    expect(mockGetValidSession).not.toHaveBeenCalled()
    expect(mockTempWindowOctopusApiFetch).not.toHaveBeenCalled()
  })

  it("does not dispatch a cookie request when the caller already aborted", async () => {
    const controller = new AbortController()
    controller.abort(new DOMException("cancelled", "AbortError"))

    await expect(
      listChannels(config, { signal: controller.signal }),
    ).rejects.toThrow(/cancelled/i)

    expect(mockGetValidSession).not.toHaveBeenCalled()
    expect(mockTempWindowOctopusApiFetch).not.toHaveBeenCalled()
  })

  it("establishes a same-origin cookie session after 401 and retries the mutation", async () => {
    mockGetValidSession.mockResolvedValueOnce({
      mode: "cookie",
      expireAt: 1_700_000_900_000,
    })
    mockTempWindowOctopusApiFetch
      .mockResolvedValueOnce({
        success: false,
        status: 401,
        error: "unauthorized",
        transportLifecycle: {
          upstreamRequestDispatched: true,
          upstreamResponseReceived: true,
        },
      })
      .mockResolvedValueOnce({
        success: true,
        status: 200,
        data: { code: 200, data: "login successfully" },
        transportLifecycle: {
          upstreamRequestDispatched: true,
          upstreamResponseReceived: true,
        },
      })
      .mockResolvedValueOnce({
        success: true,
        status: 200,
        data: { code: 200, data: { id: 7, name: "Example" } },
        transportLifecycle: {
          upstreamRequestDispatched: true,
          upstreamResponseReceived: true,
        },
      })

    await expect(
      createChannel(config, {
        name: "Example",
        type: OctopusOutboundType.OpenAIChat,
        keys: [{ enabled: true, channel_key: "credential-placeholder" }],
        base_urls: [{ url: "https://upstream.example.invalid" }],
        model: "model-a",
      }),
    ).resolves.toMatchObject({ success: true, data: { id: 7 } })

    expect(
      JSON.parse(
        mockTempWindowOctopusApiFetch.mock.calls[0][0].fetchOptions.body,
      ),
    ).toEqual({
      name: "Example",
      type: "openai",
      base_url: "https://upstream.example.invalid",
      key: "credential-placeholder",
      model: "model-a",
    })

    expect(
      mockTempWindowOctopusApiFetch.mock.calls.map(
        ([request]) => new URL(request.fetchUrl).pathname,
      ),
    ).toEqual([
      "/api/v1/channel/create",
      "/api/v1/user/login",
      "/api/v1/channel/create",
    ])
    expect(
      JSON.parse(
        mockTempWindowOctopusApiFetch.mock.calls[1][0].fetchOptions.body,
      ),
    ).toEqual({ username: "alice", password: "secret" })
    expect(
      mockTempWindowOctopusApiFetch.mock.calls[2][0].fetchOptions.body,
    ).toBe(mockTempWindowOctopusApiFetch.mock.calls[0][0].fetchOptions.body)
  })

  it("adapts cookie-era update and model-probe payloads without changing the legacy caller contract", async () => {
    mockGetValidSession.mockResolvedValue({
      mode: "cookie",
      expireAt: 1_700_000_900_000,
    })
    mockTempWindowOctopusApiFetch
      .mockResolvedValueOnce({
        success: true,
        status: 200,
        data: {
          code: 200,
          data: {
            id: 7,
            name: "Updated",
            type: "anthropic",
            enabled: true,
            base_url: "https://upstream.example.invalid/v1",
            key: "credential-placeholder",
            model: "model-a",
            custom_model: "",
            proxy: false,
            auto_sync: true,
            custom_header: [],
          },
        },
        transportLifecycle: {
          upstreamRequestDispatched: true,
          upstreamResponseReceived: true,
        },
      })
      .mockResolvedValueOnce({
        success: true,
        status: 200,
        data: { code: 200, data: ["model-a"] },
        transportLifecycle: {
          upstreamRequestDispatched: true,
          upstreamResponseReceived: true,
        },
      })

    await expect(
      updateChannel(config, {
        id: 7,
        type: OctopusOutboundType.Anthropic,
        base_urls: [{ url: "https://upstream.example.invalid/v1" }],
        model: "model-a",
        keys_to_add: [{ enabled: true, channel_key: "credential-placeholder" }],
      }),
    ).resolves.toMatchObject({
      success: true,
      data: {
        type: OctopusOutboundType.Anthropic,
        base_urls: [{ url: "https://upstream.example.invalid/v1" }],
        keys: [{ enabled: true, channel_key: "credential-placeholder" }],
      },
    })

    await expect(
      fetchRemoteModels(config, {
        type: OctopusOutboundType.Gemini,
        base_urls: [{ url: "https://models.example.invalid/v1" }],
        keys: [{ enabled: true, channel_key: "credential-placeholder" }],
        proxy: false,
      }),
    ).resolves.toEqual(["model-a"])

    expect(
      JSON.parse(
        mockTempWindowOctopusApiFetch.mock.calls[0][0].fetchOptions.body,
      ),
    ).toEqual({
      id: 7,
      type: "anthropic",
      base_url: "https://upstream.example.invalid/v1",
      key: "credential-placeholder",
      model: "model-a",
    })
    expect(
      JSON.parse(
        mockTempWindowOctopusApiFetch.mock.calls[1][0].fetchOptions.body,
      ),
    ).toEqual({
      type: "gemini",
      base_url: "https://models.example.invalid/v1",
      key: "credential-placeholder",
      proxy: false,
    })
  })

  it("rejects the removed embedding-only type before a cookie request is dispatched", async () => {
    mockGetValidSession.mockResolvedValueOnce({
      mode: "cookie",
      expireAt: 1_700_000_900_000,
    })

    await expect(
      fetchRemoteModels(config, {
        type: OctopusOutboundType.OpenAIEmbedding,
        base_urls: [{ url: "https://models.example.invalid/v1" }],
        keys: [{ enabled: true, channel_key: "credential-placeholder" }],
      }),
    ).rejects.toThrow(/no longer supports.*Embedding/i)

    expect(mockTempWindowOctopusApiFetch).not.toHaveBeenCalled()
  })

  it("classifies an invalid cookie mutation type as not dispatched", async () => {
    mockGetValidSession.mockResolvedValueOnce({
      mode: "cookie",
      expireAt: 1_700_000_900_000,
    })

    const failure = await createChannel(config, {
      name: "Invalid type",
      type: 99 as OctopusOutboundType,
      base_urls: [{ url: "https://upstream.example.invalid/v1" }],
      keys: [{ enabled: true, channel_key: "credential-placeholder" }],
    }).catch((error: unknown) => error)

    expect(failure).toMatchObject({
      name: "OctopusMutationApiError",
      dispatch: "not-dispatched",
      responseReceived: false,
      confirmedNonApplication: true,
      raw: expect.objectContaining({
        message: "Unsupported Octopus channel type: 99",
      }),
    })
    expect(mockTempWindowOctopusApiFetch).not.toHaveBeenCalled()
  })

  it("rejects legacy per-key deletion before a current cookie mutation is dispatched", async () => {
    mockGetValidSession.mockResolvedValueOnce({
      mode: "cookie",
      expireAt: 1_700_000_900_000,
    })

    await expect(
      updateChannel(config, { id: 7, keys_to_delete: [3] }),
    ).rejects.toMatchObject({
      name: "OctopusMutationApiError",
      dispatch: "not-dispatched",
      responseReceived: false,
      confirmedNonApplication: true,
      raw: expect.objectContaining({
        message: expect.stringMatching(/cannot delete individual legacy/i),
      }),
    })
    expect(mockTempWindowOctopusApiFetch).not.toHaveBeenCalled()
  })

  it.each([
    {
      name: "multiple Base URLs",
      invoke: () =>
        createChannel(config, {
          name: "Multiple URLs",
          type: OctopusOutboundType.OpenAIChat,
          base_urls: [
            { url: "https://primary.example.invalid/v1" },
            { url: "https://secondary.example.invalid/v1" },
          ],
          keys: [{ enabled: true, channel_key: "credential-placeholder" }],
        }),
    },
    {
      name: "multiple keys",
      invoke: () =>
        createChannel(config, {
          name: "Multiple keys",
          type: OctopusOutboundType.OpenAIChat,
          base_urls: [{ url: "https://upstream.example.invalid/v1" }],
          keys: [
            { enabled: true, channel_key: "credential-placeholder-a" },
            { enabled: true, channel_key: "credential-placeholder-b" },
          ],
        }),
    },
    {
      name: "per-key update",
      invoke: () =>
        updateChannel(config, {
          id: 7,
          keys_to_add: [
            { enabled: true, channel_key: "credential-placeholder-a" },
          ],
          keys_to_update: [{ id: 3, channel_key: "credential-placeholder-b" }],
        }),
    },
    {
      name: "automatic grouping",
      invoke: () =>
        updateChannel(config, {
          id: 7,
          auto_group: OctopusAutoGroupType.Fuzzy,
        }),
    },
  ])(
    "rejects unrepresentable cookie mutation data: $name",
    async ({ invoke }) => {
      mockGetValidSession.mockResolvedValueOnce({
        mode: "cookie",
        expireAt: 1_700_000_900_000,
      })

      await expect(invoke()).rejects.toMatchObject({
        name: "OctopusMutationApiError",
        dispatch: "not-dispatched",
        responseReceived: false,
        confirmedNonApplication: true,
      })
      expect(mockTempWindowOctopusApiFetch).not.toHaveBeenCalled()
    },
  )

  it("preserves one model-sync execution across cookie login and retry", async () => {
    const execution = createAutomaticProtectionBypassExecution(
      PROTECTION_BYPASS_FEATURES.ManagedSiteModelSync,
      PROTECTION_BYPASS_AUTOMATIC_TRIGGERS.Scheduled,
      PROTECTION_BYPASS_SURFACES.Background,
    )
    mockGetValidSession.mockResolvedValueOnce({
      mode: "cookie",
      expireAt: 1_700_000_900_000,
    })
    mockTempWindowOctopusApiFetch
      .mockResolvedValueOnce({
        success: false,
        status: 401,
        error: "unauthorized",
        transportLifecycle: {
          upstreamRequestDispatched: true,
          upstreamResponseReceived: true,
        },
      })
      .mockResolvedValueOnce({
        success: true,
        status: 200,
        data: { code: 200, data: "login successfully" },
        transportLifecycle: {
          upstreamRequestDispatched: true,
          upstreamResponseReceived: true,
        },
      })
      .mockResolvedValueOnce({
        success: true,
        status: 200,
        data: { code: 200, data: [] },
        transportLifecycle: {
          upstreamRequestDispatched: true,
          upstreamResponseReceived: true,
        },
      })

    await expect(
      listChannels(config, { protectionBypassExecution: execution }),
    ).resolves.toEqual([])

    expect(mockTempWindowOctopusApiFetch).toHaveBeenCalledTimes(3)
    for (const [request] of mockTempWindowOctopusApiFetch.mock.calls) {
      expect(request.protectionBypassExecution).toBe(execution)
    }
  })

  it("renegotiates once when a cached legacy JWT receives 401", async () => {
    mockGetValidSession
      .mockResolvedValueOnce({
        mode: "bearer",
        token: "expired-jwt",
        expireAt: 1_700_000_900_000,
      })
      .mockResolvedValueOnce({
        mode: "cookie",
        expireAt: 1_700_000_900_000,
      })
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        new Response(JSON.stringify({ message: "unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    )
    mockTempWindowOctopusApiFetch.mockResolvedValueOnce({
      success: true,
      status: 200,
      data: { code: 200, data: [] },
      transportLifecycle: {
        upstreamRequestDispatched: true,
        upstreamResponseReceived: true,
      },
    })

    await expect(listChannels(config)).resolves.toEqual([])

    expect(mockClearCache).toHaveBeenCalledWith(config.baseUrl, config.username)
    expect(mockGetValidSession).toHaveBeenCalledTimes(2)
    expect(mockTempWindowOctopusApiFetch).toHaveBeenCalledOnce()
  })

  it("does not renegotiate repeatedly when refreshed JWT auth still returns 401", async () => {
    mockGetValidSession
      .mockResolvedValueOnce({
        mode: "bearer",
        token: "expired-jwt",
        expireAt: 1_700_000_900_000,
      })
      .mockResolvedValueOnce({
        mode: "bearer",
        token: "replacement-jwt",
        expireAt: 1_700_000_900_000,
      })
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: "unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    )
    vi.stubGlobal("fetch", fetchMock)

    await expect(listChannels(config)).rejects.toThrow(/HTTP 401/i)

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(mockGetValidSession).toHaveBeenCalledTimes(2)
    expect(mockClearCache).toHaveBeenCalledTimes(1)
  })

  it("filters searched channels by name and upstream URL", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              success: true,
              data: [
                {
                  id: 1,
                  name: "OpenAI Main",
                  base_urls: [{ url: "https://api.openai.com/v1" }],
                },
                {
                  id: 2,
                  name: "Claude",
                  base_urls: [{ url: "https://claude.example.com/v1" }],
                },
              ],
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          ),
        ),
      ),
    )

    await expect(searchChannels(config, "openai")).resolves.toHaveLength(1)
    await expect(searchChannels(config, "claude.example.com")).resolves.toEqual(
      [
        {
          id: 2,
          name: "Claude",
          base_urls: [{ url: "https://claude.example.com/v1" }],
        },
      ],
    )
  })

  it("returns all channels when the search keyword is blank", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: [
              {
                id: 1,
                name: "OpenAI Main",
                base_urls: [{ url: "https://api.openai.com/v1" }],
              },
              {
                id: 2,
                name: "Claude",
                base_urls: [{ url: "https://claude.example.com/v1" }],
              },
            ],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      ),
    )

    await expect(searchChannels(config, "")).resolves.toEqual([
      {
        id: 1,
        name: "OpenAI Main",
        base_urls: [{ url: "https://api.openai.com/v1" }],
      },
      {
        id: 2,
        name: "Claude",
        base_urls: [{ url: "https://claude.example.com/v1" }],
      },
    ])
  })

  it("creates, updates, and deletes channels with the expected request payloads", async () => {
    const fetchMock = vi.fn()
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: { id: 1, name: "Created" },
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: { id: 1, name: "Updated" },
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: null,
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      )
    vi.stubGlobal("fetch", fetchMock)

    const createPayload = {
      name: "Created",
      type: OctopusOutboundType.OpenAIChat,
      base_urls: [{ url: "https://api.example.com/v1" }],
      keys: [{ enabled: true, channel_key: "sk-created" }],
      auto_group: OctopusAutoGroupType.None,
    }

    await createChannel(config, createPayload)
    await updateChannel(config, { id: 1, name: "Updated" })
    await deleteChannel(config, 1)

    expect(fetchMock.mock.calls[0]).toMatchObject([
      "https://octopus.example.com/api/v1/channel/create",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(createPayload),
      }),
    ])
    expect(fetchMock.mock.calls[1]).toMatchObject([
      "https://octopus.example.com/api/v1/channel/update",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ id: 1, name: "Updated" }),
      }),
    ])
    expect(fetchMock.mock.calls[2]).toMatchObject([
      "https://octopus.example.com/api/v1/channel/delete/1",
      expect.objectContaining({
        method: "DELETE",
      }),
    ])
  })

  it("keeps the legacy JWT model-probe payload unchanged", async () => {
    const payload = {
      type: OctopusOutboundType.OpenAIEmbedding,
      base_urls: [{ url: "https://models.example.invalid/v1" }],
      keys: [{ enabled: true, channel_key: "credential-placeholder" }],
      proxy: false,
    }
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({ success: true, data: ["embedding-model"] }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    )
    vi.stubGlobal("fetch", fetchMock)

    await expect(fetchRemoteModels(config, payload)).resolves.toEqual([
      "embedding-model",
    ])

    expect(fetchMock.mock.calls[0]).toMatchObject([
      "https://octopus.example.com/api/v1/channel/fetch-model",
      expect.objectContaining({ body: JSON.stringify(payload) }),
    ])
  })

  const mutations = [
    {
      name: "create",
      log: "Failed to create channel",
      invoke: () =>
        createChannel(config, {
          name: "Created",
          type: OctopusOutboundType.OpenAIChat,
          base_urls: [{ url: "https://api.example.invalid/v1" }],
          keys: [{ enabled: true, channel_key: "sk-example" }],
          auto_group: OctopusAutoGroupType.None,
        }),
    },
    {
      name: "update",
      log: "Failed to update channel",
      invoke: () => updateChannel(config, { id: 1, name: "Updated" }),
    },
    {
      name: "delete",
      log: "Failed to delete channel",
      invoke: () => deleteChannel(config, 1),
    },
  ] as const

  it.each(mutations)(
    "$name marks documented failure envelopes as affirmative rejections",
    async ({ log, invoke }) => {
      const envelope = {
        success: false,
        data: null,
        message: "provider rejected",
      }
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValueOnce(
          new Response(JSON.stringify(envelope), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        ),
      )

      await expect(invoke()).rejects.toMatchObject({
        name: "OctopusMutationApiError",
        dispatch: "dispatched",
        responseReceived: true,
        confirmedNonApplication: true,
        raw: envelope,
      })
      expect(mockLogger.error).toHaveBeenLastCalledWith(log)
    },
  )

  it.each(mutations)(
    "$name keeps generic HTTP client errors ambiguous after dispatch",
    async ({ log, invoke }) => {
      const fetchMock = vi.fn().mockResolvedValueOnce(
        new Response(JSON.stringify({ message: "access denied" }), {
          status: 403,
          statusText: "Forbidden",
          headers: { "Content-Type": "application/json" },
        }),
      )
      vi.stubGlobal("fetch", fetchMock)

      await expect(invoke()).rejects.toMatchObject({
        name: "OctopusMutationApiError",
        dispatch: "dispatched",
        responseReceived: true,
        confirmedNonApplication: false,
        statusCode: 403,
        raw: expect.objectContaining({
          message: "HTTP 403 Forbidden: access denied",
        }),
      })
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(mockLogger.error).toHaveBeenLastCalledWith(log)
    },
  )

  it.each(mutations)(
    "$name keeps network loss after mutation fetch dispatch ambiguous",
    async ({ log, invoke }) => {
      const networkError = new TypeError("Failed to fetch")
      vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(networkError))

      await expect(invoke()).rejects.toMatchObject({
        name: "OctopusMutationApiError",
        dispatch: "dispatched",
        responseReceived: false,
        confirmedNonApplication: false,
        raw: networkError,
      })
      expect(mockLogger.error).toHaveBeenLastCalledWith(log)
    },
  )

  it.each(mutations)(
    "$name marks auth failure before mutation fetch as not dispatched",
    async ({ log, invoke }) => {
      const authError = new Error("authentication failed")
      mockGetValidSession.mockRejectedValueOnce(authError)
      const fetchMock = vi.fn()
      vi.stubGlobal("fetch", fetchMock)

      await expect(invoke()).rejects.toMatchObject({
        name: "OctopusMutationApiError",
        dispatch: "not-dispatched",
        responseReceived: false,
        confirmedNonApplication: true,
        raw: authError,
      })
      expect(fetchMock).not.toHaveBeenCalled()
      expect(mockLogger.error).toHaveBeenLastCalledWith(log)
    },
  )

  it.each([
    { code: "AUTH_EXPIRED", expectedCode: "AUTH_EXPIRED" },
    { code: 41, expectedCode: 41 },
    { code: 1.5, expectedCode: undefined },
  ])(
    "keeps only operational auth error code $code",
    async ({ code, expectedCode }) => {
      const raw = { code }
      mockGetValidSession.mockRejectedValueOnce(raw)

      const failure = await updateChannel(config, { id: 1 }).catch(
        (error: unknown) => error,
      )

      expect(failure).toMatchObject({
        name: "OctopusMutationApiError",
        message: "Octopus mutation failed",
        dispatch: "not-dispatched",
        raw,
      })
      expect((failure as OctopusMutationApiError).code).toBe(expectedCode)
    },
  )

  it("uses a default AbortError when a pre-dispatch signal has no reason", async () => {
    const signal = {
      aborted: true,
      reason: undefined,
    } as AbortSignal
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)

    const failure = await updateChannel(config, { id: 1 }, { signal }).catch(
      (error: unknown) => error,
    )

    expect(failure).toMatchObject({
      name: "OctopusMutationApiError",
      message: "The operation was aborted",
      dispatch: "not-dispatched",
      responseReceived: false,
      confirmedNonApplication: true,
      raw: expect.objectContaining({ name: "AbortError" }),
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("exports a concrete mutation error type for adapter evidence checks", () => {
    expect(OctopusMutationApiError).toBeTypeOf("function")
  })

  const managedSiteMutations = [
    {
      name: "create",
      invoke: () =>
        octopusManagedSiteChannels.create(config, {
          mode: "single",
          channel: { name: "Created", status: 1 },
        }),
    },
    {
      name: "update",
      invoke: () =>
        octopusManagedSiteChannels.update(config, { id: 1, name: "Updated" }),
    },
    {
      name: "delete",
      invoke: () => octopusManagedSiteChannels.delete(config, 1),
    },
  ] as const

  it.each(managedSiteMutations)(
    "$name classifies a real Octopus failure envelope as rejected",
    async ({ invoke }) => {
      const envelope = {
        success: false,
        data: null,
        message: "provider rejected",
      }
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValueOnce(
          new Response(JSON.stringify(envelope), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        ),
      )

      await expect(invoke()).resolves.toEqual({
        outcome: "rejected",
        diagnostic: {
          message: "provider rejected",
          statusCode: 200,
          raw: envelope,
        },
      })
    },
  )

  it.each(managedSiteMutations)(
    "$name does not replay or reject a generic HTTP client error",
    async ({ invoke }) => {
      const fetchMock = vi.fn().mockResolvedValueOnce(
        new Response(JSON.stringify({ message: "access denied" }), {
          status: 403,
          statusText: "Forbidden",
          headers: { "Content-Type": "application/json" },
        }),
      )
      vi.stubGlobal("fetch", fetchMock)

      await expect(invoke()).resolves.toEqual({
        outcome: "uncertain",
        diagnostic: {
          message: "HTTP 403 Forbidden: access denied",
          statusCode: 403,
          raw: expect.objectContaining({
            message: "HTTP 403 Forbidden: access denied",
          }),
        },
      })
      expect(fetchMock).toHaveBeenCalledTimes(1)
    },
  )

  it.each(managedSiteMutations)(
    "$name classifies real Octopus response loss as uncertain",
    async ({ invoke }) => {
      const networkError = new TypeError("Failed to fetch")
      vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(networkError))

      await expect(invoke()).resolves.toEqual({
        outcome: "uncertain",
        diagnostic: { message: "Failed to fetch", raw: networkError },
      })
    },
  )

  it.each(managedSiteMutations)(
    "$name classifies real Octopus auth preflight failure as rejected",
    async ({ invoke }) => {
      const authError = new Error("authentication failed")
      mockGetValidSession.mockRejectedValueOnce(authError)
      const fetchMock = vi.fn()
      vi.stubGlobal("fetch", fetchMock)

      await expect(invoke()).resolves.toEqual({
        outcome: "rejected",
        diagnostic: { message: "authentication failed", raw: authError },
      })
      expect(fetchMock).not.toHaveBeenCalled()
    },
  )

  it("surfaces JSON API errors from fetchRemoteModels", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 500,
            message: "upstream rejected channel",
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      ),
    )

    await expect(
      fetchRemoteModels(config, {
        type: OctopusOutboundType.OpenAIChat,
        base_urls: [{ url: "https://api.example.com/v1" }],
        keys: [{ enabled: true, channel_key: "sk-remote" }],
      }),
    ).rejects.toThrow("upstream rejected channel")
  })

  it("passes the caller abort signal to Octopus channel-list requests", async () => {
    const controller = new AbortController()
    let requestSignal: AbortSignal | undefined

    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init?: RequestInit) => {
        requestSignal = init?.signal ?? undefined
        return new Promise((_resolve, reject) => {
          if (!init?.signal) {
            reject(new Error("missing abort signal"))
            return
          }

          init.signal.addEventListener("abort", () => {
            reject(new DOMException("The operation was aborted", "AbortError"))
          })
        })
      }),
    )

    const request = listChannels(config, { signal: controller.signal })
    const expectation = expect(request).rejects.toThrow(/aborted/i)

    await vi.waitFor(() => expect(requestSignal).toBe(controller.signal))
    controller.abort()

    expect(mockGetValidSession).toHaveBeenCalledWith(config, {
      signal: controller.signal,
    })
    expect(requestSignal?.aborted).toBe(true)
    await expectation
  })

  it("uses the caller signal for Octopus auth and the API request", async () => {
    const callerSignal = new AbortController().signal
    let fetchSignal: AbortSignal | undefined
    mockGetValidSession.mockResolvedValueOnce({
      mode: "bearer",
      token: "jwt-token",
      expireAt: 1_700_000_900_000,
    })

    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init?: RequestInit) => {
        fetchSignal = init?.signal ?? undefined
        return Promise.resolve(
          new Response(JSON.stringify({ success: true, data: [] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        )
      }),
    )

    await expect(
      listChannels(config, { signal: callerSignal }),
    ).resolves.toEqual([])

    expect(mockGetValidSession).toHaveBeenCalledWith(config, {
      signal: callerSignal,
    })
    const authSignal = mockGetValidSession.mock.calls[0][1]?.signal
    expect(authSignal).toBe(fetchSignal)
  })

  it("surfaces raw JSON bodies when an error response cannot be parsed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        new Response("{not-json", {
          status: 500,
          statusText: "Internal Server Error",
          headers: { "Content-Type": "application/json" },
        }),
      ),
    )

    await expect(listChannels(config)).rejects.toThrow(
      "HTTP 500 Internal Server Error: {not-json",
    )
  })

  it("maps available model and group payloads into flat name arrays", async () => {
    const fetchMock = vi.fn()
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: [{ name: "gpt-4o" }, { name: "claude-3-5-sonnet" }],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: [
              { id: 1, name: "default", items: [] },
              { id: 2, name: "vip", items: [] },
            ],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      )
    vi.stubGlobal("fetch", fetchMock)

    await expect(fetchAvailableModels(config)).resolves.toEqual([
      "gpt-4o",
      "claude-3-5-sonnet",
    ])
    await expect(fetchGroups(config)).resolves.toEqual(["default", "vip"])
  })

  it("treats missing model and group data as empty lists", async () => {
    const fetchMock = vi.fn()
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: null,
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: null,
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      )
    vi.stubGlobal("fetch", fetchMock)

    await expect(fetchAvailableModels(config)).resolves.toEqual([])
    await expect(fetchGroups(config)).resolves.toEqual([])
  })

  it("rejects non-JSON and malformed JSON Octopus responses", async () => {
    const fetchMock = vi.fn()
    fetchMock
      .mockResolvedValueOnce(
        new Response("<html>maintenance</html>", {
          status: 200,
          headers: { "Content-Type": "text/html" },
        }),
      )
      .mockResolvedValueOnce(
        new Response("{invalid", {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
    vi.stubGlobal("fetch", fetchMock)

    await expect(fetchAvailableModels(config)).rejects.toThrow(
      "Expected JSON response but got text/html: <html>maintenance</html>",
    )
    await expect(fetchGroups(config)).rejects.toThrow(
      "Failed to parse JSON response from /api/v1/group/list",
    )
  })

  it("returns empty arrays when persisted Octopus preferences are incomplete", async () => {
    mockGetPreferences.mockResolvedValueOnce({
      octopus: {
        baseUrl: "",
        username: "alice",
        password: "secret",
      },
    })
    mockGetPreferences.mockResolvedValueOnce({
      octopus: {
        baseUrl: "https://octopus.example.com",
        username: "",
        password: "secret",
      },
    })

    await expect(fetchSiteUserGroups({} as any)).resolves.toEqual([])
    await expect(fetchAccountAvailableModels({} as any)).resolves.toEqual([])
    expect(mockGetValidSession).not.toHaveBeenCalled()
  })

  it("returns empty arrays when stored Octopus preferences cannot be loaded", async () => {
    mockGetPreferences
      .mockRejectedValueOnce(new Error("storage failed"))
      .mockRejectedValueOnce(new Error("storage failed"))

    await expect(fetchSiteUserGroups({} as any)).resolves.toEqual([])
    await expect(fetchAccountAvailableModels({} as any)).resolves.toEqual([])
  })

  it("uses stored Octopus preferences for group/model discovery and swallows downstream failures", async () => {
    const fetchMock = vi.fn()
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: [{ id: 1, name: "default", items: [] }],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response("upstream unavailable", {
          status: 503,
          headers: { "Content-Type": "text/plain" },
        }),
      )
    vi.stubGlobal("fetch", fetchMock)
    mockGetPreferences
      .mockResolvedValueOnce({
        octopus: {
          baseUrl: "https://octopus.example.com",
          username: "alice",
          password: "secret",
        },
      })
      .mockResolvedValueOnce({
        octopus: {
          baseUrl: "https://octopus.example.com",
          username: "alice",
          password: "secret",
        },
      })

    await expect(fetchSiteUserGroups({} as any)).resolves.toEqual(["default"])
    await expect(fetchAccountAvailableModels({} as any)).resolves.toEqual([])
  })
})
