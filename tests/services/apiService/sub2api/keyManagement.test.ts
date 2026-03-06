import { beforeEach, describe, expect, it, vi } from "vitest"

import { ApiError } from "~/services/apiService/common/errors"
import type {
  ApiServiceRequest,
  CreateTokenRequest,
} from "~/services/apiService/common/type"
import {
  createApiToken,
  fetchAccountAvailableModels,
  fetchAccountTokens,
  fetchUserGroups,
  updateApiToken,
} from "~/services/apiService/sub2api"
import {
  convertExpirySecondsToSub2ApiDays,
  parseSub2ApiKey,
  translateSub2ApiCreateTokenRequest,
  translateSub2ApiUpdateTokenRequest,
} from "~/services/apiService/sub2api/parsing"
import { AuthTypeEnum } from "~/types"

const {
  fetchApiMock,
  resyncSub2ApiAuthTokenMock,
  getAccountByIdMock,
  updateAccountMock,
} = vi.hoisted(() => ({
  fetchApiMock: vi.fn(),
  resyncSub2ApiAuthTokenMock: vi.fn(),
  getAccountByIdMock: vi.fn(),
  updateAccountMock: vi.fn(),
}))

vi.mock("~/services/apiService/common/utils", () => ({
  fetchApi: (...args: any[]) => fetchApiMock(...args),
}))

vi.mock("~/services/apiService/sub2api/tokenResync", () => ({
  resyncSub2ApiAuthToken: (...args: any[]) =>
    resyncSub2ApiAuthTokenMock(...args),
}))

vi.mock("~/services/accounts/accountStorage", () => ({
  accountStorage: {
    getAccountById: (...args: any[]) => getAccountByIdMock(...args),
    updateAccount: (...args: any[]) => updateAccountMock(...args),
  },
}))

const createRequest = (
  overrides: Partial<ApiServiceRequest> = {},
): ApiServiceRequest => ({
  baseUrl: "https://sub2.example.com",
  accountId: "acc-1",
  auth: {
    authType: AuthTypeEnum.AccessToken,
    userId: 1,
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
    expect(token.key).toBe("sk-test-key")
    expect(token.status).toBe(0)
    expect(token.remain_quota).toBe(Math.round(1.25 * 500000))
    expect(token.used_quota).toBe(Math.round(1.25 * 500000))
    expect(token.allow_ips).toBe("1.1.1.1,2.2.2.2")
    expect(token.group).toBe("vip")
    expect(token.unlimited_quota).toBe(false)
    expect(token.expired_time).toBe(1772971200)
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
    getAccountByIdMock.mockReset()
    updateAccountMock.mockReset()
    getAccountByIdMock.mockResolvedValue(null)
    updateAccountMock.mockResolvedValue(true)
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

  it("returns no available models so Sub2API form hides model-limit controls", async () => {
    await expect(fetchAccountAvailableModels(createRequest())).resolves.toEqual(
      [],
    )
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

    await expect(createApiToken(createRequest(), tokenRequest)).resolves.toBe(
      true,
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

  it("retries key requests with refresh-token recovery and persists rotated auth", async () => {
    const now = 1_772_713_600_000
    vi.spyOn(Date, "now").mockReturnValue(now)

    getAccountByIdMock.mockResolvedValue({
      id: "acc-1",
      account_info: { id: 1, access_token: "stored-jwt" },
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
    expect(tokens[0].key).toBe("sk-retried-key")
    expect(updateAccountMock).toHaveBeenCalledWith(
      "acc-1",
      expect.objectContaining({
        account_info: { access_token: "new-jwt" },
        sub2apiAuth: {
          refreshToken: "rotated-refresh",
          tokenExpiresAt: now + 3600 * 1000,
        },
      }),
    )
  })

  it("retries key requests with dashboard-session re-sync when no refresh token exists", async () => {
    getAccountByIdMock.mockResolvedValue({
      id: "acc-1",
      account_info: { id: 1, access_token: "stored-jwt" },
    })
    resyncSub2ApiAuthTokenMock.mockResolvedValue({
      accessToken: "resynced-jwt",
      source: "existing_tab",
    })

    fetchApiMock
      .mockRejectedValueOnce(new ApiError("Unauthorized", 401, "/api/v1/keys"))
      .mockResolvedValueOnce({
        code: 0,
        message: "ok",
        data: {
          items: [
            {
              id: 2,
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
    expect(updateAccountMock).toHaveBeenCalledWith(
      "acc-1",
      expect.objectContaining({
        account_info: { access_token: "resynced-jwt" },
      }),
    )
  })

  it("surfaces login-required when auth recovery is unavailable", async () => {
    getAccountByIdMock.mockResolvedValue({
      id: "acc-1",
      account_info: { id: 1, access_token: "stored-jwt" },
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
