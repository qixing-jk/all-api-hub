import { beforeEach, describe, expect, it, vi } from "vitest"

import { ACCOUNT_BROWSER_SESSION_SOURCES } from "~/services/accountBrowserSession/types"
import type { CreateTokenRequest } from "~/services/accountTokens/tokenProvisioningModel"
import {
  createApiToken,
  fetchAccountAvailableModels,
  fetchAccountTokens,
  fetchSub2ApiGroupRates,
  fetchTokenById,
  fetchUserGroups,
  resolveApiTokenKey,
  updateApiToken,
} from "~/services/apiService/sub2api"
import type { Sub2ApiAuthSessionRequest } from "~/services/apiService/sub2api/authSession"
import {
  convertExpirySecondsToSub2ApiDays,
  parseSub2ApiKey,
  translateSub2ApiCreateTokenRequest,
  translateSub2ApiUpdateTokenRequest,
} from "~/services/apiService/sub2api/parsing"
import { ApiError } from "~/services/apiTransport/errors"
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

vi.mock("~/services/apiService/common/utils", () => ({
  fetchApi: (...args: any[]) => fetchApiMock(...args),
}))

vi.mock("~/services/apiService/sub2api/tokenResync", () => ({
  resyncSub2ApiAuthToken: (...args: any[]) =>
    resyncSub2ApiAuthTokenMock(...args),
}))

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

const createTokenRequest = (
  overrides: Partial<CreateTokenRequest> = {},
): CreateTokenRequest => ({
  name: " demo key ",
  remain_quota: 750000,
  expired_time: 0,
  unlimited_quota: false,
  model_limits_enabled: true,
  model_limits: "gpt-4,gpt-4o",
  allow_ips: "1.1.1.1, 2.2.2.2",
  group: "vip",
  ...overrides,
})

