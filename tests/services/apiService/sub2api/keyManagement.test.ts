import { beforeEach, describe, expect, it, vi } from "vitest"

import { ACCOUNT_BROWSER_SESSION_SOURCES } from "~/services/accountBrowserSession/types"
import {
  createSub2ApiKey,
  fetchSub2ApiGroupDescriptors,
  fetchSub2ApiGroupRates,
  fetchSub2ApiKey,
  fetchSub2ApiKeys,
  updateSub2ApiKey,
} from "~/services/apiService/sub2api"
import type { Sub2ApiAuthSessionRequest } from "~/services/apiService/sub2api/authSession"
import { parseSub2ApiNativeKey } from "~/services/apiService/sub2api/parsing"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { AuthTypeEnum } from "~/types"

const {
  fetchApiMock,
  resyncSub2ApiAuthTokenMock,
  getLatestAuthMock,
  persistAuthUpdateMock,
} = vi.hoisted(() => ({
  fetchApiMock: vi.fn(),
  resyncSub2ApiAuthTokenMock: vi.fn(),
  getLatestAuthMock: vi.fn(),
  persistAuthUpdateMock: vi.fn(),
}))

vi.mock("~/services/apiTransport/request", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/services/apiTransport/request")>()),
  fetchApi: (...args: any[]) => fetchApiMock(...args),
  notifyApiTransportObserver: vi.fn(),
}))

vi.mock(
  "~/services/apiService/sub2api/browserAuth",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("~/services/apiService/sub2api/browserAuth")
    >()),
    findSub2ApiBrowserAuth: vi.fn(),
    recoverSub2ApiBrowserAuth: (...args: any[]) =>
      resyncSub2ApiAuthTokenMock(...args),
  }),
)

const createRequest = (
  overrides: Partial<Sub2ApiAuthSessionRequest<ApiServiceRequest>> = {},
): Sub2ApiAuthSessionRequest<ApiServiceRequest> => ({
  baseUrl: "https://sub2.example.com",
  accountId: "acc-1",
  sub2apiAuthSession: {
    getLatestAuth: (...args: any[]) => getLatestAuthMock(...args),
    persistAuthUpdate: (...args: any[]) => persistAuthUpdateMock(...args),
  },
  auth: {
    authType: AuthTypeEnum.AccessToken,
    userId: "1",
    accessToken: "old-jwt",
  },
  ...overrides,
})

