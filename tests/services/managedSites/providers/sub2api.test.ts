import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ChannelType } from "~/constants/managedSite"
import { SITE_TYPES } from "~/constants/siteType"
import {
  isSub2ApiManagedResourcePlatform,
  isSub2ApiManagedResourceStatus,
  SUB2API_ADMIN_REQUEST_TIMEOUT_MS,
  SUB2API_API_KEY_ACCOUNT_PLATFORM_LABELS,
  SUB2API_API_KEY_ACCOUNT_PLATFORM_METADATA,
  SUB2API_API_KEY_ACCOUNT_PLATFORMS,
  SUB2API_API_KEY_ACCOUNT_TYPE_OPTIONS,
  SUB2API_DEFAULT_ACCOUNT_PLATFORM,
  SUB2API_MANAGED_RESOURCE_STATUS,
  sub2ApiChannelTypeToPlatform,
  sub2ApiPlatformToChannelType,
} from "~/constants/sub2api"
import { getManagedSiteServiceForType } from "~/services/managedSites/managedSiteService"
import {
  buildChannelPayload,
  createSub2ApiApiKeyAccount,
  deleteSub2ApiApiKeyAccount,
  fetchAvailableModels,
  getSub2ApiApiKeyAccount,
  InvalidSub2ApiResourceIdError,
  listSub2ApiApiKeyAccounts,
  parseSub2ApiResourceId,
  prepareChannelFormData,
  revealSub2ApiApiKey,
  searchSub2ApiApiKeyAccounts,
  sub2ApiAccountToManagedSiteChannel,
  toSub2ApiManagedSiteChannelList,
  updateSub2ApiApiKeyAccount,
  validateSub2ApiManagedSiteConfig,
} from "~/services/managedSites/providers/sub2api"
import {
  getManagedSiteTokenChannelStatus,
  MANAGED_SITE_TOKEN_CHANNEL_STATUSES,
} from "~/services/managedSites/tokenChannelStatus"
import { fetchTokenScopedModels } from "~/services/managedSites/utils/fetchTokenScopedModels"
import {
  buildApiToken,
  buildDisplaySiteData,
} from "~~/tests/test-utils/factories"

vi.mock("~/services/managedSites/utils/fetchTokenScopedModels", () => ({
  fetchTokenScopedModels: vi.fn(),
}))

const config = {
  baseUrl: "https://sub2api.example.invalid/",
  adminToken: "admin-api-key",
}

const account = {
  id: 17,
  name: "Example upstream",
  platform: "openai" as const,
  type: "apikey" as const,
  credentials: { base_url: "https://api.example.invalid/v1" },
  credentials_status: { has_api_key: true },
  concurrency: 3,
  priority: 8,
  notes: "Provider note",
  status: "active" as const,
}

const jsonResponse = (data: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(data), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  })