describe("apiService sub2api key management parsing", () => {
  it("normalizes Sub2API keys into shared token semantics", () => {
    const token = parseSub2ApiKey({
      id: "7",
      user_id: "5",
      key: "test-key",
      name: "VIP Key",
      status: "quota_exhausted",
      quota: 2.5,
      quota_used: 1.25,
      expires_at: "2026-03-08T12:00:00.000Z",
      created_at: "2026-03-01T08:30:00.000Z",
      updated_at: "2026-03-02T09:45:00.000Z",
      ip_whitelist: ["1.1.1.1", "2.2.2.2"],
      group: { id: 9, name: "vip" },
    })

    expect(token.id).toBe(7)
    expect(token.user_id).toBe(5)
    expect(token.key).toBe("test-key")
    expect(token.status).toBe(0)
    expect(token.remain_quota).toBe(Math.round(1.25 * 500000))
    expect(token.used_quota).toBe(Math.round(1.25 * 500000))
    expect(token.allow_ips).toBe("1.1.1.1,2.2.2.2")
    expect(token.group).toBe("vip")
    expect(token.sub2api_group_id).toBeUndefined()
    expect(token.unlimited_quota).toBe(false)
    expect(token.expired_time).toBe(1772971200)
  })

  it("treats nested Sub2API group ids as group metadata, not stable key group ids", () => {
    const token = parseSub2ApiKey({
      id: "7",
      user_id: "5",
      key: "test-key",
      name: "VIP Key",
      status: "active",
      quota: 2.5,
      quota_used: 1.25,
      expires_at: null,
      created_at: "2026-03-01T08:30:00.000Z",
      updated_at: "2026-03-02T09:45:00.000Z",
      ip_whitelist: [],
      group: { id: 9, name: "vip" },
    })

    expect(token.group).toBe("vip")
    expect(token.sub2api_group_id).toBeUndefined()
  })

  it("preserves a stable Sub2API key group id when the backend exposes group_id", () => {
    const token = parseSub2ApiKey({
      id: "7",
      user_id: "5",
      key: "test-key",
      name: "VIP Key",
      status: "active",
      quota: 2.5,
      quota_used: 1.25,
      expires_at: null,
      created_at: "2026-03-01T08:30:00.000Z",
      updated_at: "2026-03-02T09:45:00.000Z",
      ip_whitelist: [],
      group_id: "11",
      group: { id: 9, name: "vip" },
    })

    expect(token.group).toBe("vip")
    expect(token.sub2api_group_id).toBe(11)
  })

  it("treats non-positive numeric strings like numeric expiries", () => {
    const token = parseSub2ApiKey({
      id: 7,
      user_id: 5,
      key: "test-key",
      name: "VIP Key",
      status: "active",
      quota: 1,
      quota_used: 0,
      expires_at: "0",
      created_at: "2026-03-01T08:30:00.000Z",
      updated_at: "2026-03-02T09:45:00.000Z",
      ip_whitelist: [],
      group: { id: 9, name: "vip" },
    })

    expect(token.expired_time).toBe(-1)
  })

  it("translates shared token requests into Sub2API create and update payloads", () => {
    const now = Date.UTC(2026, 2, 6, 0, 0, 0)
    const expiredTime = Math.floor((now + 36 * 60 * 60 * 1000) / 1000)
    const request = createTokenRequest({ expired_time: expiredTime })

    expect(convertExpirySecondsToSub2ApiDays(expiredTime, now)).toBe(2)

    expect(translateSub2ApiCreateTokenRequest(request, 9, now)).toEqual({
      name: "demo key",
      group_id: 9,
      quota: 1.5,
      expires_in_days: 2,
      ip_whitelist: ["1.1.1.1", "2.2.2.2"],
    })

    expect(translateSub2ApiUpdateTokenRequest(request, 9)).toEqual({
      name: "demo key",
      group_id: 9,
      quota: 1.5,
      expires_at: new Date(expiredTime * 1000).toISOString(),
      ip_whitelist: ["1.1.1.1", "2.2.2.2"],
    })
  })
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
    persistAuthUpdateMock.mockResolvedValue(true)
  })

  it("combines available groups with rate data for shared forms", async () => {
    fetchApiMock
      .mockResolvedValueOnce({
        code: 0,
        message: "ok",
        data: [
          { id: 1, name: "default", description: "Default plan" },
          { id: 9, name: "vip", description: "VIP plan" },
        ],
      })
      .mockResolvedValueOnce({
        code: 0,
        message: "ok",
        data: { "1": 1, "9": 2.5 },
      })

    await expect(fetchUserGroups(createRequest())).resolves.toEqual({
      default: { desc: "Default plan", ratio: 1 },
      vip: { desc: "VIP plan", ratio: 2.5 },
    })
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

  it("returns no available models so Sub2API form hides model-limit controls", async () => {
    await expect(fetchAccountAvailableModels(createRequest())).resolves.toEqual(
      [],
    )
  })

  it("keeps key-creation available models empty even with Sub2API form metadata", async () => {
    await expect(
      fetchAccountAvailableModels(
        createRequest({
          auth: {
            authType: AuthTypeEnum.AccessToken,
            apiKey: "runtime-api-key",
            accessToken: "dashboard-jwt",
          } as ApiServiceRequest["auth"] & { apiKey: string },
        }),
      ),
    ).resolves.toEqual([])
    expect(fetchApiMock).not.toHaveBeenCalled()
  })

  it("resolves usable inventory keys without calling unsupported compatible reveal endpoints", async () => {
    await expect(
      resolveApiTokenKey(createRequest(), {
        id: 1,
        key: "sub2api-full-secret",
      }),
    ).resolves.toBe("sub2api-full-secret")

    expect(fetchApiMock).not.toHaveBeenCalled()
  })

  it("tries the Sub2API key detail endpoint before rejecting masked inventory keys", async () => {
    fetchApiMock.mockResolvedValueOnce({
      code: 0,
      message: "ok",
      data: {
        id: 1,
        user_id: 1,
        key: "sk-still********masked",
        name: "demo key",
        status: "active",
        quota: 1.5,
        quota_used: 0,
        created_at: "2026-03-06T00:00:00.000Z",
        updated_at: "2026-03-06T00:00:00.000Z",
        expires_at: null,
      },
    })

    await expect(
      resolveApiTokenKey(createRequest(), {
        id: 1,
        key: "sk-still********masked",
      }),
    ).rejects.toThrow("token_secret_key_unresolvable")

    expect(fetchApiMock).toHaveBeenCalledTimes(1)
    expect(fetchApiMock.mock.calls[0]?.[1]?.endpoint).toBe("/api/v1/keys/1")
  })

  it("resolves masked inventory keys from the Sub2API key detail endpoint", async () => {
    fetchApiMock.mockResolvedValueOnce({
      code: 0,
      message: "ok",
      data: {
        id: 1,
        user_id: 1,
        key: "sub2api-detail-full-secret",
        name: "demo key",
        status: "active",
        quota: 1.5,
        quota_used: 0,
        created_at: "2026-03-06T00:00:00.000Z",
        updated_at: "2026-03-06T00:00:00.000Z",
        expires_at: null,
      },
    })

    await expect(
      resolveApiTokenKey(createRequest(), {
        id: 1,
        key: "sk-still********masked",
      }),
    ).resolves.toBe("sub2api-detail-full-secret")

    expect(fetchApiMock).toHaveBeenCalledTimes(1)
    expect(fetchApiMock.mock.calls[0]?.[1]?.endpoint).toBe("/api/v1/keys/1")
  })

  it("resolves the current group and strips unsupported fields on create", async () => {
    const now = Date.UTC(2026, 2, 6, 0, 0, 0)
    vi.spyOn(Date, "now").mockReturnValue(now)

    fetchApiMock
      .mockResolvedValueOnce({
        code: 0,
        message: "ok",
        data: [{ id: 9, name: "vip", description: "VIP plan" }],
      })
      .mockResolvedValueOnce({
        code: 0,
        message: "ok",
        data: {
          id: 1,
          user_id: 1,
          key: "new-key",
          name: "demo key",
          status: "active",
          quota: 1.5,
          quota_used: 0,
          created_at: "2026-03-06T00:00:00.000Z",
          updated_at: "2026-03-06T00:00:00.000Z",
          expires_at: null,
          ip_whitelist: ["1.1.1.1", "2.2.2.2"],
          group: { id: 9, name: "vip" },
        },
      })

    const tokenRequest = createTokenRequest({
      expired_time: Math.floor((now + 36 * 60 * 60 * 1000) / 1000),
    })

    await expect(
      createApiToken(createRequest(), tokenRequest),
    ).resolves.toEqual(
      expect.objectContaining({
        id: 1,
        key: "new-key",
        name: "demo key",
      }),
    )

    const postCall = fetchApiMock.mock.calls[1]
    expect(postCall?.[1]?.endpoint).toBe("/api/v1/keys")
    expect(JSON.parse(postCall?.[1]?.options?.body)).toEqual({
      name: "demo key",
      group_id: 9,
      quota: 1.5,
      expires_in_days: 2,
      ip_whitelist: ["1.1.1.1", "2.2.2.2"],
    })
  })

  it("uses hydrated auth user id when create returns a key DTO without user_id", async () => {
    getLatestAuthMock.mockResolvedValue({
      accessToken: "stored-jwt",
      userId: "42",
    })
    fetchApiMock
      .mockResolvedValueOnce({
        code: 0,
        message: "ok",
        data: [{ id: 9, name: "vip", description: "VIP plan" }],
      })
      .mockResolvedValueOnce({
        code: 0,
        message: "ok",
        data: {
          id: 1,
          key: "new-key",
          name: "demo key",
          status: "active",
          quota: 1.5,
          quota_used: 0,
          created_at: "2026-03-06T00:00:00.000Z",
          updated_at: "2026-03-06T00:00:00.000Z",
          expires_at: null,
          group: { id: 9, name: "vip" },
        },
      })

    await expect(
      createApiToken(
        createRequest({
          auth: {
            authType: AuthTypeEnum.AccessToken,
            accessToken: "stale-jwt",
          },
        }),
        createTokenRequest(),
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        id: 1,
        user_id: 42,
        key: "new-key",
      }),
    )
    expect((fetchApiMock.mock.calls[1]?.[0] as any)?.auth?.accessToken).toBe(
      "stored-jwt",
    )
  })

  it("preserves consumed quota when translating shared edit payloads", async () => {
    const editedRemainQuota = 1500000
    const preservedConsumedQuotaUsd = 0.5

    fetchApiMock
      .mockResolvedValueOnce({
        code: 0,
        message: "ok",
        data: {
          id: 1,
          user_id: 1,
          key: "existing-key",
          name: "demo key",
          status: "active",
          quota: 2,
          quota_used: 0.5,
          created_at: "2026-03-06T00:00:00.000Z",
          updated_at: "2026-03-06T00:00:00.000Z",
          expires_at: null,
          ip_whitelist: ["1.1.1.1"],
          group: { id: 9, name: "vip" },
        },
      })
      .mockResolvedValueOnce({
        code: 0,
        message: "ok",
        data: [{ id: 9, name: "vip", description: "VIP plan" }],
      })
      .mockResolvedValueOnce({
        code: 0,
        message: "ok",
        data: {
          id: 1,
          user_id: 1,
          key: "existing-key",
          name: "demo key",
          status: "active",
          quota: 2,
          quota_used: 0.5,
          created_at: "2026-03-06T00:00:00.000Z",
          updated_at: "2026-03-06T00:00:00.000Z",
          expires_at: null,
          ip_whitelist: ["1.1.1.1"],
          group: { id: 9, name: "vip" },
        },
      })

    await expect(
      updateApiToken(
        createRequest(),
        1,
        createTokenRequest({
          remain_quota: editedRemainQuota,
          allow_ips: "1.1.1.1",
          expired_time: -1,
        }),
      ),
    ).resolves.toBe(true)

    const putCall = fetchApiMock.mock.calls[2]
    expect(putCall?.[1]?.endpoint).toBe("/api/v1/keys/1")
    expect(JSON.parse(putCall?.[1]?.options?.body)).toEqual({
      name: "demo key",
      group_id: 9,
      quota: editedRemainQuota / 500000 + preservedConsumedQuotaUsd,
      expires_at: "",
      ip_whitelist: ["1.1.1.1"],
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

    const tokens = await fetchAccountTokens(
      createRequest({
        auth: {
          authType: AuthTypeEnum.AccessToken,
          accessToken: "request-jwt",
        },
      }),
    )

    expect(tokens[0]?.user_id).toBe(42)
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

    const token = await fetchTokenById(
      createRequest({
        auth: {
          authType: AuthTypeEnum.AccessToken,
          accessToken: "request-jwt",
        },
      }),
      9,
    )

    expect(token.user_id).toBe(42)
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

      return true
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
      fetchUserGroups(createRequest()),
      fetchUserGroups(createRequest()),
    ])

    expect(firstGroups).toEqual({ default: { desc: "Default plan", ratio: 1 } })
    expect(secondGroups).toEqual({
      default: { desc: "Default plan", ratio: 1 },
    })
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

    const tokens = await fetchAccountTokens(createRequest())

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(tokens).toHaveLength(1)
    expect(tokens[0].key).toBe("retried-key")
    expect(persistAuthUpdateMock).toHaveBeenCalledWith("acc-1", {
      accessToken: "new-jwt",
      refreshToken: "rotated-refresh",
      tokenExpiresAt: now + 3600 * 1000,
    })
  })

  it("retries key requests with dashboard-session re-sync when no refresh token exists", async () => {
    getLatestAuthMock.mockResolvedValue(null)
    resyncSub2ApiAuthTokenMock.mockResolvedValue({
      accessToken: "resynced-jwt",
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

    const tokens = await fetchAccountTokens(createRequest())

    expect(tokens).toHaveLength(1)
    expect(resyncSub2ApiAuthTokenMock).toHaveBeenCalledWith(
      "https://sub2.example.com",
    )
    expect(persistAuthUpdateMock).toHaveBeenCalledWith("acc-1", {
      accessToken: "resynced-jwt",
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

    await expect(fetchAccountTokens(createRequest())).rejects.toThrow(
      "messages:sub2api.loginRequired",
    )
  })
})