describe("apiService sub2api key management service", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    fetchApiMock.mockReset()
    resyncSub2ApiAuthTokenMock.mockReset()
    getLatestAuthMock.mockReset()
    persistAuthUpdateMock.mockReset()
    getLatestAuthMock.mockResolvedValue(null)
    persistAuthUpdateMock.mockResolvedValue({ status: "persisted" })
  })

  it("exposes native group descriptors without using display names as identity", async () => {
    fetchApiMock
      .mockResolvedValueOnce({
        code: 0,
        message: "ok",
        data: [
          {
            id: "9",
            name: " vip ",
            description: " VIP plan ",
          },
          {
            id: 10,
            name: "vip",
            description: "",
            rate_multiplier: 3,
          },
        ],
      })
      .mockResolvedValueOnce({
        code: 0,
        message: "ok",
        data: { "9": 2.5 },
      })

    await expect(
      fetchSub2ApiGroupDescriptors(createRequest()),
    ).resolves.toEqual([
      {
        id: 9,
        displayName: "vip",
        description: "VIP plan",
        ratio: 2.5,
      },
      {
        id: 10,
        displayName: "vip",
        description: "vip",
        ratio: 3,
      },
    ])
  })

  it("rejects malformed native group identities so callers fail closed", async () => {
    fetchApiMock
      .mockResolvedValueOnce({
        code: 0,
        message: "ok",
        data: [{ id: "not-an-id", name: "vip" }],
      })
      .mockResolvedValueOnce({
        code: 0,
        message: "ok",
        data: {},
      })

    await expect(
      fetchSub2ApiGroupDescriptors(createRequest()),
    ).rejects.toBeInstanceOf(ApiError)
  })

  it("rejects duplicate native group ids instead of returning ambiguous requirements", async () => {
    fetchApiMock
      .mockResolvedValueOnce({
        code: 0,
        message: "ok",
        data: [
          { id: 9, name: "vip" },
          { id: "9", name: "vip duplicate" },
        ],
      })
      .mockResolvedValueOnce({
        code: 0,
        message: "ok",
        data: { "9": 2.5 },
      })

    await expect(
      fetchSub2ApiGroupDescriptors(createRequest()),
    ).rejects.toBeInstanceOf(ApiError)
  })

  it("normalizes raw Sub2API group rates for estimator callers", async () => {
    fetchApiMock.mockResolvedValueOnce({
      code: 0,
      message: "ok",
      data: {
        "1": "0",
        "9": "invalid",
        "10": "2.5",
      },
    })

    await expect(fetchSub2ApiGroupRates(createRequest())).resolves.toEqual({
      "1": 1,
      "9": 1,
      "10": 2.5,
    })
  })

  it("fetches every key inventory page for group coverage", async () => {
    fetchApiMock
      .mockResolvedValueOnce({
        code: 0,
        message: "ok",
        data: {
          items: [
            {
              id: 1,
              key: "default-key",
              name: "Default key",
              status: "active",
              group: { id: 1, name: "default" },
            },
          ],
          total: 1001,
          page: 1,
          page_size: 1000,
          pages: 2,
        },
      })
      .mockResolvedValueOnce({
        code: 0,
        message: "ok",
        data: {
          items: [
            {
              id: 2,
              key: "vip-key",
              name: "VIP key",
              status: "active",
              group: { id: 9, name: "vip" },
            },
          ],
          total: 1001,
          page: 2,
          page_size: 1000,
          pages: 2,
        },
      })

    await expect(fetchSub2ApiKeys(createRequest())).resolves.toEqual([
      expect.objectContaining({ id: 1, group_name: "default" }),
      expect.objectContaining({ id: 2, group_name: "vip" }),
    ])

    expect(fetchApiMock.mock.calls.map((call) => call[1]?.endpoint)).toEqual([
      "/api/v1/keys?page=1&page_size=1000",
      "/api/v1/keys?page=2&page_size=1000",
    ])
  })

  it("rejects duplicate key ids across inventory pages", async () => {
    fetchApiMock
      .mockResolvedValueOnce({
        code: 0,
        message: "ok",
        data: {
          items: [{ id: 1, name: "First page", status: "active" }],
          page: 1,
          pages: 2,
        },
      })
      .mockResolvedValueOnce({
        code: 0,
        message: "ok",
        data: {
          items: [{ id: 1, name: "Repeated page", status: "active" }],
          page: 2,
          pages: 2,
        },
      })

    await expect(fetchSub2ApiKeys(createRequest())).rejects.toMatchObject({
      code: API_ERROR_CODES.JSON_PARSE_ERROR,
      endpoint: "/api/v1/keys?page=2&page_size=1000",
    })
  })

  it("rejects a key inventory page that does not advance", async () => {
    fetchApiMock
      .mockResolvedValueOnce({
        code: 0,
        message: "ok",
        data: {
          items: [{ id: 1, name: "First page", status: "active" }],
          page: 1,
          pages: 2,
        },
      })
      .mockResolvedValueOnce({
        code: 0,
        message: "ok",
        data: {
          items: [{ id: 2, name: "Repeated first page", status: "active" }],
          page: 1,
          pages: 2,
        },
      })

    await expect(fetchSub2ApiKeys(createRequest())).rejects.toMatchObject({
      code: API_ERROR_CODES.JSON_PARSE_ERROR,
      endpoint: "/api/v1/keys?page=2&page_size=1000",
    })
  })

  it("rejects an unbounded key inventory before requesting another page", async () => {
    fetchApiMock.mockResolvedValueOnce({
      code: 0,
      message: "ok",
      data: {
        items: [{ id: 1, name: "First page", status: "active" }],
        page: 1,
        pages: 1001,
      },
    })

    await expect(fetchSub2ApiKeys(createRequest())).rejects.toMatchObject({
      code: API_ERROR_CODES.JSON_PARSE_ERROR,
      endpoint: "/api/v1/keys?page=1&page_size=1000",
      upstreamCode: "sub2api_key_inventory_page_limit_exceeded",
    })
    expect(fetchApiMock).toHaveBeenCalledOnce()
  })

  it("rejects malformed key inventory pagination metadata", async () => {
    fetchApiMock.mockResolvedValueOnce({
      code: 0,
      message: "ok",
      data: {
        items: [{ id: 1, name: "First page", status: "active" }],
        page: 1,
        pages: "2",
      },
    })

    await expect(fetchSub2ApiKeys(createRequest())).rejects.toMatchObject({
      code: API_ERROR_CODES.JSON_PARSE_ERROR,
      endpoint: "/api/v1/keys?page=1&page_size=1000",
      upstreamCode: "sub2api_key_inventory_invalid_pagination",
    })
  })

  it("classifies a malformed reported page as invalid pagination", async () => {
    fetchApiMock.mockResolvedValueOnce({
      code: 0,
      message: "ok",
      data: {
        items: [{ id: 1, name: "First page", status: "active" }],
        page: "1",
        pages: 1,
      },
    })

    await expect(fetchSub2ApiKeys(createRequest())).rejects.toMatchObject({
      code: API_ERROR_CODES.JSON_PARSE_ERROR,
      upstreamCode: "sub2api_key_inventory_invalid_pagination",
    })
  })

  it("uses hydrated auth userId when listing keys without upstream user_id", async () => {
    getLatestAuthMock.mockResolvedValue({
      accessToken: "stored-jwt",
      userId: "42",
    })

    fetchApiMock.mockResolvedValueOnce({
      code: 0,
      message: "ok",
      data: {
        items: [
          {
            id: 1,
            key: "list-key",
            name: "listed",
            status: "active",
            quota: 1,
            quota_used: 0,
            created_at: "2026-03-06T00:00:00.000Z",
            updated_at: "2026-03-06T00:00:00.000Z",
            expires_at: null,
            ip_whitelist: [],
            group: { id: 1, name: "default" },
          },
        ],
        total: 1,
        page: 1,
        page_size: 100,
        pages: 1,
      },
    })

    const tokens = await fetchSub2ApiKeys(
      createRequest({
        auth: {
          authType: AuthTypeEnum.AccessToken,
          accessToken: "request-jwt",
        },
      }),
    )

    expect(tokens[0]?.user_id).toBe("42")
  })

  it("uses hydrated auth userId when fetching key detail without upstream user_id", async () => {
    getLatestAuthMock.mockResolvedValue({
      accessToken: "stored-jwt",
      userId: "42",
    })

    fetchApiMock.mockResolvedValueOnce({
      code: 0,
      message: "ok",
      data: {
        id: 9,
        key: "detail-key",
        name: "detail",
        status: "active",
        quota: 1,
        quota_used: 0,
        created_at: "2026-03-06T00:00:00.000Z",
        updated_at: "2026-03-06T00:00:00.000Z",
        expires_at: null,
        ip_whitelist: [],
        group: { id: 1, name: "default" },
      },
    })

    const token = await fetchSub2ApiKey(
      createRequest({
        auth: {
          authType: AuthTypeEnum.AccessToken,
          accessToken: "request-jwt",
        },
      }),
      9,
    )

    expect(token.user_id).toBe("42")
  })

  it("serializes concurrent refreshes for group fetches and reuses rotated auth", async () => {
    const now = 1_772_713_600_000
    vi.spyOn(Date, "now").mockReturnValue(now)

    let currentAccount = {
      accessToken: "stored-jwt",
      userId: "1",
      sub2apiAuth: {
        refreshToken: "stored-refresh",
        tokenExpiresAt: now + 30_000,
      },
    }

    getLatestAuthMock.mockImplementation(async () =>
      structuredClone(currentAccount),
    )
    persistAuthUpdateMock.mockImplementation(async (_id, updates) => {
      currentAccount = {
        ...currentAccount,
        accessToken: updates.accessToken,
        sub2apiAuth: updates.refreshToken
          ? {
              ...(currentAccount.sub2apiAuth ?? {}),
              refreshToken: updates.refreshToken,
              ...(typeof updates.tokenExpiresAt === "number"
                ? { tokenExpiresAt: updates.tokenExpiresAt }
                : {}),
            }
          : currentAccount.sub2apiAuth,
      }

      return { status: "persisted" }
    })

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 0,
          message: "ok",
          data: {
            access_token: "new-jwt",
            refresh_token: "rotated-refresh",
            expires_in: 3600,
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    )
    vi.stubGlobal("fetch", fetchMock as any)

    fetchApiMock.mockImplementation(async (_request, options) => {
      if (options?.endpoint === "/api/v1/auth/me") {
        return {
          code: 0,
          message: "ok",
          data: { id: 1, username: "example-user", balance: 1 },
        }
      }

      if (options?.endpoint === "/api/v1/groups/available") {
        return {
          code: 0,
          message: "ok",
          data: [{ id: "1", name: "default", description: "Default plan" }],
        }
      }

      if (options?.endpoint === "/api/v1/groups/rates") {
        return {
          code: 0,
          message: "ok",
          data: { "1": 1 },
        }
      }

      throw new Error(`Unexpected endpoint: ${options?.endpoint}`)
    })

    const [firstGroups, secondGroups] = await Promise.all([
      fetchSub2ApiGroupDescriptors(createRequest()),
      fetchSub2ApiGroupDescriptors(createRequest()),
    ])

    expect(firstGroups).toEqual([
      expect.objectContaining({ id: 1, displayName: "default" }),
    ])
    expect(secondGroups).toEqual(firstGroups)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(persistAuthUpdateMock).toHaveBeenCalledTimes(1)
  })

  it("retries key requests with refresh-token recovery and persists rotated auth", async () => {
    const now = 1_772_713_600_000
    vi.spyOn(Date, "now").mockReturnValue(now)

    getLatestAuthMock.mockResolvedValue({
      accessToken: "stored-jwt",
      userId: "1",
      sub2apiAuth: { refreshToken: "stored-refresh" },
    })

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 0,
          message: "ok",
          data: {
            access_token: "new-jwt",
            refresh_token: "rotated-refresh",
            expires_in: 3600,
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    )
    vi.stubGlobal("fetch", fetchMock as any)

    fetchApiMock
      .mockRejectedValueOnce(new ApiError("Unauthorized", 401, "/api/v1/keys"))
      .mockResolvedValueOnce({
        code: 0,
        message: "ok",
        data: { id: 1, username: "example-user", balance: 1 },
      })
      .mockResolvedValueOnce({
        code: 0,
        message: "ok",
        data: {
          items: [
            {
              id: 1,
              user_id: 1,
              key: "retried-key",
              name: "retry",
              status: "active",
              quota: 1,
              quota_used: 0.1,
              created_at: "2026-03-06T00:00:00.000Z",
              updated_at: "2026-03-06T00:00:00.000Z",
              expires_at: null,
              ip_whitelist: [],
              group: { id: 1, name: "default" },
            },
          ],
          total: 1,
          page: 1,
          page_size: 100,
          pages: 1,
        },
      })

    const tokens = await fetchSub2ApiKeys(createRequest())

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(tokens).toHaveLength(1)
    expect(tokens[0].key).toBe("retried-key")
    expect(persistAuthUpdateMock).toHaveBeenCalledWith("acc-1", {
      accessToken: "new-jwt",
      refreshToken: "rotated-refresh",
      tokenExpiresAt: now + 3600 * 1000,
      userId: "1",
      expectedOrigin: "https://sub2.example.com",
      expectedUserId: "1",
    })
  })

  it("retries key requests with dashboard-session re-sync when no refresh token exists", async () => {
    getLatestAuthMock.mockResolvedValue(null)
    resyncSub2ApiAuthTokenMock.mockResolvedValue({
      accessToken: "resynced-jwt",
      userId: "1",
      source: ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB,
    })

    fetchApiMock
      .mockRejectedValueOnce(new ApiError("Unauthorized", 401, "/api/v1/keys"))
      .mockResolvedValueOnce({
        code: 0,
        message: "ok",
        data: {
          items: [
            {
              id: "2",
              user_id: 1,
              key: "resynced-key",
              name: "resynced",
              status: "active",
              quota: 0,
              quota_used: 0,
              created_at: "2026-03-06T00:00:00.000Z",
              updated_at: "2026-03-06T00:00:00.000Z",
              expires_at: null,
              ip_whitelist: [],
              group: { id: 1, name: "default" },
            },
          ],
          total: 1,
          page: 1,
          page_size: 100,
          pages: 1,
        },
      })

    const tokens = await fetchSub2ApiKeys(createRequest())

    expect(tokens).toHaveLength(1)
    expect(resyncSub2ApiAuthTokenMock).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: "https://sub2.example.com",
        expectedUserId: "1",
      }),
    )
    expect(persistAuthUpdateMock).toHaveBeenCalledWith("acc-1", {
      accessToken: "resynced-jwt",
      clearRefreshCredentials: true,
      userId: "1",
      expectedOrigin: "https://sub2.example.com",
      expectedUserId: "1",
    })
  })

  it("surfaces login-required when auth recovery is unavailable", async () => {
    getLatestAuthMock.mockResolvedValue({
      accessToken: "stored-jwt",
      userId: "1",
    })
    resyncSub2ApiAuthTokenMock.mockResolvedValue(null)

    fetchApiMock.mockRejectedValueOnce(
      new ApiError("Unauthorized", 401, "/api/v1/keys"),
    )

    await expect(fetchSub2ApiKeys(createRequest())).rejects.toThrow(
      "messages:sub2api.loginRequired",
    )
  })
})