describe("Sub2API API-key account managed-site provider", () => {
  const mockFetch = vi.fn<typeof fetch>()

  beforeEach(() => {
    mockFetch.mockReset()
    vi.mocked(fetchTokenScopedModels).mockReset()
    vi.stubGlobal("fetch", mockFetch)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it("does not dispatch when the caller signal is already aborted", async () => {
    const controller = new AbortController()
    const reason = new DOMException("Cancelled", "AbortError")
    const observer = { onDispatch: vi.fn(), onResponse: vi.fn() }
    const beforeRequest = vi.fn(async () => {})
    controller.abort(reason)

    await expect(
      listSub2ApiApiKeyAccounts(config, {
        signal: controller.signal,
        observer,
        beforeRequest,
      }),
    ).rejects.toBe(reason)

    expect(beforeRequest).not.toHaveBeenCalled()
    expect(observer.onDispatch).not.toHaveBeenCalled()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it("preserves caller cancellation and clears the default timeout", async () => {
    vi.useFakeTimers()
    const controller = new AbortController()
    const reason = new DOMException("Cancelled", "AbortError")
    mockFetch.mockImplementationOnce(
      async (_input, request) =>
        await new Promise<Response>((_resolve, reject) => {
          const signal = request?.signal
          signal?.addEventListener("abort", () => reject(signal.reason), {
            once: true,
          })
        }),
    )

    const result = listSub2ApiApiKeyAccounts(config, {
      signal: controller.signal,
    })
    const rejection = expect(result).rejects.toBe(reason)
    await Promise.resolve()
    expect(vi.getTimerCount()).toBe(1)

    controller.abort(reason)

    await rejection
    expect(vi.getTimerCount()).toBe(0)
  })

  it("times out an unresponsive admin request with the original reason", async () => {
    vi.useFakeTimers()
    let receivedSignal: AbortSignal | undefined
    mockFetch.mockImplementationOnce(
      async (_input, request) =>
        await new Promise<Response>(() => {
          receivedSignal = request?.signal ?? undefined
        }),
    )

    const result = listSub2ApiApiKeyAccounts(config)
    await vi.advanceTimersByTimeAsync(0)
    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(1)
    const rejection = expect(result).rejects.toMatchObject({
      name: "TimeoutError",
    })

    await vi.advanceTimersByTimeAsync(SUB2API_ADMIN_REQUEST_TIMEOUT_MS)

    await rejection
    expect(receivedSignal?.aborted).toBe(true)
    expect(receivedSignal?.reason).toMatchObject({ name: "TimeoutError" })
    expect(vi.getTimerCount()).toBe(0)
  })

  it("clears the default timeout after a successful response", async () => {
    vi.useFakeTimers()
    let resolveResponse: ((response: Response) => void) | undefined
    mockFetch.mockImplementationOnce(
      async () =>
        await new Promise<Response>((resolve) => {
          resolveResponse = resolve
        }),
    )

    const result = listSub2ApiApiKeyAccounts(config)
    await vi.advanceTimersByTimeAsync(0)
    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(resolveResponse).toBeTypeOf("function")
    expect(vi.getTimerCount()).toBe(1)

    resolveResponse?.(
      jsonResponse({
        code: 0,
        data: { items: [account], total: 1, pages: 1 },
      }),
    )

    await expect(result).resolves.toEqual({ items: [account], total: 1 })
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each(["AbortError", "TimeoutError"])(
    "preserves a direct %s transport failure",
    async (name) => {
      const error = Object.assign(new Error("request stopped"), { name })
      mockFetch.mockRejectedValueOnce(error)

      await expect(validateSub2ApiManagedSiteConfig(config)).rejects.toBe(error)
    },
  )

  it("wraps an ordinary network failure with transport evidence", async () => {
    const error = new Error("offline")
    mockFetch.mockRejectedValueOnce(error)

    await expect(
      validateSub2ApiManagedSiteConfig(config),
    ).rejects.toMatchObject({
      name: "Sub2ApiAdminApiError",
      message: "Sub2API admin request failed",
      evidence: {
        dispatch: "dispatched",
        responseReceived: false,
        confirmedNonApplication: false,
        raw: error,
      },
    })
  })

  it.each(["AbortError", "TimeoutError"])(
    "preserves a direct %s response-read failure",
    async (name) => {
      const error = Object.assign(new Error("response stopped"), { name })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: vi.fn().mockRejectedValueOnce(error),
      } as unknown as Response)

      await expect(validateSub2ApiManagedSiteConfig(config)).rejects.toBe(error)
    },
  )

  it("wraps an unreadable response with response evidence", async () => {
    const error = new Error("body unavailable")
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 502,
      text: vi.fn().mockRejectedValueOnce(error),
    } as unknown as Response)

    await expect(
      validateSub2ApiManagedSiteConfig(config),
    ).rejects.toMatchObject({
      name: "Sub2ApiAdminApiError",
      message: "Sub2API returned an invalid admin response",
      status: 502,
      evidence: {
        dispatch: "dispatched",
        responseReceived: true,
        confirmedNonApplication: true,
        raw: error,
      },
    })
  })

  it("rejects malformed JSON admin responses", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response("{not-json", {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    )

    await expect(
      validateSub2ApiManagedSiteConfig(config),
    ).rejects.toMatchObject({
      name: "Sub2ApiAdminApiError",
      message: "Sub2API returned an invalid admin response",
      status: 200,
      evidence: {
        dispatch: "dispatched",
        responseReceived: true,
        confirmedNonApplication: false,
      },
    })
  })

  it.each([
    [
      { code: "FAILED", message: "provider message", data: {} },
      "provider message",
    ],
    [{ code: "FAILED", error: "provider error", data: {} }, "provider error"],
    [{ code: "FAILED", data: {} }, "Sub2API admin request failed"],
  ])(
    "preserves controlled business failure diagnostics",
    async (body, message) => {
      mockFetch.mockResolvedValueOnce(jsonResponse(body))

      await expect(
        validateSub2ApiManagedSiteConfig(config),
      ).rejects.toMatchObject({
        name: "Sub2ApiAdminApiError",
        code: "FAILED",
        message,
        evidence: { confirmedNonApplication: true },
      })
    },
  )

  it("lists only API-key accounts with Admin API Key authentication", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        code: 0,
        message: "success",
        data: {
          items: [account],
          total: 1,
          page: 1,
          page_size: 100,
          pages: 1,
        },
      }),
    )

    await expect(listSub2ApiApiKeyAccounts(config)).resolves.toEqual({
      items: [account],
      total: 1,
    })

    const [url, request] = mockFetch.mock.calls[0]
    expect(String(url)).toBe(
      "https://sub2api.example.invalid/api/v1/admin/accounts?page=1&page_size=100&type=apikey&sort_by=name&sort_order=asc",
    )
    expect(request).toMatchObject({
      method: "GET",
      headers: expect.objectContaining({
        Accept: "application/json",
        "x-api-key": "admin-api-key",
      }),
    })
    expect(JSON.stringify(request)).not.toContain("Authorization")
  })

  it("uses upstream name search without claiming URL or key search", async () => {
    mockFetch
      .mockResolvedValueOnce(
        jsonResponse({
          code: 0,
          data: {
            items: [account],
            total: 2,
            page: 1,
            page_size: 100,
            pages: 2,
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          code: 0,
          data: {
            items: [{ ...account, id: 18, name: "Second match" }],
            total: 2,
            page: 2,
            page_size: 100,
            pages: 2,
          },
        }),
      )

    await expect(
      searchSub2ApiApiKeyAccounts(config, " Example "),
    ).resolves.toMatchObject({
      items: [account, expect.objectContaining({ id: 18 })],
      total: 2,
    })

    const url = new URL(String(mockFetch.mock.calls[0][0]))
    expect(url.searchParams.get("search")).toBe("Example")
    expect(url.searchParams.get("type")).toBe("apikey")
    expect(
      new URL(String(mockFetch.mock.calls[1][0])).searchParams.get("page"),
    ).toBe("2")
  })

  it("runs the pre-request hook before every paginated request", async () => {
    const beforeRequest = vi.fn(async () => {})
    mockFetch
      .mockResolvedValueOnce(
        jsonResponse({
          code: 0,
          data: {
            items: [account],
            total: 2,
            page: 1,
            page_size: 100,
            pages: 2,
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          code: 0,
          data: {
            items: [{ ...account, id: 18 }],
            total: 2,
            page: 2,
            page_size: 100,
            pages: 2,
          },
        }),
      )

    await expect(
      listSub2ApiApiKeyAccounts(config, { beforeRequest }),
    ).resolves.toMatchObject({ total: 2 })

    expect(beforeRequest).toHaveBeenCalledTimes(2)
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it("treats omitted pagination metadata as a single complete page", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        code: 0,
        data: { items: [account] },
      }),
    )

    await expect(listSub2ApiApiKeyAccounts(config)).resolves.toEqual({
      items: [account],
      total: 1,
    })
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it("inventories API-key accounts without sending the imported URL as a name search", async () => {
    mockFetch.mockImplementation(async (input) => {
      const url = new URL(String(input))

      if (url.pathname === "/api/v1/admin/accounts") {
        return jsonResponse({
          code: 0,
          data: {
            items: [account],
            total: 1,
            page: 1,
            page_size: 100,
            pages: 1,
          },
        })
      }

      if (url.pathname === `/api/v1/admin/accounts/${account.id}`) {
        return jsonResponse({ code: 0, data: account })
      }

      if (url.pathname === "/api/v1/admin/accounts/data") {
        return jsonResponse({
          code: 0,
          data: {
            accounts: [
              {
                id: account.id,
                type: "apikey",
                credentials: { api_key: "sk-test-token-key" },
              },
            ],
          },
        })
      }

      throw new Error(`Unexpected Sub2API request: ${url.toString()}`)
    })

    const result = await getManagedSiteTokenChannelStatus({
      account: buildDisplaySiteData({
        siteType: SITE_TYPES.NEW_API,
        baseUrl: "https://api.example.invalid/v1",
      }),
      token: buildApiToken({ key: "sk-test-token-key" }),
      service: getManagedSiteServiceForType(SITE_TYPES.SUB2API),
      managedConfig: config,
      protectionBypassExecution: {
        version: 2,
        kind: "automatic",
        feature: "managed_site_channels",
        trigger: "background_recovery",
        surface: "background",
      },
    })

    const inventoryUrl = new URL(String(mockFetch.mock.calls[0][0]))
    expect(inventoryUrl.searchParams.get("search")).toBeNull()
    expect(result).toMatchObject({
      status: MANAGED_SITE_TOKEN_CHANNEL_STATUSES.ADDED,
      matchedChannel: { id: account.id, name: account.name },
    })
  })

  it("rejects an unbounded inventory instead of returning incomplete duplicate data", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        code: 0,
        data: {
          items: [account],
          total: 10_001,
          page: 1,
          page_size: 100,
          pages: 101,
        },
      }),
    )

    await expect(listSub2ApiApiKeyAccounts(config)).rejects.toMatchObject({
      code: "PAGINATION_LIMIT_EXCEEDED",
    })
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it("maps redacted credentials to a hidden managed-channel key", () => {
    expect(sub2ApiAccountToManagedSiteChannel(account)).toMatchObject({
      id: 17,
      name: "Example upstream",
      type: ChannelType.OpenAI,
      base_url: "https://api.example.invalid/v1",
      key: "********",
      priority: 8,
      weight: 3,
      status: 1,
    })
  })

  it("prepares a provider-native import draft without model discovery", async () => {
    const draft = await prepareChannelFormData(
      {
        id: "source-account",
        name: "Source account",
        siteType: "new-api",
        baseUrl: "https://api.example.invalid/v1/",
      } as any,
      {
        id: 9,
        name: "Imported key",
        key: "sk-imported",
      } as any,
    )

    expect(mockFetch).not.toHaveBeenCalled()
    expect(draft).toMatchObject({
      name: "Source account | Imported key (auto)",
      key: "sk-imported",
      base_url: "https://api.example.invalid/v1",
      models: [],
      groups: [],
      priority: 1,
      weight: 1,
      status: 1,
      notes: "",
    })
  })

  it("fetches and normalizes token-scoped models at the provider boundary", async () => {
    const sourceAccount = buildDisplaySiteData({
      siteType: SITE_TYPES.NEW_API,
      baseUrl: "https://api.example.invalid/v1/",
    })
    const token = buildApiToken({ key: "sk-models" })
    vi.mocked(fetchTokenScopedModels).mockResolvedValueOnce({
      models: [" model-a ", "model-a", "", "model-b"],
      fetchFailed: false,
    })

    await expect(fetchAvailableModels(sourceAccount, token)).resolves.toEqual([
      "model-a",
      "model-b",
    ])
    expect(fetchTokenScopedModels).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: "https://api.example.invalid/v1",
      }),
      token,
    )
  })

  it("forwards all provider-native import fields into account creation", () => {
    expect(
      buildChannelPayload({
        name: "Imported account",
        type: ChannelType.OpenAI,
        key: "sk-imported",
        base_url: "https://api.example.invalid/v1",
        models: [],
        groups: [],
        priority: 7,
        weight: 4,
        status: 1,
        notes: "Imported from an external credential",
      } as any),
    ).toMatchObject({
      channel: {
        name: "Imported account",
        type: ChannelType.OpenAI,
        key: "sk-imported",
        base_url: "https://api.example.invalid/v1",
        priority: 7,
        weight: 4,
        status: 1,
        remark: "Imported from an external credential",
      },
    })
  })

  it("reveals a selected account key through raw export under default settings", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        code: 0,
        data: {
          exported_at: "2026-08-09T00:00:00Z",
          proxies: [],
          accounts: [
            {
              name: account.name,
              platform: account.platform,
              type: "apikey",
              credentials: {
                base_url: account.credentials.base_url,
                api_key: "sk-exported",
              },
              concurrency: 3,
              priority: 8,
            },
          ],
        },
      }),
    )

    await expect(revealSub2ApiApiKey(config, 17)).resolves.toBe("sk-exported")
    expect(String(mockFetch.mock.calls[0][0])).toBe(
      "https://sub2api.example.invalid/api/v1/admin/accounts/data?ids=17&include_proxies=false",
    )
  })

  it("surfaces step-up rejection instead of treating the key as absent", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse(
        {
          code: "STEP_UP_ADMIN_API_KEY_FORBIDDEN",
          message: "step-up requires an admin session",
        },
        { status: 403 },
      ),
    )

    await expect(revealSub2ApiApiKey(config, 17)).rejects.toMatchObject({
      name: "Sub2ApiAdminApiError",
      status: 403,
      code: "STEP_UP_ADMIN_API_KEY_FORBIDDEN",
      message:
        "This Sub2API deployment requires step-up authentication to reveal API keys. URL + Admin API Key mode cannot reveal the saved key.",
    })
  })

  it("creates a provider-native API-key account", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ code: 0, data: account }))

    await createSub2ApiApiKeyAccount(config, {
      name: " Example upstream ",
      platform: "openai",
      baseUrl: " https://api.example.invalid/v1 ",
      apiKey: " sk-create ",
      modelMapping: {
        "model-one": "model-one",
        "model-two": "provider-model-two",
      },
      concurrency: 3,
      priority: 8,
      notes: "Provider note",
    })

    const [url, request] = mockFetch.mock.calls[0]
    expect(String(url)).toBe(
      "https://sub2api.example.invalid/api/v1/admin/accounts",
    )
    expect(JSON.parse(String(request?.body))).toEqual({
      name: "Example upstream",
      platform: "openai",
      type: "apikey",
      credentials: {
        base_url: "https://api.example.invalid/v1",
        api_key: "sk-create",
        model_mapping: {
          "model-one": "model-one",
          "model-two": "provider-model-two",
        },
      },
      concurrency: 3,
      priority: 8,
      notes: "Provider note",
    })
  })

  it.each([
    ["a data property", { code: 0, message: "success" }],
    ["non-null data", { code: 0, message: "success", data: null }],
  ])(
    "does not classify a successful create response without %s as a confirmed rejection",
    async (_missingData, envelope) => {
      mockFetch.mockResolvedValueOnce(jsonResponse(envelope))

      await expect(
        createSub2ApiApiKeyAccount(config, {
          name: "Example upstream",
          platform: "openai",
          baseUrl: "https://api.example.invalid/v1",
          apiKey: "sk-create",
        }),
      ).rejects.toMatchObject({
        name: "Sub2ApiAdminApiError",
        message: "Sub2API returned an admin response without required data",
        evidence: {
          dispatch: "dispatched",
          responseReceived: true,
          confirmedNonApplication: false,
        },
      })
    },
  )

  it("derives platform defaults, labels, options, and mappings from canonical metadata", () => {
    expect(SUB2API_DEFAULT_ACCOUNT_PLATFORM).toBe("openai")
    expect(SUB2API_API_KEY_ACCOUNT_PLATFORMS).toEqual(
      Object.keys(SUB2API_API_KEY_ACCOUNT_PLATFORM_METADATA),
    )
    expect(SUB2API_API_KEY_ACCOUNT_PLATFORM_LABELS).toEqual(
      Object.fromEntries(
        Object.entries(SUB2API_API_KEY_ACCOUNT_PLATFORM_METADATA).map(
          ([platform, metadata]) => [platform, metadata.label],
        ),
      ),
    )
    expect(SUB2API_API_KEY_ACCOUNT_TYPE_OPTIONS).toEqual(
      Object.values(SUB2API_API_KEY_ACCOUNT_PLATFORM_METADATA).map(
        ({ channelType, label }) => ({ value: channelType, label }),
      ),
    )

    for (const [platform, metadata] of Object.entries(
      SUB2API_API_KEY_ACCOUNT_PLATFORM_METADATA,
    )) {
      expect(isSub2ApiManagedResourcePlatform(platform)).toBe(true)
      expect(sub2ApiPlatformToChannelType(platform as any)).toBe(
        metadata.channelType,
      )
      expect(sub2ApiChannelTypeToPlatform(String(metadata.channelType))).toBe(
        platform,
      )
    }
    expect(isSub2ApiManagedResourcePlatform("future-platform")).toBe(false)
    expect(sub2ApiChannelTypeToPlatform("future-channel-type")).toBe(
      SUB2API_DEFAULT_ACCOUNT_PLATFORM,
    )
  })

  it("rejects a masked key returned by raw export", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        code: 0,
        data: {
          accounts: [
            {
              name: account.name,
              platform: account.platform,
              type: "apikey",
              credentials: { api_key: "sk-****" },
            },
          ],
        },
      }),
    )

    await expect(revealSub2ApiApiKey(config, 17)).rejects.toMatchObject({
      name: "Sub2ApiAdminApiError",
      code: "API_KEY_UNAVAILABLE",
    })
  })

  it("guards the canonical Sub2API account status vocabulary", () => {
    expect(isSub2ApiManagedResourceStatus("active")).toBe(true)
    expect(isSub2ApiManagedResourceStatus("inactive")).toBe(true)
    expect(isSub2ApiManagedResourceStatus("error")).toBe(true)
    expect(isSub2ApiManagedResourceStatus("future-status")).toBe(false)
    expect(Object.values(SUB2API_MANAGED_RESOURCE_STATUS)).toEqual([
      "active",
      "inactive",
      "error",
    ])
  })

  it.each([
    [17, 17],
    ["17", 17],
    [" 17 ", 17],
  ])("parses positive safe Sub2API resource IDs (%s)", (value, expected) => {
    expect(parseSub2ApiResourceId(value)).toBe(expected)
  })

  it.each([
    undefined,
    null,
    true,
    "",
    "not-an-id",
    0,
    -1,
    1.5,
    Number.NaN,
    Number.MAX_SAFE_INTEGER + 1,
  ])("rejects an invalid Sub2API resource ID (%s)", (value) => {
    expect(() => parseSub2ApiResourceId(value)).toThrow(
      InvalidSub2ApiResourceIdError,
    )
  })

  it("rejects an invalid account ID before dispatch", async () => {
    await expect(
      getSub2ApiApiKeyAccount(config, Number.NaN),
    ).rejects.toBeInstanceOf(InvalidSub2ApiResourceIdError)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it("filters non-API-key wire records and fails closed on unknown statuses", () => {
    expect(
      toSub2ApiManagedSiteChannelList({
        items: [
          { ...account, status: "future-status" },
          { ...account, id: 18, type: "oauth" },
        ],
        total: 2,
      }),
    ).toMatchObject({
      items: [{ id: account.id, status: 2 }],
    })
  })

  it("omits model_mapping when no whitelist is configured", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ code: 0, data: account }))

    await createSub2ApiApiKeyAccount(config, {
      name: "Example upstream",
      platform: "openai",
      baseUrl: "https://api.example.invalid/v1",
      apiKey: "sk-create",
    })

    expect(
      JSON.parse(String(mockFetch.mock.calls[0][1]?.body)).credentials,
    ).not.toHaveProperty("model_mapping")
  })

  it("preserves an existing key when update omits it and replaces it when supplied", async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: account }))
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: account }))

    await updateSub2ApiApiKeyAccount(config, 17, {
      name: "Renamed",
      baseUrl: "https://next.example.invalid/v1",
      notes: "Updated note",
    })
    await updateSub2ApiApiKeyAccount(config, 17, { apiKey: "sk-next" })

    expect(JSON.parse(String(mockFetch.mock.calls[0][1]?.body))).toEqual({
      name: "Renamed",
      credentials: { base_url: "https://next.example.invalid/v1" },
      notes: "Updated note",
    })
    expect(JSON.parse(String(mockFetch.mock.calls[1][1]?.body))).toEqual({
      credentials: { api_key: "sk-next" },
    })
  })

  it("sends an empty model mapping when an existing whitelist is cleared", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ code: 0, data: account }))

    await updateSub2ApiApiKeyAccount(config, 17, { modelMapping: {} })

    expect(JSON.parse(String(mockFetch.mock.calls[0][1]?.body))).toEqual({
      credentials: { model_mapping: {} },
    })
  })

  it.each([
    ["an empty 204 response", () => new Response(null, { status: 204 })],
    ["a data-less success envelope", () => jsonResponse({ code: 0 })],
  ])(
    "deletes through the account resource endpoint with %s",
    async (_case, response) => {
      mockFetch.mockResolvedValueOnce(response())

      await deleteSub2ApiApiKeyAccount(config, 17)

      expect(mockFetch).toHaveBeenCalledWith(
        "https://sub2api.example.invalid/api/v1/admin/accounts/17",
        expect.objectContaining({ method: "DELETE" }),
      )
    },
  )
})
