import { http, HttpResponse } from "msw"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { ApiServiceAccountRequest } from "~/services/accounts/accountDataModel"
import type { CreateTokenRequest } from "~/services/accountTokens/tokenProvisioningModel"
import {
  createVoApiV2Token,
  deleteVoApiV2Token,
  fetchSupportCheckIn,
  fetchVoApiV2AccountData,
  fetchVoApiV2AvailableModels,
  fetchVoApiV2Tokens,
  fetchVoApiV2UserGroups,
  refreshAccountData,
  resolveVoApiV2TokenKey,
  setVoApiV2TokenEnabled,
  submitVoApiV2CheckIn,
  updateVoApiV2Token,
} from "~/services/apiService/voapiV2"
import { AuthTypeEnum, SiteHealthStatus } from "~/types"
import { server } from "~~/tests/msw/server"

const { mockResyncVoApiV2AuthToken } = vi.hoisted(() => ({
  mockResyncVoApiV2AuthToken: vi.fn(),
}))

vi.mock("~/services/apiService/voapiV2/tokenResync", () => ({
  resyncVoApiV2AuthToken: mockResyncVoApiV2AuthToken,
}))

const createVoApiV2Request = (): ApiServiceAccountRequest => ({
  baseUrl: "https://example.invalid",
  accountId: "account-1",
  auth: {
    authType: AuthTypeEnum.AccessToken,
    accessToken: "example-dashboard-token",
    userId: 7,
  },
  checkIn: {
    enableDetection: true,
  },
})

const tokenRequest: CreateTokenRequest = {
  name: "default",
  group: "default",
  remain_quota: 500000,
  expired_time: 1893456000,
  unlimited_quota: false,
  model_limits_enabled: false,
  model_limits: "",
  allow_ips: "",
}