describe("Sub2API native key transport", () => {
  beforeEach(() => {
    fetchApiMock.mockReset()
    getLatestAuthMock.mockResolvedValue(null)
  })

  it("preserves native quota, group identity, expiry and extension fields", () => {
    const wire = {
      id: "7",
      name: " VIP ",
      key: " secret ",
      quota: 2.5,
      quota_used: 1.25,
      expires_at: "2026-10-01T00:00:00Z",
      group_id: 9,
      group: { id: 10, name: "vip" },
      status: "quota_exhausted",
      metadata: { custom: true },
    }
    expect(parseSub2ApiNativeKey(wire)).toMatchObject({
      id: 7,
      name: "VIP",
      key: "secret",
      quota: 2.5,
      quota_used: 1.25,
      group_id: 9,
      group_name: "vip",
      expires_at: wire.expires_at,
      status: "quota_exhausted",
      metadata: wire.metadata,
    })
    expect(
      parseSub2ApiNativeKey({ id: 7, group: { id: 10, name: "vip" } }).group_id,
    ).toBeUndefined()
  })

  it("rejects invalid native identities", () => {
    for (const id of [0, -1, 1.5, "invalid"])
      expect(() => parseSub2ApiNativeKey({ id })).toThrow()
  })

  it("dispatches the exact native create and update payloads without group-name reads", async () => {
    const request = createRequest()
    const payload = {
      name: "native",
      group_id: 10,
      quota: 1.5,
      expires_in_days: 2,
      ip_whitelist: ["1.1.1.1"],
    }
    fetchApiMock.mockResolvedValueOnce({
      code: 0,
      message: "ok",
      data: { id: 12, group_id: 10, key: "created-secret" },
    })
    await expect(createSub2ApiKey(request, payload)).resolves.toMatchObject({
      id: 12,
      group_id: 10,
      key: "created-secret",
    })
    expect(fetchApiMock).toHaveBeenCalledTimes(1)
    expect(fetchApiMock.mock.calls[0][1]).toMatchObject({
      endpoint: "/api/v1/keys",
      options: { method: "POST", body: JSON.stringify(payload) },
    })
    fetchApiMock.mockResolvedValueOnce({ code: 0, message: "ok" })
    const edit = { name: "renamed", quota: 4.25 }
    await updateSub2ApiKey(request, 12, edit)
    expect(fetchApiMock.mock.calls[1][1]).toMatchObject({
      endpoint: "/api/v1/keys/12",
      options: { method: "PUT", body: JSON.stringify(edit) },
    })
    expect(fetchApiMock).toHaveBeenCalledTimes(2)
  })

  it("retains acknowledgements without invented identity and rejects mismatched detail ids", async () => {
    fetchApiMock.mockResolvedValueOnce({ code: 0, message: "ok" })
    await expect(
      createSub2ApiKey(createRequest(), { name: "native", group_id: 10 }),
    ).resolves.toBeUndefined()
    fetchApiMock.mockResolvedValueOnce({
      code: 0,
      message: "ok",
      data: { id: 13 },
    })
    await expect(fetchSub2ApiKey(createRequest(), 12)).rejects.toThrow()
  })
})
