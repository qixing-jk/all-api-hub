import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  createRightCodeKey,
  deleteRightCodeKey,
  fetchAccountData,
  fetchInviteLink,
  fetchRightCodeEffectiveUpstreams,
  fetchRightCodeKey,
  fetchRightCodeKeys,
  fetchRightCodePublicConfigs,
  fetchSupportCheckIn,
  fetchUserInfo,
  getOrCreateAccessToken,
  refreshAccountData,
  setRightCodeKeyExpiry,
  updateRightCodeKey,
} from "~/services/apiService/rightcode"
import {
  RIGHTCODE_ENDPOINTS,
  RIGHTCODE_INVITE_PATH,
} from "~/services/apiService/rightcode/constants"
import {
  fetchRightCodeData,
  isRightCodeAuthFailureError,
} from "~/services/apiService/rightcode/transport"
import {
  ACCOUNT_TODAY_METRIC_REASONS,
  ACCOUNT_TODAY_METRIC_STATUSES,
  AuthTypeEnum,
  SiteHealthStatus,
} from "~/types"
import { buildCheckInConfig } from "~~/tests/test-utils/checkIn"

vi.mock("~/services/apiService/rightcode/transport", () => ({
  fetchRightCodeData: vi.fn(),
  isRightCodeAuthFailureError: vi.fn(),
}))

vi.mock("~/services/apiService/rightcode/tokenResync", () => ({
  resyncRightCodeAuthToken: vi.fn(),
}))

const baseRequest = {
  baseUrl: "https://www.right.codes",
  auth: {
    authType: AuthTypeEnum.AccessToken,
    accessToken: "test-token",
    userId: "42",
  },
}

const accountRequest = {
  ...baseRequest,
  accountId: "account-example",
  checkIn: buildCheckInConfig(),
}