describe("apiService VoAPI v2", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    mockResyncVoApiV2AuthToken.mockReset()
    mockResyncVoApiV2AuthToken.mockResolvedValue(null)
    server.resetHandlers()
  })

  it("fetches account data with raw authorization and today statistics", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000)

    server.use(
      http.get("https://example.invalid/api/user/info", ({ request }) => {
        expect(request.headers.get("authorization")).toBe(
          "example-dashboard-token",
        )
        return HttpResponse.json({
          code: 0,
          data: {
            id: 7,
            username: "owner",
            basicBalance: "2",
            bindBalance: "3",
            totalRequest: 123,
            totalToken: 456,
            currency: "USD",
          },
        })
      }),
      http.get("https://example.invalid/api/dash/statistics", () =>
        HttpResponse.json({
          code: 0,
          data: {
            d: {
              requests: 9,
              usedBasicBalance: "0.5",
              usedBindBalance: "0.25",
              errors: 0,
              maxRpm: 1,
            },
          },
        }),
      ),
      http.get("https://example.invalid/api/check_in/stats", () =>
        HttpResponse.json({
          code: 0,
          data: { todaySigned: true, consecutiveDays: 2 },
        }),
      ),
    )

    const data = await fetchVoApiV2AccountData(createVoApiV2Request())

    expect(data.quota).toBe(2500000)
    expect(data.today_quota_consumption).toBe(375000)
    expect(data.today_requests_count).toBe(9)
    expect(data.checkIn.siteStatus).toMatchObject({
      isCheckedInToday: true,
      lastDetectedAt: 1_700_000_000_000,
    })
  })

  it("skips today statistics when cashflow refresh is disabled but still detects check-in status", async () => {
    let statsCalled = false
    server.use(
      http.get("https://example.invalid/api/user/info", () =>
        HttpResponse.json({
          code: 0,
          data: { id: 7, basicBalance: "2", bindBalance: "0" },
        }),
      ),
      http.get("https://example.invalid/api/dash/statistics", () => {
        statsCalled = true
        return HttpResponse.json({ code: 0, data: { d: { requests: 1 } } })
      }),
      http.get("https://example.invalid/api/check_in/stats", () =>
        HttpResponse.json({
          code: 0,
          data: { todaySigned: false },
        }),
      ),
    )

    const data = await fetchVoApiV2AccountData({
      ...createVoApiV2Request(),
      includeTodayCashflow: false,
    })

    expect(data.quota).toBe(1000000)
    expect(data.today_quota_consumption).toBe(0)
    expect(statsCalled).toBe(false)
    expect(data.checkIn.siteStatus?.isCheckedInToday).toBe(false)
  })

  it("preserves existing check-in status when VoAPI v2 status detection fails", async () => {
    server.use(
      http.get("https://example.invalid/api/user/info", () =>
        HttpResponse.json({
          code: 0,
          data: { id: 7, basicBalance: "2", bindBalance: "0" },
        }),
      ),
      http.get("https://example.invalid/api/dash/statistics", () =>
        HttpResponse.json({ code: 0, data: { d: { requests: 1 } } }),
      ),
      http.get("https://example.invalid/api/check_in/stats", () =>
        HttpResponse.json({ code: 2, data: null, msg: "Auth expire" }),
      ),
    )

    const data = await fetchVoApiV2AccountData({
      ...createVoApiV2Request(),
      checkIn: {
        enableDetection: true,
        siteStatus: {
          isCheckedInToday: true,
          lastDetectedAt: 123,
        },
      },
    })

    expect(data.checkIn.siteStatus).toEqual({
      isCheckedInToday: true,
      lastDetectedAt: 123,
    })
  })

  it("refreshes account data and maps expired dashboard JWT failures", async () => {
    server.use(
      http.get("https://example.invalid/api/user/info", () =>
        HttpResponse.json({
          code: 2,
          data: null,
          msg: "Auth expire",
        }),
      ),
      http.get("https://example.invalid/api/dash/statistics", () =>
        HttpResponse.json({
          code: 2,
          data: null,
          msg: "Auth expire",
        }),
      ),
      http.get("https://example.invalid/api/check_in/stats", () =>
        HttpResponse.json({
          code: 2,
          data: null,
          msg: "Auth expire",
        }),
      ),
    )

    await expect(refreshAccountData(createVoApiV2Request())).resolves.toEqual({
      success: false,
      healthStatus: expect.objectContaining({
        status: SiteHealthStatus.Warning,
      }),
    })
  })

  it("re-syncs the dashboard JWT from a logged-in browser session after auth expiry", async () => {
    const authorizations: (string | null)[] = []
    mockResyncVoApiV2AuthToken.mockResolvedValueOnce({
      accessToken: "resynced-dashboard-token",
      userId: "8",
      username: "resynced-owner",
      source: "existing_tab",
    })

    server.use(
      http.get("https://example.invalid/api/user/info", ({ request }) => {
        const authorization = request.headers.get("authorization")
        authorizations.push(authorization)

        if (authorization === "example-dashboard-token") {
          return HttpResponse.json({
            code: 2,
            data: null,
            msg: "Auth expire",
          })
        }

        return HttpResponse.json({
          code: 0,
          data: {
            id: 8,
            username: "resynced-owner",
            basicBalance: "2",
            bindBalance: "0",
          },
        })
      }),
      http.get("https://example.invalid/api/dash/statistics", () =>
        HttpResponse.json({
          code: 0,
          data: { d: { requests: 1, usedBasicBalance: "0" } },
        }),
      ),
      http.get("https://example.invalid/api/check_in/stats", () =>
        HttpResponse.json({
          code: 0,
          data: { todaySigned: false },
        }),
      ),
    )

    await expect(refreshAccountData(createVoApiV2Request())).resolves.toEqual(
      expect.objectContaining({
        success: true,
        authUpdate: {
          accessToken: "resynced-dashboard-token",
          userId: "8",
          username: "resynced-owner",
        },
      }),
    )

    expect(authorizations).toContain("example-dashboard-token")
    expect(authorizations).toContain("resynced-dashboard-token")
    expect(mockResyncVoApiV2AuthToken).toHaveBeenCalledWith(
      "https://example.invalid",
    )
  })

  it("reveals token secrets from the VoAPI v2 reveal endpoint", async () => {
    server.use(
      http.post("https://example.invalid/api/keys/11/token", () =>
        HttpResponse.json({
          code: 0,
          data: { token: "example-revealed-api-key" },
        }),
      ),
    )

    await expect(
      resolveVoApiV2TokenKey(createVoApiV2Request(), {
        id: 11,
        key: "masked-example-key",
      }),
    ).resolves.toBe("example-revealed-api-key")
  })

  it("normalizes VoAPI v2 key inventory", async () => {
    server.use(
      http.get("https://example.invalid/api/keys", () =>
        HttpResponse.json({
          code: 0,
          data: [
            {
              id: 11,
              name: "default",
              tokenMasked: "masked-example-key",
              groups: [2],
              enable: true,
              expireTime: 1893456000000,
              amount: "2",
              used: "0.5",
            },
          ],
        }),
      ),
      http.get("https://example.invalid/api/keys/template", () =>
        HttpResponse.json({
          code: 0,
          data: {
            groups: [{ id: 2, name: "standard", ratio: 1 }],
            models: [],
          },
        }),
      ),
    )

    await expect(fetchVoApiV2Tokens(createVoApiV2Request())).resolves.toEqual([
      expect.objectContaining({
        id: 11,
        name: "default",
        key: "masked-example-key",
        status: 1,
        remain_quota: 1000000,
        used_quota: 250000,
        group: "standard",
        expired_time: 1893456000,
      }),
    ])
  })

  it("normalizes VoAPI v2 paginated key inventory records with group names", async () => {
    server.use(
      http.get("https://example.invalid/api/keys", () =>
        HttpResponse.json({
          code: 0,
          data: {
            page: 1,
            size: 10,
            total: 2,
            pages: 1,
            records: [
              {
                id: 8396,
                name: "default",
                tokenMasked: "sk-example****0001",
                groups: [1],
                enable: true,
                expireTime: -1,
                boundlessAmount: true,
                amount: "0.00000000",
                used: "0.00000000",
              },
              {
                id: 8395,
                name: "quota-limited",
                tokenMasked: "sk-example****0002",
                groups: [2],
                enable: false,
                expireTime: 4102329600000,
                amount: "100.00000000",
                used: "0.50000000",
              },
            ],
          },
        }),
      ),
      http.get("https://example.invalid/api/keys/template", () =>
        HttpResponse.json({
          code: 0,
          data: {
            groups: [
              { id: 1, name: "default", ratio: 1 },
              { id: 2, name: "priority", ratio: 1 },
            ],
            models: [],
          },
        }),
      ),
    )

    await expect(fetchVoApiV2Tokens(createVoApiV2Request())).resolves.toEqual([
      expect.objectContaining({
        id: 8396,
        name: "default",
        key: "sk-example****0001",
        status: 1,
        remain_quota: 0,
        unlimited_quota: true,
        used_quota: 0,
        group: "default",
        expired_time: -1,
      }),
      expect.objectContaining({
        id: 8395,
        name: "quota-limited",
        key: "sk-example****0002",
        status: 2,
        remain_quota: 50000000,
        used_quota: 250000,
        group: "priority",
        expired_time: 4102329600,
      }),
    ])
  })

  it("creates keys with VoAPI v2 amount and group payloads", async () => {
    let payload: unknown
    server.use(
      http.get("https://example.invalid/api/keys/template", () =>
        HttpResponse.json({
          code: 0,
          data: {
            groups: [{ id: 2, name: "default", ratio: 1 }],
            models: [],
          },
        }),
      ),
      http.post("https://example.invalid/api/keys", async ({ request }) => {
        payload = await request.json()
        return HttpResponse.json({ code: 0, data: null })
      }),
    )

    await expect(
      createVoApiV2Token(createVoApiV2Request(), tokenRequest),
    ).resolves.toBe(true)

    expect(payload).toEqual({
      name: "default",
      groups: [2],
      amount: "1",
      boundlessAmount: false,
      genCount: 1,
      enable: true,
      expireTime: 1893456000000,
    })
  })

  it("creates unlimited keys with VoAPI v2 boundlessAmount", async () => {
    let payload: unknown
    server.use(
      http.get("https://example.invalid/api/keys/template", () =>
        HttpResponse.json({
          code: 0,
          data: {
            groups: [{ id: 2, name: "default", ratio: 1 }],
            models: [],
          },
        }),
      ),
      http.post("https://example.invalid/api/keys", async ({ request }) => {
        payload = await request.json()
        return HttpResponse.json({ code: 0, data: null })
      }),
    )

    await expect(
      createVoApiV2Token(createVoApiV2Request(), {
        ...tokenRequest,
        remain_quota: 0,
        unlimited_quota: true,
      }),
    ).resolves.toBe(true)

    expect(payload).toEqual({
      name: "default",
      groups: [2],
      amount: "0",
      boundlessAmount: true,
      genCount: 1,
      enable: true,
      expireTime: 1893456000000,
    })
  })

  it("updates and toggles keys with preserved VoAPI v2 fields", async () => {
    const payloads: unknown[] = []
    server.use(
      http.get("https://example.invalid/api/keys/template", () =>
        HttpResponse.json({
          code: 0,
          data: {
            groups: [
              { id: 2, name: "default", ratio: 1 },
              { id: 3, name: "previous-group", ratio: 1 },
            ],
            models: [],
          },
        }),
      ),
      http.get("https://example.invalid/api/keys", () =>
        HttpResponse.json({
          code: 0,
          data: [
            {
              id: 11,
              name: "previous",
              groups: [3],
              enable: true,
              expireTime: -1,
              boundlessAmount: true,
              amount: "2",
              used: "0.25",
              note: "keep me",
            },
          ],
        }),
      ),
      http.put("https://example.invalid/api/keys/11", async ({ request }) => {
        payloads.push(await request.json())
        return HttpResponse.json({ code: 0, data: null })
      }),
    )

    await expect(
      updateVoApiV2Token(createVoApiV2Request(), 11, {
        ...tokenRequest,
        remain_quota: 0,
        unlimited_quota: true,
      }),
    ).resolves.toBe(true)
    await expect(
      setVoApiV2TokenEnabled(createVoApiV2Request(), 11, false),
    ).resolves.toBe(true)

    expect(payloads[0]).toEqual({
      id: 11,
      name: "default",
      groups: [2],
      amount: "0",
      boundlessAmount: true,
      enable: true,
      expireTime: 1893456000000,
      used: "0.25",
      note: "keep me",
    })
    expect(payloads[1]).toEqual({
      id: 11,
      name: "previous",
      groups: [3],
      enable: false,
      expireTime: -1,
      boundlessAmount: true,
      amount: "2",
      used: "0.25",
      note: "keep me",
    })
  })

  it("deletes VoAPI v2 keys", async () => {
    let deleted = false
    server.use(
      http.delete("https://example.invalid/api/keys/11", () => {
        deleted = true
        return HttpResponse.json({ code: 0, data: null })
      }),
    )

    await expect(deleteVoApiV2Token(createVoApiV2Request(), 11)).resolves.toBe(
      true,
    )
    expect(deleted).toBe(true)
  })

  it("maps VoAPI v2 template groups and models", async () => {
    server.use(
      http.get("https://example.invalid/api/keys/template", () =>
        HttpResponse.json({
          code: 0,
          data: {
            groups: [{ id: 2, name: "Default", ratio: 1, note: "main" }],
            models: [
              { idKey: "gpt-4.1", enable: true, hidden: false },
              { idKey: "hidden-model", enable: true, hidden: true },
              { idKey: "disabled-model", enable: false, hidden: false },
            ],
          },
        }),
      ),
    )

    await expect(
      fetchVoApiV2AvailableModels(createVoApiV2Request()),
    ).resolves.toEqual(["gpt-4.1"])
    await expect(
      fetchVoApiV2UserGroups(createVoApiV2Request()),
    ).resolves.toEqual({
      "2": { desc: "main", ratio: 1 },
    })
  })

  it("supports VoAPI v2 API check-in helpers", async () => {
    server.use(
      http.get("https://example.invalid/api/check_in/stats", () =>
        HttpResponse.json({
          code: 0,
          data: { todaySigned: true, consecutiveDays: 2 },
        }),
      ),
      http.post("https://example.invalid/api/check_in", () =>
        HttpResponse.json({ code: 0, data: { amount: "0.1" } }),
      ),
    )

    await expect(fetchSupportCheckIn(createVoApiV2Request())).resolves.toBe(
      true,
    )
    await expect(submitVoApiV2CheckIn(createVoApiV2Request())).resolves.toEqual(
      {
        amount: "0.1",
      },
    )
  })

  it("classifies repeated VoAPI v2 check-in as already signed", async () => {
    server.use(
      http.post("https://example.invalid/api/check_in", () =>
        HttpResponse.json({ code: 1, data: null, msg: "Signed in today" }),
      ),
    )

    await expect(submitVoApiV2CheckIn(createVoApiV2Request())).resolves.toEqual(
      {
        alreadySigned: true,
      },
    )
  })
})
