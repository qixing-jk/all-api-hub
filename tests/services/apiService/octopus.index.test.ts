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
  getChannel,
  listChannels,
  OctopusMutationApiError,
  searchChannels,
  updateChannel,
  validateOctopusConfig,
} from "~/services/apiService/octopus"
import {
  OCTOPUS_AUTH_MODES,
  OCTOPUS_COOKIE_API_VERSIONS,
} from "~/services/apiService/octopus/auth"
import {
  createAutomaticProtectionBypassExecution,
  PROTECTION_BYPASS_AUTOMATIC_TRIGGERS,
  PROTECTION_BYPASS_FEATURES,
  PROTECTION_BYPASS_SURFACES,
} from "~/services/protectionBypass/contracts"
import {
  OctopusAutoGroupType,
  OctopusOutboundType,
  type OctopusChannel,
  type OctopusCreateChannelInput,
  type OctopusCreateChannelRequest,
  type OctopusFetchModelInput,
  type OctopusFetchModelRequest,
  type OctopusUpdateChannelInput,
  type OctopusUpdateChannelRequest,
} from "~/types/octopus"

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

vi.mock("~/services/apiService/octopus/auth", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("~/services/apiService/octopus/auth")
  >()),
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

  const currentCookieSession = () => ({
    mode: OCTOPUS_AUTH_MODES.Cookie,
    expireAt: 1_700_000_900_000,
    confirmed: true,
    apiVersion: OCTOPUS_COOKIE_API_VERSIONS.V012,
  })

  const v013CookieSession = () => ({
    mode: OCTOPUS_AUTH_MODES.Cookie,
    expireAt: 1_700_000_900_000,
    confirmed: true,
    apiVersion: OCTOPUS_COOKIE_API_VERSIONS.V013,
  })

  const currentChannelResponse = (
    overrides: Record<string, unknown> = {},
  ): Record<string, unknown> => ({
    id: 1,
    name: "Current",
    type: "openai",
    enabled: true,
    base_url: "https://api.example.invalid/v1",
    key: "credential-placeholder",
    model: "model-a",
    proxy: false,
    auto_sync: true,
    ...overrides,
  })

  const v013ChannelDetailResponse = (
    overrides: Record<string, unknown> = {},
  ): Record<string, unknown> => ({
    id: 7,
    name: "V0.13 channel",
    dialect: "generic",
    enabled: true,
    base_url: "https://upstream.example.invalid",
    openai_chat_completion_path: "/v1/chat/completions",
    openai_response_path: "/v1/responses",
    anthropic_message_path: "/v1/messages",
    keys: [{ name: "default", key: "credential-placeholder", enabled: true }],
    models: ["model-a"],
    grants: [{ model_name: "model-a", key_name: "default", protocols: 2 }],
    proxy: false,
    custom_header: [],
    param_override: "",
    channel_proxy: "",
    match_regex: "",
    ...overrides,
  })

  const v013ChannelStatsResponse = (
    overrides: Record<string, unknown> = {},
  ): Record<string, unknown> => ({
    channel_id: 7,
    channel_name: "V0.13 channel",
    enabled: true,
    models: [
      {
        model_id: 11,
        model_name: "model-a",
        input_token: 6,
        output_token: 3,
        input_cost: 0.15,
        output_cost: 0.3,
        wait_time: 1,
        request_success: 2,
        request_failed: 0,
      },
      {
        model_id: 12,
        model_name: "model-b",
        input_token: 4,
        output_token: 1,
        input_cost: 0.1,
        output_cost: 0.2,
        wait_time: 0.5,
        request_success: 1,
        request_failed: 1,
      },
    ],
    input_token: 10,
    output_token: 4,
    input_cost: 0.25,
    output_cost: 0.5,
    wait_time: 1.5,
    request_success: 3,
    request_failed: 1,
    ...overrides,
  })

  const createInput = (
    legacy: OctopusCreateChannelRequest,
    current?: Record<string, unknown> & { base_url?: string; key?: string },
  ): OctopusCreateChannelInput => ({
    name: legacy.name,
    type: legacy.type,
    enabled: legacy.enabled,
    baseUrl: current?.base_url ?? legacy.base_urls[0]?.url ?? "",
    key: current?.key ?? legacy.keys[0]?.channel_key ?? "",
    model: legacy.model,
    customModel: legacy.custom_model,
    proxy: legacy.proxy,
    autoSync: legacy.auto_sync,
    customHeaders: legacy.custom_header,
    paramOverride: legacy.param_override,
    channelProxy: legacy.channel_proxy,
    matchRegex: legacy.match_regex,
  })
  const updateInput = (
    legacy: OctopusUpdateChannelRequest,
    current?: Record<string, unknown> & { base_url?: string; key?: string },
  ): OctopusUpdateChannelInput => ({
    id: legacy.id,
    name: legacy.name,
    type: legacy.type,
    enabled: legacy.enabled,
    baseUrl: current?.base_url ?? legacy.base_urls?.[0]?.url,
    key: current?.key ?? legacy.keys_to_add?.[0]?.channel_key,
    model: legacy.model,
    customModel: legacy.custom_model,
    proxy: legacy.proxy,
    autoSync: legacy.auto_sync,
    customHeaders: legacy.custom_header,
    paramOverride: legacy.param_override,
    channelProxy: legacy.channel_proxy,
    matchRegex: legacy.match_regex,
  })
  const fetchModelInput = (
    legacy: OctopusFetchModelRequest,
    current?: Record<string, unknown> & { base_url?: string; key?: string },
  ): OctopusFetchModelInput => ({
    type: legacy.type,
    baseUrl: current?.base_url ?? legacy.base_urls[0]?.url ?? "",
    key: current?.key ?? legacy.keys[0]?.channel_key ?? "",
    proxy: legacy.proxy,
  })

  beforeEach(() => {
    vi.clearAllMocks()
    mockTempWindowOctopusApiFetch.mockReset()
    mockGetValidSession.mockReset()
    mockValidateConfig.mockReset()
    vi.unstubAllGlobals()
    mockGetValidSession.mockResolvedValue({
      mode: OCTOPUS_AUTH_MODES.Bearer,
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
      mode: OCTOPUS_AUTH_MODES.Cookie,
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

  it("uses Octopus v0.13 stats as channel summaries without loading detail", async () => {
    const session = {
      mode: OCTOPUS_AUTH_MODES.Cookie,
      expireAt: 1_700_000_900_000,
      confirmed: false,
    } as const
    mockGetValidSession.mockResolvedValue(session)
    mockTempWindowOctopusApiFetch
      .mockResolvedValueOnce({
        success: false,
        status: 404,
        error: "404 page not found",
      })
      .mockResolvedValueOnce({
        success: true,
        status: 200,
        data: { code: 200, data: [v013ChannelStatsResponse()] },
      })

    await expect(listChannels(config)).resolves.toEqual([
      expect.objectContaining({
        id: 7,
        name: "V0.13 channel",
        type: OctopusOutboundType.OpenAIChat,
        base_urls: [],
        keys: [],
        model: "model-a,model-b",
        auto_group: OctopusAutoGroupType.None,
        stats: {
          channel_id: 7,
          input_token: 10,
          output_token: 4,
          input_cost: 0.25,
          output_cost: 0.5,
          wait_time: 1.5,
          request_success: 3,
          request_failed: 1,
        },
      }),
    ])

    expect(
      mockTempWindowOctopusApiFetch.mock.calls.map(
        ([request]) => new URL(request.fetchUrl).pathname,
      ),
    ).toEqual(["/api/v1/channel/list", "/api/v1/channel/stats"])
  })

  it("uses the stats endpoint directly for a known v0.13 session", async () => {
    const session = v013CookieSession()
    mockGetValidSession.mockResolvedValue(session)
    mockTempWindowOctopusApiFetch.mockResolvedValueOnce({
      success: true,
      status: 200,
      data: { code: 200, data: [v013ChannelStatsResponse()] },
    })

    await expect(listChannels(config)).resolves.toHaveLength(1)

    expect(session.confirmed).toBe(true)
    expect(
      mockTempWindowOctopusApiFetch.mock.calls.map(
        ([request]) => new URL(request.fetchUrl).pathname,
      ),
    ).toEqual(["/api/v1/channel/stats"])
  })

  it.each([
    {
      response: { success: false, status: 503 },
      expected: "HTTP 503: Octopus request failed",
    },
    {
      response: { success: false, error: "protected read unavailable" },
      expected: "protected read unavailable",
    },
  ])(
    "reports a v0.13 stats transport failure as $expected",
    async ({ response, expected }) => {
      const controller = new AbortController()
      mockGetValidSession.mockResolvedValue(v013CookieSession())
      mockTempWindowOctopusApiFetch.mockResolvedValueOnce(response)

      await expect(
        listChannels(config, { signal: controller.signal }),
      ).rejects.toThrow(expected)
    },
  )

  it("uses a local fallback for a rejected v0.13 response envelope", async () => {
    mockGetValidSession.mockResolvedValue(v013CookieSession())
    mockTempWindowOctopusApiFetch.mockResolvedValueOnce({
      success: true,
      status: 200,
      data: { code: 500, message: "   " },
    })

    await expect(listChannels(config)).rejects.toThrow("API request failed")
  })

  it("loads one Octopus v0.13 channel detail only when explicitly requested", async () => {
    mockGetValidSession.mockResolvedValue({
      mode: OCTOPUS_AUTH_MODES.Cookie,
      expireAt: 1_700_000_900_000,
      confirmed: true,
      apiVersion: OCTOPUS_COOKIE_API_VERSIONS.V013,
    })
    mockTempWindowOctopusApiFetch.mockResolvedValueOnce({
      success: true,
      status: 200,
      data: { code: 200, data: v013ChannelDetailResponse() },
    })

    await expect(getChannel(config, 7)).resolves.toEqual(
      expect.objectContaining({
        id: 7,
        name: "V0.13 channel",
        base_urls: [{ url: "https://upstream.example.invalid" }],
        keys: [{ enabled: true, channel_key: "credential-placeholder" }],
        model: "model-a",
      }),
    )
    expect(
      mockTempWindowOctopusApiFetch.mock.calls.map(
        ([request]) => new URL(request.fetchUrl).pathname,
      ),
    ).toEqual(["/api/v1/channel/detail/7"])
  })

  it.each([
    {
      response: { success: false, status: 503 },
      expected: "HTTP 503: Octopus request failed",
    },
    {
      response: { success: false, error: "detail bridge unavailable" },
      expected: "detail bridge unavailable",
    },
  ])(
    "reports a v0.13 detail transport failure as $expected",
    async ({ response, expected }) => {
      mockGetValidSession.mockResolvedValue(v013CookieSession())
      mockTempWindowOctopusApiFetch.mockResolvedValueOnce(response)

      await expect(getChannel(config, 7)).rejects.toThrow(expected)
    },
  )

  it("loads v0.13 detail after list-based version discovery", async () => {
    const session = {
      mode: OCTOPUS_AUTH_MODES.Cookie,
      expireAt: 1_700_000_900_000,
      confirmed: false,
    }
    mockGetValidSession.mockResolvedValue(session)
    mockTempWindowOctopusApiFetch
      .mockResolvedValueOnce({ success: false, status: 404 })
      .mockResolvedValueOnce({
        success: true,
        status: 200,
        data: { code: 200, data: [v013ChannelStatsResponse()] },
      })
      .mockResolvedValueOnce({
        success: true,
        status: 200,
        data: { code: 200, data: v013ChannelDetailResponse() },
      })

    await expect(getChannel(config, 7)).resolves.toMatchObject({
      id: 7,
      base_urls: [{ url: "https://upstream.example.invalid" }],
    })
    expect(
      mockTempWindowOctopusApiFetch.mock.calls.map(
        ([request]) => new URL(request.fetchUrl).pathname,
      ),
    ).toEqual([
      "/api/v1/channel/list",
      "/api/v1/channel/stats",
      "/api/v1/channel/detail/7",
    ])
  })

  it("reports a missing current channel after list fallback", async () => {
    mockGetValidSession.mockResolvedValue(currentCookieSession())
    mockTempWindowOctopusApiFetch.mockResolvedValueOnce({
      success: true,
      status: 200,
      data: { code: 200, data: [] },
    })

    await expect(getChannel(config, 7)).rejects.toThrow(
      "Channel 7 was not found",
    )
  })

  it("returns a matching current channel after list fallback", async () => {
    mockGetValidSession.mockResolvedValue(currentCookieSession())
    mockTempWindowOctopusApiFetch.mockResolvedValueOnce({
      success: true,
      status: 200,
      data: { code: 200, data: [currentChannelResponse({ id: 7 })] },
    })

    await expect(getChannel(config, 7)).resolves.toMatchObject({
      id: 7,
      name: "Current",
    })
  })

  it("encodes Octopus v0.13 channel creation after a harmless contract probe", async () => {
    const session = {
      mode: OCTOPUS_AUTH_MODES.Cookie,
      expireAt: 1_700_000_900_000,
      confirmed: false,
    }
    mockGetValidSession.mockResolvedValue(session)
    mockTempWindowOctopusApiFetch
      .mockResolvedValueOnce({
        success: false,
        status: 404,
        error: "404 page not found",
      })
      .mockResolvedValueOnce({
        success: true,
        status: 200,
        data: { code: 200, data: [] },
      })
      .mockResolvedValueOnce({
        success: true,
        status: 200,
        data: { code: 200, data: v013ChannelDetailResponse() },
      })

    await expect(
      createChannel(config, {
        name: "V0.13 channel",
        type: OctopusOutboundType.OpenAIChat,
        enabled: true,
        baseUrl: "https://upstream.example.invalid",
        key: "credential-placeholder",
        model: "model-a",
      }),
    ).resolves.toMatchObject({
      success: true,
      data: { id: 7, name: "V0.13 channel" },
    })

    expect(
      mockTempWindowOctopusApiFetch.mock.calls.map(
        ([request]) => new URL(request.fetchUrl).pathname,
      ),
    ).toEqual([
      "/api/v1/channel/list",
      "/api/v1/channel/stats",
      "/api/v1/channel/create",
    ])
    expect(
      JSON.parse(
        mockTempWindowOctopusApiFetch.mock.calls[2][0].fetchOptions.body,
      ),
    ).toEqual({
      id: 0,
      name: "V0.13 channel",
      dialect: "generic",
      enabled: true,
      base_url: "https://upstream.example.invalid",
      openai_chat_completion_path: "/v1/chat/completions",
      openai_response_path: "/v1/responses",
      anthropic_message_path: "/v1/messages",
      keys: [{ name: "default", key: "credential-placeholder", enabled: true }],
      models: ["model-a"],
      grants: [{ model_name: "model-a", key_name: "default", protocols: 2 }],
      proxy: false,
      custom_header: [],
      param_override: "",
      channel_proxy: "",
      match_regex: "",
    })
  })

  it("detects the cookie API version before mutation after a version-agnostic read", async () => {
    const session = {
      mode: OCTOPUS_AUTH_MODES.Cookie,
      expireAt: 1_700_000_900_000,
      confirmed: false,
    }
    mockGetValidSession.mockResolvedValue(session)
    mockTempWindowOctopusApiFetch
      .mockResolvedValueOnce({
        success: true,
        status: 200,
        data: { code: 200, data: [] },
      })
      .mockResolvedValueOnce({
        success: false,
        status: 404,
        error: "404 page not found",
      })
      .mockResolvedValueOnce({
        success: true,
        status: 200,
        data: { code: 200, data: [] },
      })
      .mockResolvedValueOnce({
        success: true,
        status: 200,
        data: { code: 200, data: v013ChannelDetailResponse() },
      })

    await expect(fetchAvailableModels(config)).resolves.toEqual([])
    await expect(
      createChannel(config, {
        name: "V0.13 channel",
        type: OctopusOutboundType.OpenAIChat,
        enabled: true,
        baseUrl: "https://upstream.example.invalid",
        key: "credential-placeholder",
        model: "model-a",
      }),
    ).resolves.toMatchObject({ success: true })

    expect(
      mockTempWindowOctopusApiFetch.mock.calls.map(
        ([request]) => new URL(request.fetchUrl).pathname,
      ),
    ).toEqual([
      "/api/v1/model/list",
      "/api/v1/channel/list",
      "/api/v1/channel/stats",
      "/api/v1/channel/create",
    ])
    expect(
      JSON.parse(
        mockTempWindowOctopusApiFetch.mock.calls[3][0].fetchOptions.body,
      ),
    ).toMatchObject({ dialect: "generic", models: ["model-a"] })
  })

  it.each([
    {
      name: "a non-404 current probe failure",
      responses: [{ success: false, status: 503 }],
      expected: "HTTP 503: Octopus session confirmation failed",
    },
    {
      name: "a current probe bridge failure",
      responses: [{ success: false, error: "current probe unavailable" }],
      expected: "current probe unavailable",
    },
    {
      name: "a v0.13 stats probe failure",
      responses: [
        { success: false, status: 404 },
        { success: false, error: "stats bridge unavailable" },
      ],
      expected: "stats bridge unavailable",
    },
    {
      name: "an HTTP v0.13 stats probe failure",
      responses: [
        { success: false, status: 404 },
        { success: false, status: 503 },
      ],
      expected: "HTTP 503: Octopus session confirmation failed",
    },
  ])(
    "does not dispatch a mutation after $name",
    async ({ responses, expected }) => {
      mockGetValidSession.mockResolvedValue({
        mode: OCTOPUS_AUTH_MODES.Cookie,
        expireAt: 1_700_000_900_000,
        confirmed: false,
      })
      for (const response of responses) {
        mockTempWindowOctopusApiFetch.mockResolvedValueOnce(response)
      }

      await expect(
        createChannel(config, {
          name: "Example channel",
          type: OctopusOutboundType.OpenAIChat,
          baseUrl: "https://upstream.example.invalid",
          key: "credential-placeholder",
        }),
      ).rejects.toMatchObject({
        message: expected,
        dispatch: "not-dispatched",
        confirmedNonApplication: true,
      })
    },
  )

  it.each([
    {
      response: { success: false, status: 503 },
      expected: "HTTP 503: Octopus request failed",
    },
    {
      response: { success: false, error: "detail bridge unavailable" },
      expected: "detail bridge unavailable",
    },
    {
      response: { success: false },
      expected: "Octopus request failed",
    },
  ])(
    "stops a v0.13 update when detail loading fails as $expected",
    async ({ response, expected }) => {
      mockGetValidSession.mockResolvedValue(v013CookieSession())
      mockTempWindowOctopusApiFetch.mockResolvedValueOnce(response)

      await expect(
        updateChannel(config, { id: 7, name: "Updated" }),
      ).rejects.toMatchObject({
        message: expected,
        dispatch: "not-dispatched",
        confirmedNonApplication: true,
      })
    },
  )

  it("preserves Octopus v0.13 detail fields while applying a partial update", async () => {
    const existing = v013ChannelDetailResponse({
      keys: [
        { name: "default", key: "credential-placeholder", enabled: true },
        { name: "backup", key: "credential-backup", enabled: false },
      ],
      custom_header: [{ header_key: "x-example", header_value: "preserve" }],
      channel_proxy: "http://proxy.example.invalid:8080",
    })
    const updated = {
      ...existing,
      name: "Updated v0.13 channel",
      models: ["model-a", "model-b"],
      grants: [
        { model_name: "model-a", key_name: "default", protocols: 2 },
        { model_name: "model-b", key_name: "default", protocols: 2 },
      ],
    }
    mockGetValidSession.mockResolvedValue({
      mode: OCTOPUS_AUTH_MODES.Cookie,
      expireAt: 1_700_000_900_000,
      confirmed: false,
    })
    mockTempWindowOctopusApiFetch
      .mockResolvedValueOnce({ success: false, status: 404 })
      .mockResolvedValueOnce({
        success: true,
        status: 200,
        data: { code: 200, data: [] },
      })
      .mockResolvedValueOnce({
        success: true,
        status: 200,
        data: { code: 200, data: existing },
      })
      .mockResolvedValueOnce({
        success: true,
        status: 200,
        data: { code: 200, data: updated },
      })

    await expect(
      updateChannel(config, {
        id: 7,
        name: "Updated v0.13 channel",
        type: OctopusOutboundType.OpenAIChat,
        model: "model-a,model-b",
      }),
    ).resolves.toMatchObject({
      success: true,
      data: { id: 7, name: "Updated v0.13 channel", model: "model-a,model-b" },
    })

    expect(
      mockTempWindowOctopusApiFetch.mock.calls.map(
        ([request]) => new URL(request.fetchUrl).pathname,
      ),
    ).toEqual([
      "/api/v1/channel/list",
      "/api/v1/channel/stats",
      "/api/v1/channel/detail/7",
      "/api/v1/channel/update",
    ])
    expect(
      JSON.parse(
        mockTempWindowOctopusApiFetch.mock.calls[3][0].fetchOptions.body,
      ),
    ).toEqual(updated)
  })

  it("validates cookie configurations through a protected channel read", async () => {
    mockGetValidSession.mockResolvedValueOnce({
      mode: OCTOPUS_AUTH_MODES.Cookie,
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

    await expect(
      validateOctopusConfig(config, PROTECTION_BYPASS_SURFACES.Options),
    ).resolves.toEqual({
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

    await expect(
      validateOctopusConfig(config, PROTECTION_BYPASS_SURFACES.Options),
    ).resolves.toEqual({
      success: false,
      error: "bad credentials",
    })
    expect(mockGetValidSession).not.toHaveBeenCalled()
    expect(mockTempWindowOctopusApiFetch).not.toHaveBeenCalled()
  })

  it("returns a controlled validation failure when the protected read fails", async () => {
    mockGetValidSession.mockResolvedValueOnce({
      mode: OCTOPUS_AUTH_MODES.Cookie,
      expireAt: 1_700_000_900_000,
    })
    mockTempWindowOctopusApiFetch.mockResolvedValueOnce({
      success: false,
      error: "protected read unavailable",
    })

    await expect(
      validateOctopusConfig(config, PROTECTION_BYPASS_SURFACES.Options),
    ).resolves.toEqual({
      success: false,
      error: "protected read unavailable",
    })
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
    mockGetValidSession.mockResolvedValueOnce(currentCookieSession())
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
        data: {
          code: 200,
          data: {
            id: 7,
            name: "Example",
            type: "openai",
            enabled: true,
            base_url: "https://upstream.example.invalid",
            key: "credential-placeholder",
            model: "model-a",
            proxy: false,
            auto_sync: true,
          },
        },
        transportLifecycle: {
          upstreamRequestDispatched: true,
          upstreamResponseReceived: true,
        },
      })

    await expect(
      createChannel(
        config,
        createInput(
          {
            name: "Example",
            type: OctopusOutboundType.OpenAIChat,
            keys: [{ enabled: true, channel_key: "credential-placeholder" }],
            base_urls: [{ url: "https://upstream.example.invalid" }],
            model: "model-a",
          },
          {
            name: "Example",
            type: "openai",
            base_url: "https://upstream.example.invalid",
            key: "credential-placeholder",
            model: "model-a",
          },
        ),
      ),
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

  it.each([
    {
      name: "a bridge failure",
      login: { success: false, error: "cookie login bridge failed" },
      expected: "cookie login bridge failed",
    },
    {
      name: "a bridge failure without a message",
      login: { success: false },
      expected: "Octopus cookie login failed",
    },
    {
      name: "a string login body",
      login: { success: true, data: "login successfully" },
      expected: "Octopus cookie login failed",
    },
    {
      name: "a null login body",
      login: { success: true, data: null },
      expected: "Octopus cookie login failed",
    },
    {
      name: "an array login body",
      login: { success: true, data: [] },
      expected: "Octopus cookie login failed",
    },
    {
      name: "a rejected login envelope",
      login: { success: true, data: { code: 403, message: "login denied" } },
      expected: "login denied",
    },
  ])(
    "fails closed after cookie 401 when login returns $name",
    async ({ login, expected }) => {
      mockGetValidSession.mockResolvedValueOnce(currentCookieSession())
      mockTempWindowOctopusApiFetch
        .mockResolvedValueOnce({
          success: false,
          status: 401,
          error: "unauthorized",
        })
        .mockResolvedValueOnce(login)

      await expect(deleteChannel(config, 7)).rejects.toMatchObject({
        message: expected,
        dispatch: "dispatched",
        responseReceived: false,
        confirmedNonApplication: false,
      })
      expect(
        mockTempWindowOctopusApiFetch.mock.calls.map(
          ([request]) => new URL(request.fetchUrl).pathname,
        ),
      ).toEqual(["/api/v1/channel/delete/7", "/api/v1/user/login"])
    },
  )

  it("confirms a tokenless login candidate with a harmless read before mutation", async () => {
    const controller = new AbortController()
    mockGetValidSession.mockResolvedValueOnce({
      mode: OCTOPUS_AUTH_MODES.Cookie,
      expireAt: 1_700_000_900_000,
      confirmed: false,
    })
    mockTempWindowOctopusApiFetch
      .mockResolvedValueOnce({
        success: true,
        status: 200,
        data: { code: 200, data: [] },
      })
      .mockResolvedValueOnce({
        success: true,
        status: 200,
        data: { code: 200, data: null },
      })

    await expect(
      updateChannel(
        config,
        updateInput({ id: 7 }, { id: 7, name: "Updated" }),
        { signal: controller.signal },
      ),
    ).resolves.toMatchObject({ success: true })

    expect(
      mockTempWindowOctopusApiFetch.mock.calls.map(
        ([request]) => new URL(request.fetchUrl).pathname,
      ),
    ).toEqual(["/api/v1/channel/list", "/api/v1/channel/update"])
    expect(
      mockTempWindowOctopusApiFetch.mock.calls[0][0].fetchOptions.signal,
    ).toBe(controller.signal)
  })

  it.each([
    {
      name: "transport rejection",
      confirmation: { success: false, status: 403, error: "read blocked" },
      expected: "HTTP 403: read blocked",
    },
    {
      name: "rejected envelope",
      confirmation: {
        success: true,
        status: 200,
        data: { code: 403, message: "session denied" },
      },
      expected: "session denied",
    },
    {
      name: "malformed envelope",
      confirmation: { success: true, status: 200, data: null },
      expected: "Invalid Octopus response",
    },
  ])(
    "does not dispatch a mutation after candidate $name",
    async ({ confirmation, expected }) => {
      mockGetValidSession.mockResolvedValueOnce({
        mode: OCTOPUS_AUTH_MODES.Cookie,
        expireAt: 1_700_000_900_000,
        confirmed: false,
      })
      mockTempWindowOctopusApiFetch.mockResolvedValueOnce(confirmation)

      await expect(deleteChannel(config, 7)).rejects.toMatchObject({
        message: expect.stringContaining(expected),
        dispatch: "not-dispatched",
        confirmedNonApplication: true,
      })
      expect(mockTempWindowOctopusApiFetch).toHaveBeenCalledTimes(1)
      expect(
        new URL(mockTempWindowOctopusApiFetch.mock.calls[0][0].fetchUrl)
          .pathname,
      ).toBe("/api/v1/channel/list")
    },
  )

  it("selects explicit current update and model-probe payloads", async () => {
    mockGetValidSession.mockResolvedValue(currentCookieSession())
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
      updateChannel(
        config,
        updateInput(
          {
            id: 7,
            type: OctopusOutboundType.Anthropic,
            base_urls: [{ url: "https://upstream.example.invalid/v1" }],
            model: "model-a",
            keys_to_add: [
              { enabled: true, channel_key: "credential-placeholder" },
            ],
          },
          {
            id: 7,
            type: "anthropic",
            base_url: "https://upstream.example.invalid/v1",
            key: "credential-placeholder",
            model: "model-a",
          },
        ),
      ),
    ).resolves.toMatchObject({
      success: true,
      data: {
        type: OctopusOutboundType.Anthropic,
        base_urls: [{ url: "https://upstream.example.invalid/v1" }],
        keys: [{ enabled: true, channel_key: "credential-placeholder" }],
      },
    })

    await expect(
      fetchRemoteModels(
        config,
        fetchModelInput(
          {
            type: OctopusOutboundType.Gemini,
            base_urls: [{ url: "https://models.example.invalid/v1" }],
            keys: [{ enabled: true, channel_key: "credential-placeholder" }],
            proxy: false,
          },
          {
            type: "gemini",
            base_url: "https://models.example.invalid/v1",
            key: "credential-placeholder",
            proxy: false,
          },
        ),
      ),
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

  it("includes current-only channel settings in a current model probe", async () => {
    mockGetValidSession.mockResolvedValueOnce(currentCookieSession())
    mockTempWindowOctopusApiFetch.mockResolvedValueOnce({
      success: true,
      status: 200,
      data: { code: 200, data: ["response-model"] },
    })
    const source = {
      id: 7,
      name: "Responses",
      type: OctopusOutboundType.OpenAIResponse,
      enabled: true,
      base_urls: [{ url: "https://responses.example.invalid/v1" }],
      keys: [{ enabled: true, channel_key: "credential-placeholder" }],
      model: "response-model",
      proxy: false,
      auto_sync: true,
      auto_group: OctopusAutoGroupType.Regex,
      channel_proxy: "http://proxy.example.invalid:8080",
      match_regex: "^response-",
      custom_header: [{ header_key: "x-example", header_value: "probe" }],
    } satisfies OctopusChannel

    await expect(
      fetchRemoteModels(config, {
        type: source.type,
        baseUrl: source.base_urls[0].url,
        key: source.keys[0].channel_key,
        proxy: source.proxy,
        source,
      }),
    ).resolves.toEqual(["response-model"])

    expect(
      JSON.parse(
        mockTempWindowOctopusApiFetch.mock.calls[0][0].fetchOptions.body,
      ),
    ).toEqual({
      type: "openai_responses",
      base_url: "https://responses.example.invalid/v1",
      key: "credential-placeholder",
      proxy: false,
      channel_proxy: "http://proxy.example.invalid:8080",
      match_regex: "^response-",
      custom_header: [{ header_key: "x-example", header_value: "probe" }],
    })
  })

  it("rejects the removed embedding-only type before a cookie request is dispatched", async () => {
    mockGetValidSession.mockResolvedValueOnce(currentCookieSession())

    await expect(
      fetchRemoteModels(
        config,
        fetchModelInput({
          type: OctopusOutboundType.OpenAIEmbedding,
          base_urls: [{ url: "https://models.example.invalid/v1" }],
          keys: [{ enabled: true, channel_key: "credential-placeholder" }],
        }),
      ),
    ).rejects.toThrow(/cannot represent this channel operation/i)

    expect(mockTempWindowOctopusApiFetch).not.toHaveBeenCalled()
  })

  it("classifies an invalid cookie mutation type as not dispatched", async () => {
    mockGetValidSession.mockResolvedValueOnce(currentCookieSession())

    const failure = await createChannel(
      config,
      createInput({
        name: "Invalid type",
        type: 99 as OctopusOutboundType,
        base_urls: [{ url: "https://upstream.example.invalid/v1" }],
        keys: [{ enabled: true, channel_key: "credential-placeholder" }],
      }),
    ).catch((error: unknown) => error)

    expect(failure).toMatchObject({
      name: "OctopusMutationApiError",
      dispatch: "not-dispatched",
      responseReceived: false,
      confirmedNonApplication: true,
      raw: expect.objectContaining({
        message: expect.stringMatching(/cannot represent/i),
      }),
    })
    expect(mockTempWindowOctopusApiFetch).not.toHaveBeenCalled()
  })

  it("does not forward legacy-only update fields to the current contract", async () => {
    mockGetValidSession.mockResolvedValueOnce(currentCookieSession())
    mockTempWindowOctopusApiFetch.mockResolvedValueOnce({
      success: true,
      status: 200,
      data: { code: 200, data: null },
    })

    await updateChannel(config, {
      id: 7,
      keys_to_delete: [3],
    } as unknown as OctopusUpdateChannelInput)

    expect(
      JSON.parse(
        mockTempWindowOctopusApiFetch.mock.calls[0][0].fetchOptions.body,
      ),
    ).toEqual({ id: 7 })
  })

  it("preserves one model-sync execution across cookie login and retry", async () => {
    const execution = createAutomaticProtectionBypassExecution(
      PROTECTION_BYPASS_FEATURES.ManagedSiteModelSync,
      PROTECTION_BYPASS_AUTOMATIC_TRIGGERS.Scheduled,
      PROTECTION_BYPASS_SURFACES.Background,
    )
    mockGetValidSession.mockResolvedValueOnce({
      mode: OCTOPUS_AUTH_MODES.Cookie,
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

  it("owns cookie 401 recovery in one layer and retries only once", async () => {
    mockGetValidSession.mockResolvedValue({
      mode: OCTOPUS_AUTH_MODES.Cookie,
      expireAt: 1_700_000_900_000,
    })
    mockTempWindowOctopusApiFetch
      .mockResolvedValueOnce({ success: false, status: 401 })
      .mockResolvedValueOnce({
        success: true,
        status: 200,
        data: { code: 200, data: "signed in" },
      })
      .mockResolvedValueOnce({ success: false, status: 401 })

    await expect(listChannels(config)).rejects.toThrow(/HTTP 401/i)

    expect(mockTempWindowOctopusApiFetch).toHaveBeenCalledTimes(3)
    expect(mockGetValidSession).toHaveBeenCalledOnce()
    expect(mockClearCache).not.toHaveBeenCalled()
  })

  it("treats missing cookie transport lifecycle as possibly dispatched", async () => {
    mockGetValidSession.mockResolvedValue(currentCookieSession())
    const transportError = new Error("temporary context failed")
    mockTempWindowOctopusApiFetch.mockRejectedValueOnce(transportError)

    await expect(
      updateChannel(config, updateInput({ id: 7 }, { id: 7, name: "Updated" })),
    ).rejects.toMatchObject({
      name: "OctopusMutationApiError",
      dispatch: "dispatched",
      responseReceived: false,
      confirmedNonApplication: false,
    })

    mockTempWindowOctopusApiFetch.mockResolvedValueOnce({
      success: false,
      error: "bridge response omitted lifecycle",
    })
    await expect(
      updateChannel(config, updateInput({ id: 7 }, { id: 7, name: "Updated" })),
    ).rejects.toMatchObject({
      dispatch: "dispatched",
      responseReceived: false,
      confirmedNonApplication: false,
    })
  })

  it.each([
    { field: "base_url", value: undefined },
    { field: "type", value: "future-provider" },
  ])(
    "rejects invalid current channel field $field",
    async ({ field, value }) => {
      mockGetValidSession.mockResolvedValueOnce({
        mode: OCTOPUS_AUTH_MODES.Cookie,
        expireAt: 1_700_000_900_000,
      })
      const channel: Record<string, unknown> = {
        id: 1,
        name: "Current",
        type: "openai",
        enabled: true,
        base_url: "https://api.example.invalid/v1",
        key: "credential-placeholder",
        model: "model-a",
        proxy: false,
        auto_sync: true,
      }
      if (value === undefined) delete channel[field]
      else channel[field] = value
      mockTempWindowOctopusApiFetch.mockResolvedValueOnce({
        success: true,
        status: 200,
        data: { code: 200, data: [channel] },
      })

      await expect(listChannels(config)).rejects.toThrow(/current Octopus/i)
    },
  )

  it("normalizes the supported current channel types and validated nested fields", async () => {
    mockGetValidSession.mockResolvedValue({
      mode: OCTOPUS_AUTH_MODES.Cookie,
      expireAt: 1_700_000_900_000,
    })
    mockTempWindowOctopusApiFetch
      .mockResolvedValueOnce({
        success: true,
        status: 200,
        data: {
          code: 200,
          data: [
            currentChannelResponse({
              type: "openai_responses",
              custom_model: "response-custom",
              custom_header: [
                { header_key: "x-example", header_value: "value" },
              ],
              param_override: '{"temperature":0.2}',
              channel_proxy: "http://proxy.example.invalid:8080",
              match_regex: "^response-",
              stats: {
                channel_id: 1,
                input_token: 10,
                output_token: 4,
                input_cost: 0.25,
                output_cost: 0.5,
                wait_time: 1.5,
                request_success: 3,
                request_failed: 1,
              },
            }),
            currentChannelResponse({ id: 2, type: "gemini" }),
            currentChannelResponse({ id: 3, type: "volcengine" }),
          ],
        },
      })
      .mockResolvedValueOnce({
        success: true,
        status: 200,
        data: { code: 200, data: null },
      })

    await expect(listChannels(config)).resolves.toEqual([
      expect.objectContaining({
        type: OctopusOutboundType.OpenAIResponse,
        custom_model: "response-custom",
        custom_header: [{ header_key: "x-example", header_value: "value" }],
        param_override: '{"temperature":0.2}',
        channel_proxy: "http://proxy.example.invalid:8080",
        match_regex: "^response-",
        stats: expect.objectContaining({ input_cost: 0.25, wait_time: 1.5 }),
      }),
      expect.objectContaining({ type: OctopusOutboundType.Gemini }),
      expect.objectContaining({ type: OctopusOutboundType.Volcengine }),
    ])

    await createChannel(config, {
      name: "Volcengine",
      type: OctopusOutboundType.Volcengine,
      baseUrl: "https://volcengine.example.invalid",
      key: "credential-placeholder",
      customHeaders: [{ header_key: "x-example", header_value: "create" }],
    })
    expect(
      JSON.parse(
        mockTempWindowOctopusApiFetch.mock.calls[1][0].fetchOptions.body,
      ),
    ).toEqual({
      name: "Volcengine",
      type: "volcengine",
      base_url: "https://volcengine.example.invalid",
      key: "credential-placeholder",
      custom_header: [{ header_key: "x-example", header_value: "create" }],
    })
  })

  it("accepts current deployments that omit model or return legacy models", async () => {
    mockGetValidSession.mockResolvedValueOnce({
      mode: OCTOPUS_AUTH_MODES.Cookie,
      expireAt: 1_700_000_900_000,
    })
    mockTempWindowOctopusApiFetch.mockResolvedValueOnce({
      success: true,
      status: 200,
      data: {
        code: 200,
        data: [
          {
            ...currentChannelResponse({ id: 5 }),
            model: undefined,
          },
          {
            ...currentChannelResponse({ id: 2 }),
            model: undefined,
            models: [
              { name: "model-a" },
              { name: "model-b" },
              { unsupported: true },
            ],
          },
          {
            ...currentChannelResponse({
              id: 16,
              type: "openai_responses",
            }),
            model: undefined,
          },
        ],
      },
    })

    await expect(listChannels(config)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 5, model: "" }),
        expect.objectContaining({ id: 2, model: "model-a,model-b" }),
        expect.objectContaining({ id: 16, model: "" }),
      ]),
    )
  })

  it("normalizes a current create response that omits model", async () => {
    mockGetValidSession.mockResolvedValueOnce(currentCookieSession())
    mockTempWindowOctopusApiFetch.mockResolvedValueOnce({
      success: true,
      status: 200,
      data: {
        code: 200,
        data: {
          ...currentChannelResponse({
            id: 16,
            type: "openai_responses",
            model: undefined,
          }),
        },
      },
    })

    await expect(
      createChannel(config, {
        name: "Created",
        type: OctopusOutboundType.OpenAIResponse,
        baseUrl: "https://upstream.example.invalid/v1",
        key: "credential-placeholder",
        model: "model-a",
      }),
    ).resolves.toMatchObject({
      success: true,
      data: { id: 16, model: "" },
    })
  })

  it.each([
    {
      name: "a non-object channel",
      data: [null],
    },
    {
      name: "an invalid id",
      data: [currentChannelResponse({ id: 1.5 })],
    },
    {
      name: "an invalid boolean",
      data: [currentChannelResponse({ enabled: "yes" })],
    },
    {
      name: "a non-array custom header",
      data: [currentChannelResponse({ custom_header: {} })],
    },
    {
      name: "a malformed custom header entry",
      data: [currentChannelResponse({ custom_header: [null] })],
    },
    {
      name: "malformed stats",
      data: [currentChannelResponse({ stats: "invalid" })],
    },
    {
      name: "a malformed stats number",
      data: [
        currentChannelResponse({
          stats: {
            channel_id: 1,
            input_token: 10,
            output_token: 4,
            input_cost: "invalid",
            output_cost: 0.5,
            wait_time: 1.5,
            request_success: 3,
            request_failed: 1,
          },
        }),
      ],
    },
    {
      name: "a non-array channel list",
      data: currentChannelResponse(),
    },
  ])("rejects $name from the current channel list", async ({ data }) => {
    mockGetValidSession.mockResolvedValueOnce({
      mode: OCTOPUS_AUTH_MODES.Cookie,
      expireAt: 1_700_000_900_000,
    })
    mockTempWindowOctopusApiFetch.mockResolvedValueOnce({
      success: true,
      status: 200,
      data: { code: 200, data },
    })

    await expect(listChannels(config)).rejects.toThrow(/current Octopus/i)
  })

  it("uses current model, group, and delete endpoints after cookie auth", async () => {
    mockGetValidSession.mockResolvedValue(currentCookieSession())
    mockTempWindowOctopusApiFetch
      .mockResolvedValueOnce({
        success: true,
        status: 200,
        data: { code: 200, data: [{ name: "model-a" }] },
      })
      .mockResolvedValueOnce({
        success: true,
        status: 200,
        data: { code: 200, data: [{ name: "group-a" }] },
      })
      .mockResolvedValueOnce({
        success: true,
        status: 200,
        data: { code: 200, data: null },
      })

    await expect(fetchAvailableModels(config)).resolves.toEqual(["model-a"])
    await expect(fetchGroups(config)).resolves.toEqual(["group-a"])
    await expect(deleteChannel(config, 7)).resolves.toMatchObject({
      success: true,
    })

    expect(
      mockTempWindowOctopusApiFetch.mock.calls.map(([request]) => ({
        path: new URL(request.fetchUrl).pathname,
        method: request.fetchOptions.method,
      })),
    ).toEqual([
      { path: "/api/v1/model/list", method: undefined },
      { path: "/api/v1/group/list", method: undefined },
      { path: "/api/v1/channel/delete/7", method: "DELETE" },
    ])
  })

  it("renegotiates once when a cached legacy JWT receives 401", async () => {
    mockGetValidSession
      .mockResolvedValueOnce({
        mode: OCTOPUS_AUTH_MODES.Bearer,
        token: "expired-jwt",
        expireAt: 1_700_000_900_000,
      })
      .mockResolvedValueOnce({
        mode: OCTOPUS_AUTH_MODES.Cookie,
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
        mode: OCTOPUS_AUTH_MODES.Bearer,
        token: "expired-jwt",
        expireAt: 1_700_000_900_000,
      })
      .mockResolvedValueOnce({
        mode: OCTOPUS_AUTH_MODES.Bearer,
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
      custom_header: [
        { header_key: "x-example", header_value: "legacy-create" },
      ],
    }

    await createChannel(config, createInput(createPayload))
    await updateChannel(config, updateInput({ id: 1, name: "Updated" }))
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
    const fetchMock = vi.fn().mockImplementation(
      async () =>
        new Response(
          JSON.stringify({ success: true, data: ["embedding-model"] }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
    )
    vi.stubGlobal("fetch", fetchMock)

    await expect(
      fetchRemoteModels(config, fetchModelInput(payload)),
    ).resolves.toEqual(["embedding-model"])

    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://octopus.example.com/api/v1/channel/fetch-model",
    )
    const request = fetchMock.mock.calls[0][1]
    expect(JSON.parse(request.body as string)).toEqual(payload)
    const requestHeaders = request.headers as Headers
    expect(requestHeaders.get("Authorization")).toBe("Bearer jwt-token")
    expect(request.credentials).not.toBe("include")
  })

  it("preserves legacy model-probe resources without leaking current-only settings", async () => {
    const source = {
      id: 8,
      name: "Legacy probe",
      type: OctopusOutboundType.OpenAIEmbedding,
      enabled: true,
      base_urls: [
        { url: "https://primary.example.invalid/v1", delay: 120 },
        { url: "https://backup.example.invalid/v1" },
      ],
      keys: [
        {
          id: 3,
          channel_id: 8,
          enabled: true,
          channel_key: "credential-placeholder",
          remark: "primary",
          status_code: 200,
          last_use_time_stamp: 1_700_000_000,
          total_cost: 0.25,
        },
        { enabled: false, channel_key: "credential-secondary" },
      ],
      model: "embedding-model",
      proxy: false,
      auto_sync: true,
      auto_group: OctopusAutoGroupType.None,
      channel_proxy: "http://proxy.example.invalid:8080",
      match_regex: "^embedding-",
      custom_header: [
        { header_key: "x-example", header_value: "legacy-probe" },
      ],
    } satisfies OctopusChannel
    const fetchMock = vi.fn().mockImplementation(
      async () =>
        new Response(
          JSON.stringify({ success: true, data: ["embedding-model"] }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
    )
    vi.stubGlobal("fetch", fetchMock)

    await fetchRemoteModels(config, {
      type: source.type,
      baseUrl: "https://draft.example.invalid/v1",
      key: "credential-draft",
      proxy: source.proxy,
      source,
    })

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      type: OctopusOutboundType.OpenAIEmbedding,
      base_urls: [
        { url: "https://draft.example.invalid/v1", delay: 120 },
        { url: "https://backup.example.invalid/v1" },
      ],
      keys: [
        { ...source.keys[0], channel_key: "credential-draft" },
        source.keys[1],
      ],
      proxy: false,
    })

    await fetchRemoteModels(config, {
      type: source.type,
      baseUrl: "https://fallback.example.invalid/v1",
      key: "credential-fallback",
      proxy: source.proxy,
      source: { ...source, base_urls: [], keys: [] },
    })
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
      type: OctopusOutboundType.OpenAIEmbedding,
      base_urls: [{ url: "https://fallback.example.invalid/v1" }],
      keys: [{ enabled: true, channel_key: "credential-fallback" }],
      proxy: false,
    })
  })

  it("derives a legacy key update from normalized channel state", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true, data: null }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    )
    vi.stubGlobal("fetch", fetchMock)

    await updateChannel(config, {
      id: 7,
      baseUrl: "https://replacement.example.invalid",
      key: "credential-replacement",
      source: {
        id: 7,
        name: "Existing",
        type: OctopusOutboundType.OpenAIChat,
        enabled: true,
        base_urls: [
          { url: "https://upstream.example.invalid", delay: 120 },
          { url: "https://backup.example.invalid", delay: 240 },
        ],
        keys: [{ id: 3, enabled: true, channel_key: "credential-original" }],
        model: "gpt-4o",
        proxy: false,
        auto_sync: true,
        auto_group: OctopusAutoGroupType.None,
      } satisfies OctopusChannel,
      keys_to_delete: [99],
    } as OctopusUpdateChannelInput & { keys_to_delete: number[] })

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      id: 7,
      base_urls: [
        { url: "https://replacement.example.invalid", delay: 120 },
        { url: "https://backup.example.invalid", delay: 240 },
      ],
      keys_to_update: [
        {
          id: 3,
          enabled: true,
          channel_key: "credential-replacement",
        },
      ],
      auto_group: OctopusAutoGroupType.None,
    })
  })

  it("derives a legacy key addition when normalized state has no primary key", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true, data: null }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    )
    vi.stubGlobal("fetch", fetchMock)
    const source = {
      id: 9,
      name: "No key",
      type: OctopusOutboundType.OpenAIChat,
      enabled: true,
      base_urls: [{ url: "https://upstream.example.invalid" }],
      keys: [],
      model: "gpt-4o",
      proxy: false,
      auto_sync: true,
      auto_group: OctopusAutoGroupType.Fuzzy,
    } satisfies OctopusChannel

    await updateChannel(config, {
      id: source.id,
      key: "credential-added",
      source,
    })

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      id: 9,
      auto_group: OctopusAutoGroupType.Fuzzy,
      keys_to_add: [{ enabled: true, channel_key: "credential-added" }],
    })
  })

  it("encodes a legacy base URL update without preservation state", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true, data: null }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    )
    vi.stubGlobal("fetch", fetchMock)

    await updateChannel(config, {
      id: 10,
      baseUrl: "https://replacement.example.invalid/v1",
    })

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      id: 10,
      base_urls: [{ url: "https://replacement.example.invalid/v1" }],
    })
  })

  const mutations = [
    {
      name: "create",
      log: "Failed to create channel",
      invoke: () =>
        createChannel(
          config,
          createInput({
            name: "Created",
            type: OctopusOutboundType.OpenAIChat,
            base_urls: [{ url: "https://api.example.invalid/v1" }],
            keys: [{ enabled: true, channel_key: "sk-example" }],
            auto_group: OctopusAutoGroupType.None,
          }),
        ),
    },
    {
      name: "update",
      log: "Failed to update channel",
      invoke: () =>
        updateChannel(config, updateInput({ id: 1, name: "Updated" })),
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

  it("uses a fixed mutation message for a blank Octopus failure envelope", async () => {
    const envelope = { success: false, data: null, message: "   " }
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        new Response(JSON.stringify(envelope), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    )

    await expect(
      createChannel(
        config,
        createInput({
          name: "Blank rejection",
          type: OctopusOutboundType.OpenAIChat,
          base_urls: [{ url: "https://api.example.invalid/v1" }],
          keys: [{ enabled: true, channel_key: "sk-example" }],
          auto_group: OctopusAutoGroupType.None,
        }),
      ),
    ).rejects.toMatchObject({
      name: "OctopusMutationApiError",
      message: "API request failed",
      raw: envelope,
    })
  })

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

  it("uses a fixed mutation message when a dispatched failure is blank", async () => {
    const networkError = new TypeError("   ")
    vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(networkError))

    await expect(mutations[0].invoke()).rejects.toMatchObject({
      name: "OctopusMutationApiError",
      message: "Octopus mutation failed",
      dispatch: "dispatched",
      responseReceived: false,
      raw: networkError,
    })
  })

  it("preserves a string message from a non-Error mutation failure", async () => {
    const providerFailure = { message: "provider mutation failed" }
    vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(providerFailure))

    await expect(mutations[0].invoke()).rejects.toMatchObject({
      name: "OctopusMutationApiError",
      message: "provider mutation failed",
      dispatch: "dispatched",
      responseReceived: false,
      raw: providerFailure,
    })
  })

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

      const failure = await updateChannel(config, updateInput({ id: 1 })).catch(
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

    const failure = await updateChannel(config, updateInput({ id: 1 }), {
      signal,
    }).catch((error: unknown) => error)

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
      fetchRemoteModels(
        config,
        fetchModelInput({
          type: OctopusOutboundType.OpenAIChat,
          base_urls: [{ url: "https://api.example.com/v1" }],
          keys: [{ enabled: true, channel_key: "sk-remote" }],
        }),
      ),
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
      mode: OCTOPUS_AUTH_MODES.Bearer,
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

  it("uses a fixed HTTP error message when Octopus JSON candidates are blank", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        new Response(JSON.stringify({ message: "   ", error: "  " }), {
          status: 500,
          statusText: "Internal Server Error",
          headers: { "Content-Type": "application/json" },
        }),
      ),
    )

    await expect(listChannels(config)).rejects.toThrow(
      "HTTP 500 Internal Server Error: Octopus request failed",
    )
  })

  it("uses a fixed HTTP error message for a non-object JSON body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          status: 500,
          statusText: "Internal Server Error",
          headers: { "Content-Type": "application/json" },
        }),
      ),
    )

    await expect(listChannels(config)).rejects.toThrow(
      "HTTP 500 Internal Server Error: Octopus request failed",
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
