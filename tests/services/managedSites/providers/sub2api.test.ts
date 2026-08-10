import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ChannelType } from "~/constants/managedSite"
import { SITE_TYPES } from "~/constants/siteType"
import { getManagedSiteServiceForType } from "~/services/managedSites/managedSiteService"
import {
  buildChannelPayload,
  createSub2ApiApiKeyAccount,
  deleteSub2ApiApiKeyAccount,
  listSub2ApiApiKeyAccounts,
  prepareChannelFormData,
  revealSub2ApiApiKey,
  searchSub2ApiApiKeyAccounts,
  sub2ApiAccountToManagedSiteChannel,
  updateSub2ApiApiKeyAccount,
} from "~/services/managedSites/providers/sub2api"
import {
  getManagedSiteTokenChannelStatus,
  MANAGED_SITE_TOKEN_CHANNEL_STATUSES,
} from "~/services/managedSites/tokenChannelStatus"
import {
  buildApiToken,
  buildDisplaySiteData,
} from "~~/tests/test-utils/factories"

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
    vi.stubGlobal("fetch", mockFetch)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

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

  it("deletes through the account resource endpoint", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ code: 0, data: { message: "deleted" } }),
    )

    await deleteSub2ApiApiKeyAccount(config, 17)

    expect(mockFetch).toHaveBeenCalledWith(
      "https://sub2api.example.invalid/api/v1/admin/accounts/17",
      expect.objectContaining({ method: "DELETE" }),
    )
  })
})