describe("rightcode apiService index", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("public configs & catalogs", () => {
    it("fetches public configs successfully", async () => {
      vi.mocked(fetchRightCodeData).mockResolvedValueOnce({
        "public.balance.price": "1.00",
      })

      const result = await fetchRightCodePublicConfigs(baseRequest)
      expect(result).toEqual({ "public.balance.price": "1.00" })
      expect(fetchRightCodeData).toHaveBeenCalledWith(
        baseRequest,
        RIGHTCODE_ENDPOINTS.configs,
      )
    })

    it("throws when public configs payload is invalid", async () => {
      vi.mocked(fetchRightCodeData).mockResolvedValueOnce("not-a-record")

      await expect(fetchRightCodePublicConfigs(baseRequest)).rejects.toThrow(
        "invalid_rightcode_configs",
      )
    })

    it("fetches effective upstreams successfully", async () => {
      const upstreams = [
        {
          id: 1,
          name: "Channel 1",
          models: [{ id: "gpt-4", effective_price: { cost: 1 } }],
        },
      ]
      vi.mocked(fetchRightCodeData).mockResolvedValueOnce({ upstreams })

      const result = await fetchRightCodeEffectiveUpstreams(baseRequest)
      expect(result).toEqual(upstreams)
      expect(fetchRightCodeData).toHaveBeenCalledWith(
        baseRequest,
        RIGHTCODE_ENDPOINTS.modelPricing,
      )
    })

    it("throws when effective upstreams payload is invalid", async () => {
      vi.mocked(fetchRightCodeData).mockResolvedValueOnce({ invalid: true })

      await expect(
        fetchRightCodeEffectiveUpstreams(baseRequest),
      ).rejects.toThrow("invalid_rightcode_model_pricing")
    })
  })

  describe("key management", () => {
    it("fetches keys successfully", async () => {
      const keys = [{ id: 10, name: "Key 1", key: "sk-1" }]
      vi.mocked(fetchRightCodeData).mockResolvedValueOnce({ keys })

      const result = await fetchRightCodeKeys(baseRequest)
      expect(result).toEqual(keys)
      expect(fetchRightCodeData).toHaveBeenCalledWith(
        baseRequest,
        RIGHTCODE_ENDPOINTS.apiKeys,
      )
    })

    it("throws when key list is invalid", async () => {
      vi.mocked(fetchRightCodeData).mockResolvedValueOnce({ invalid: true })

      await expect(fetchRightCodeKeys(baseRequest)).rejects.toThrow(
        "invalid_rightcode_key_inventory",
      )
    })

    it("fetches single key by id", async () => {
      const key = { id: 10, name: "Key 1", key: "sk-1" }
      vi.mocked(fetchRightCodeData).mockResolvedValueOnce(key)

      const result = await fetchRightCodeKey(baseRequest, 10)
      expect(result).toEqual(key)
      expect(fetchRightCodeData).toHaveBeenCalledWith(
        baseRequest,
        RIGHTCODE_ENDPOINTS.apiKeyDetail(10),
      )
    })

    it("throws when key detail is invalid", async () => {
      vi.mocked(fetchRightCodeData).mockResolvedValueOnce({ name: "no-id" })

      await expect(fetchRightCodeKey(baseRequest, 10)).rejects.toThrow(
        "invalid_rightcode_key_detail",
      )
    })

    it("creates a key", async () => {
      const created = { id: 11, name: "New Key", key: "sk-new" }
      vi.mocked(fetchRightCodeData).mockResolvedValueOnce(created)

      const body = {
        name: "New Key",
        bound_upstream_id: 1,
        allowed_models: [],
        quota_limit: null,
        allow_wallet: true,
        allowed_item_ids: null,
      }
      const result = await createRightCodeKey(baseRequest, body)
      expect(result).toEqual(created)
      expect(fetchRightCodeData).toHaveBeenCalledWith(
        baseRequest,
        RIGHTCODE_ENDPOINTS.apiKeyCreate,
        { method: "POST", body },
      )
    })

    it("throws when key create returns invalid payload", async () => {
      vi.mocked(fetchRightCodeData).mockResolvedValueOnce({ invalid: true })

      await expect(
        createRightCodeKey(baseRequest, {
          bound_upstream_id: 1,
          allowed_models: [],
          quota_limit: null,
          allow_wallet: true,
          allowed_item_ids: null,
        }),
      ).rejects.toThrow("invalid_rightcode_key_create")
    })

    it("updates a key", async () => {
      const updated = { id: 11, name: "Updated Key", key: "sk-updated" }
      vi.mocked(fetchRightCodeData).mockResolvedValueOnce(updated)

      const body = { name: "Updated Key" }
      const result = await updateRightCodeKey(baseRequest, 11, body)
      expect(result).toEqual(updated)
      expect(fetchRightCodeData).toHaveBeenCalledWith(
        baseRequest,
        RIGHTCODE_ENDPOINTS.apiKeyDetail(11),
        { method: "PATCH", body },
      )
    })

    it("returns null when update returns invalid payload", async () => {
      vi.mocked(fetchRightCodeData).mockResolvedValueOnce({ invalid: true })

      const result = await updateRightCodeKey(baseRequest, 11, { name: "bad" })
      expect(result).toBeNull()
    })

    it("sets key expiry", async () => {
      vi.mocked(fetchRightCodeData).mockResolvedValueOnce({})

      await setRightCodeKeyExpiry(baseRequest, 11, "2026-12-31T23:59:59")
      expect(fetchRightCodeData).toHaveBeenCalledWith(
        baseRequest,
        RIGHTCODE_ENDPOINTS.apiKeyExpire(11),
        {
          method: "PATCH",
          body: { expired_at: "2026-12-31T23:59:59" },
        },
      )
    })

    it("deletes a key", async () => {
      vi.mocked(fetchRightCodeData).mockResolvedValueOnce({})

      await deleteRightCodeKey(baseRequest, 11)
      expect(fetchRightCodeData).toHaveBeenCalledWith(
        baseRequest,
        RIGHTCODE_ENDPOINTS.apiKeyDetail(11),
        { method: "DELETE" },
      )
    })
  })

  describe("user & onboarding & invites", () => {
    it("fetches user info for onboarding identity", async () => {
      vi.mocked(fetchRightCodeData).mockResolvedValueOnce({
        id: 42,
        username: "testuser",
        user_token: "sk-user-tok",
        balance: 10,
      })

      const user = await fetchUserInfo(baseRequest)
      expect(user).toEqual({
        id: "42",
        username: "testuser",
        access_token: "sk-user-tok",
      })
    })

    it("gets or creates access token", async () => {
      vi.mocked(fetchRightCodeData).mockResolvedValueOnce({
        id: 42,
        username: "testuser",
        user_token: "sk-user-tok",
        balance: 10,
      })

      const tokenInfo = await getOrCreateAccessToken(baseRequest)
      expect(tokenInfo).toEqual({
        username: "testuser",
        access_token: "sk-user-tok",
      })
    })

    it("returns false for fetchSupportCheckIn", async () => {
      expect(await fetchSupportCheckIn()).toBe(false)
    })

    it("builds invite link with query param", async () => {
      vi.mocked(fetchRightCodeData).mockResolvedValueOnce({
        id: 42,
        username: "testuser",
        user_token: "sk-user-tok",
        balance: 10,
        invite_code: "AFF123",
      })

      const link = await fetchInviteLink(baseRequest)
      expect(link).toBe(
        `https://www.right.codes${RIGHTCODE_INVITE_PATH}?aff=AFF123`,
      )
    })

    it("throws when invite code is missing", async () => {
      vi.mocked(fetchRightCodeData).mockResolvedValueOnce({
        id: 42,
        username: "testuser",
        user_token: "sk-user-tok",
        balance: 10,
        invite_code: "",
      })

      await expect(fetchInviteLink(baseRequest)).rejects.toThrow(
        "invite_data_missing",
      )
    })

    it("throws when user info payload is invalid", async () => {
      vi.mocked(fetchRightCodeData).mockResolvedValueOnce({
        // missing user_token
        id: 42,
        username: "testuser",
      })

      await expect(fetchUserInfo(baseRequest)).rejects.toThrow(
        "invalid_rightcode_user_info",
      )
    })
  })

  describe("fetchAccountData", () => {
    it("gathers wallet balance, lifetime usage, today metrics, and subscriptions", async () => {
      vi.mocked(fetchRightCodeData).mockImplementation(
        async (_req, endpoint) => {
          if (endpoint === RIGHTCODE_ENDPOINTS.me) {
            return {
              id: 42,
              username: "testuser",
              user_token: "token",
              balance: "12.34",
            }
          }
          if (endpoint === RIGHTCODE_ENDPOINTS.usageStatsOverall) {
            return {
              total_requests: 120,
              total_tokens: 34500,
              total_cost: "5.67",
            }
          }
          if (endpoint === RIGHTCODE_ENDPOINTS.usageStats) {
            return {
              total_cost: "0.50",
              total_requests: 10,
              total_tokens: 1500,
            }
          }
          if (endpoint === RIGHTCODE_ENDPOINTS.subscriptions) {
            return {
              subscriptions: [
                {
                  id: 1,
                  name: "Pro Plan",
                  expired_at: "2099-01-01T00:00:00",
                },
              ],
            }
          }
          if (endpoint === RIGHTCODE_ENDPOINTS.subscriptionSummary) {
            return {
              total_quota: 100,
              used_quota: 25,
              remaining_quota: 75,
              active_subscription_count: 1,
            }
          }
          throw new Error(`Unhandled endpoint: ${endpoint}`)
        },
      )

      const result = await fetchAccountData(accountRequest)

      expect(result.quota).toBe(12.34 * 500000)
      expect(result.today_quota_consumption).toBe(0.5 * 500000)
      expect(result.today_completion_tokens).toBe(1500)
      expect(result.today_requests_count).toBe(10)
      expect(result.todayStatsAvailability?.consumption.status).toBe(
        ACCOUNT_TODAY_METRIC_STATUSES.Complete,
      )
      expect(result.usage).toEqual({
        scope: "lifetime",
        totalRequests: 120,
        totalTokens: 34500,
        totalCost: 5.67,
      })
      expect(result.subscription).toEqual({
        name: "Pro Plan",
        amountLimit: 100,
        usedAmount: 25,
        remainingAmount: 75,
        expireTime: "2099-01-01T00:00:00",
        isLongTerm: false,
        isActive: true,
      })
    })

    it("omits today collection when includeTodayCashflow is false", async () => {
      vi.mocked(fetchRightCodeData).mockImplementation(
        async (_req, endpoint) => {
          if (endpoint === RIGHTCODE_ENDPOINTS.me) {
            return {
              id: 42,
              username: "testuser",
              user_token: "token",
              balance: "5.00",
            }
          }
          if (endpoint === RIGHTCODE_ENDPOINTS.usageStatsOverall) {
            return { total_requests: 0, total_tokens: 0, total_cost: 0 }
          }
          if (endpoint === RIGHTCODE_ENDPOINTS.subscriptions) {
            return { subscriptions: [] }
          }
          if (endpoint === RIGHTCODE_ENDPOINTS.subscriptionSummary) {
            return { active_subscription_count: 0 }
          }
          throw new Error(`Unexpected endpoint: ${endpoint}`)
        },
      )

      const result = await fetchAccountData({
        ...accountRequest,
        includeTodayCashflow: false,
      })

      expect(result.today_quota_consumption).toBe(0)
      expect(result.todayStatsAvailability?.consumption).toEqual({
        status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
        reason: ACCOUNT_TODAY_METRIC_REASONS.NotCollected,
      })
    })

    it("handles today usage endpoint failure gracefully", async () => {
      vi.mocked(fetchRightCodeData).mockImplementation(
        async (_req, endpoint) => {
          if (endpoint === RIGHTCODE_ENDPOINTS.me) {
            return {
              id: 42,
              username: "testuser",
              user_token: "token",
              balance: 1,
            }
          }
          if (endpoint === RIGHTCODE_ENDPOINTS.usageStatsOverall) {
            return { total_requests: 0, total_tokens: 0, total_cost: 0 }
          }
          if (endpoint === RIGHTCODE_ENDPOINTS.usageStats) {
            throw new Error("today failed")
          }
          if (endpoint === RIGHTCODE_ENDPOINTS.subscriptions) {
            return { subscriptions: [] }
          }
          if (endpoint === RIGHTCODE_ENDPOINTS.subscriptionSummary) {
            return { active_subscription_count: 0 }
          }
          throw new Error(`Unexpected endpoint: ${endpoint}`)
        },
      )

      const result = await fetchAccountData(accountRequest)

      expect(result.today_quota_consumption).toBe(0)
      expect(result.todayStatsAvailability?.consumption).toEqual({
        status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
        reason: ACCOUNT_TODAY_METRIC_REASONS.RequestFailed,
      })
    })

    it("handles subscriptions endpoint failure gracefully", async () => {
      vi.mocked(fetchRightCodeData).mockImplementation(
        async (_req, endpoint) => {
          if (endpoint === RIGHTCODE_ENDPOINTS.me) {
            return {
              id: 42,
              username: "testuser",
              user_token: "token",
              balance: 1,
            }
          }
          if (endpoint === RIGHTCODE_ENDPOINTS.usageStatsOverall) {
            return { total_requests: 0, total_tokens: 0, total_cost: 0 }
          }
          if (endpoint === RIGHTCODE_ENDPOINTS.usageStats) {
            return { total_cost: 0, total_requests: 0, total_tokens: 0 }
          }
          if (endpoint === RIGHTCODE_ENDPOINTS.subscriptions) {
            throw new Error("subscription network failure")
          }
          if (endpoint === RIGHTCODE_ENDPOINTS.subscriptionSummary) {
            throw new Error("summary network failure")
          }
          throw new Error(`Unexpected endpoint: ${endpoint}`)
        },
      )

      const result = await fetchAccountData(accountRequest)
      expect(result.subscription).toBeUndefined()
    })

    it("handles long term and expired subscriptions in fetchAccountData", async () => {
      vi.mocked(fetchRightCodeData).mockImplementation(
        async (_req, endpoint) => {
          if (endpoint === RIGHTCODE_ENDPOINTS.me) {
            return {
              id: 42,
              username: "testuser",
              user_token: "token",
              balance: 1,
            }
          }
          if (endpoint === RIGHTCODE_ENDPOINTS.usageStatsOverall) {
            return { total_requests: 1, total_tokens: 10, total_cost: 0.1 }
          }
          if (endpoint === RIGHTCODE_ENDPOINTS.usageStats) {
            return { total_cost: 0, total_requests: 0, total_tokens: 0 }
          }
          if (endpoint === RIGHTCODE_ENDPOINTS.subscriptions) {
            return {
              subscriptions: [
                {
                  id: 1,
                  name: "Expired Plan",
                  expired_at: "2020-01-01T00:00:00",
                },
                {
                  id: 2,
                  name: "Long Term Plan",
                  expired_at: null,
                },
                {
                  id: 3,
                  name: "Invalid Date Plan",
                  expired_at: "not-a-date",
                },
              ],
            }
          }
          if (endpoint === RIGHTCODE_ENDPOINTS.subscriptionSummary) {
            return {
              active_subscription_count: 2,
              remaining_quota: 50,
            }
          }
          throw new Error(`Unexpected endpoint: ${endpoint}`)
        },
      )

      const result = await fetchAccountData(accountRequest)
      expect(result.subscription).toBeDefined()
      expect(result.subscription?.isLongTerm).toBe(false) // because "not-a-date" is kept in expiries
      expect(result.subscription?.name).toContain("Long Term Plan")
    })

    it("throws when overall usage stats payload is invalid", async () => {
      vi.mocked(fetchRightCodeData).mockImplementation(
        async (_req, endpoint) => {
          if (endpoint === RIGHTCODE_ENDPOINTS.me) {
            return {
              id: 42,
              username: "testuser",
              user_token: "token",
              balance: 1,
            }
          }
          if (endpoint === RIGHTCODE_ENDPOINTS.usageStatsOverall) {
            return { invalid: true }
          }
          return {}
        },
      )

      await expect(fetchAccountData(accountRequest)).rejects.toThrow(
        "invalid_rightcode_overall_usage_stats",
      )
    })
  })

  describe("refreshAccountData", () => {
    it("returns healthy result when fetchAccountData succeeds", async () => {
      vi.mocked(fetchRightCodeData).mockImplementation(
        async (_req, endpoint) => {
          if (endpoint === RIGHTCODE_ENDPOINTS.me) {
            return {
              id: 42,
              username: "testuser",
              user_token: "token",
              balance: 10,
            }
          }
          if (endpoint === RIGHTCODE_ENDPOINTS.usageStatsOverall) {
            return { total_requests: 5, total_tokens: 50, total_cost: 1 }
          }
          if (endpoint === RIGHTCODE_ENDPOINTS.usageStats) {
            return { total_cost: 0, total_requests: 0, total_tokens: 0 }
          }
          return { subscriptions: [] }
        },
      )

      const result = await refreshAccountData(accountRequest)
      expect(result.success).toBe(true)
      expect(result.healthStatus?.status).toBe(SiteHealthStatus.Healthy)
    })

    it("returns error result on non-auth failure", async () => {
      vi.mocked(fetchRightCodeData).mockRejectedValueOnce(
        new Error("database error"),
      )
      vi.mocked(isRightCodeAuthFailureError).mockReturnValueOnce(false)

      const result = await refreshAccountData(accountRequest)
      expect(result.success).toBe(false)
      expect(result.healthStatus?.status).toBe(SiteHealthStatus.Unknown)
    })
  })
})
