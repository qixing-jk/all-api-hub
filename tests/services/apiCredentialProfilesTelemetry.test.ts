import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { apiCredentialProfilesStorage } from "~/services/apiCredentialProfiles/apiCredentialProfilesStorage"
import { refreshApiCredentialProfileTelemetry } from "~/services/apiCredentialProfiles/telemetry"
import { API_TYPES } from "~/services/verification/aiApiVerification"
import { SiteHealthStatus } from "~/types"

const { fetchApiCredentialModelIdsMock, storageData } = vi.hoisted(() => ({
  fetchApiCredentialModelIdsMock: vi.fn(),
  storageData: new Map<string, any>(),
}))

vi.mock("@plasmohq/storage", () => {
  class Storage {
    async set(key: string, value: any) {
      storageData.set(key, value)
    }

    async get(key: string) {
      return storageData.get(key)
    }

    async remove(key: string) {
      storageData.delete(key)
    }
  }

  return { Storage }
})

vi.mock("~/services/apiCredentialProfiles/modelCatalog", () => ({
  fetchApiCredentialModelIds: (...args: any[]) =>
    fetchApiCredentialModelIdsMock(...args),
}))

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })
}

describe("api credential profile telemetry", () => {
  beforeEach(async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-04-19T00:00:00.000Z"))
    storageData.clear()
    fetchApiCredentialModelIdsMock.mockResolvedValue(["gpt-4o", "o3"])
    await apiCredentialProfilesStorage.clearAllData()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it("refreshes DeepSeek balance telemetry with provider currency facts", async () => {
    const profile = await apiCredentialProfilesStorage.createProfile({
      name: "DeepSeek",
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      baseUrl: "https://api.deepseek.com",
      apiKey: "sk-deepseek",
      telemetryConfig: { mode: "auto" },
    })

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith("/user/balance")) {
        return jsonResponse({
          is_available: true,
          balance_infos: [
            {
              currency: "CNY",
              total_balance: "12.34",
              granted_balance: "2.00",
              topped_up_balance: "10.34",
            },
          ],
        })
      }
      return jsonResponse({ data: [] })
    })
    vi.stubGlobal("fetch", fetchMock)

    const snapshot = await refreshApiCredentialProfileTelemetry(profile.id)

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.deepseek.com/user/balance",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Authorization: "Bearer sk-deepseek",
        }),
      }),
    )
    expect(snapshot).toEqual(
      expect.objectContaining({
        health: { status: SiteHealthStatus.Healthy },
        source: "deepSeekBalance",
        facts: expect.objectContaining({
          balances: [
            {
              amount: 12.34,
              unit: { kind: "money", currency: "CNY", decimalPlaces: 2 },
              semantics: "cash",
              grantedAmount: 2,
              toppedUpAmount: 10.34,
              isAvailable: true,
            },
          ],
        }),
      }),
    )
  })

  it("marks an unavailable DeepSeek account as a warning", async () => {
    const profile = await apiCredentialProfilesStorage.createProfile({
      name: "Unavailable DeepSeek",
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      baseUrl: "https://api.deepseek.com",
      apiKey: "sk-deepseek-unavailable",
      telemetryConfig: { mode: "deepSeekBalance" },
    })

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith("/user/balance")) {
        return jsonResponse({ is_available: false, balance_infos: [] })
      }
      return jsonResponse({ data: [] })
    })
    vi.stubGlobal("fetch", fetchMock)

    const snapshot = await refreshApiCredentialProfileTelemetry(profile.id)

    expect(snapshot).toEqual(
      expect.objectContaining({
        health: {
          status: SiteHealthStatus.Warning,
          reason: "insufficient-balance",
        },
        source: "deepSeekBalance",
        facts: expect.objectContaining({
          balances: [
            {
              amount: 0,
              unit: { kind: "money", currency: "CNY", decimalPlaces: 2 },
              semantics: "cash",
              isAvailable: false,
            },
          ],
        }),
      }),
    )
  })

  it("rejects a malformed DeepSeek balance response instead of inventing zero", async () => {
    const profile = await apiCredentialProfilesStorage.createProfile({
      name: "Malformed DeepSeek",
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      baseUrl: "https://api.deepseek.com",
      apiKey: "sk-deepseek-malformed",
      telemetryConfig: { mode: "deepSeekBalance" },
    })

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ is_available: false })),
    )

    const snapshot = await refreshApiCredentialProfileTelemetry(profile.id)

    expect(snapshot.source).toBeUndefined()
    expect(snapshot.facts?.balances).toBeUndefined()
    expect(snapshot.attempts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "deepSeekBalance",
          status: "unsupported",
        }),
      ]),
    )
  })

  it("auto-detects OpenCode Go usage and converts provider used-percent to remaining quota", async () => {
    const profile = await apiCredentialProfilesStorage.createProfile({
      name: "OpenCode Go",
      apiType: API_TYPES.ANTHROPIC,
      baseUrl: "https://opencode.ai/zen/go",
      apiKey: "sk-opencode-go",
      telemetryConfig: { mode: "auto" },
    })

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith("/zen/go/v1/usage")) {
        return jsonResponse({
          usage: {
            rolling: {
              status: "ok",
              percent: 25,
              resetsAt: "2026-04-19T05:00:00.000Z",
            },
            weekly: { status: "ok", percent: 40, resetsAt: "invalid" },
            monthly: { status: "ok", percent: 0 },
          },
        })
      }
      return jsonResponse({ data: [] })
    })
    vi.stubGlobal("fetch", fetchMock)

    const snapshot = await refreshApiCredentialProfileTelemetry(profile.id)

    expect(fetchMock).toHaveBeenCalledWith(
      "https://opencode.ai/zen/go/v1/usage",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Authorization: "Bearer sk-opencode-go",
        }),
      }),
    )
    expect(snapshot).toEqual(
      expect.objectContaining({
        health: { status: SiteHealthStatus.Healthy },
        source: "openCodeGoUsage",
        facts: expect.objectContaining({
          quota: {
            windows: [
              expect.objectContaining({
                type: "fiveHour",
                unit: { kind: "percent" },
                remainingPercent: 75,
                resetTime: new Date("2026-04-19T05:00:00.000Z").getTime(),
              }),
              expect.objectContaining({
                type: "weekly",
                unit: { kind: "percent" },
                remainingPercent: 60,
              }),
              expect.objectContaining({
                type: "monthly",
                unit: { kind: "percent" },
                remainingPercent: 100,
              }),
            ],
          },
        }),
      }),
    )
    // The weekly fixture's invalid resetsAt must not leak through as a
    // garbage resetTime on that window.
    const weeklyWindow = snapshot.facts?.quota?.windows?.find(
      (window) => window.type === "weekly",
    )
    expect(weeklyWindow?.resetTime).toBeUndefined()
  })

  it("ignores OpenCode windows whose provider status is not ok", async () => {
    const profile = await apiCredentialProfilesStorage.createProfile({
      name: "OpenCode stale",
      apiType: API_TYPES.ANTHROPIC,
      baseUrl: "https://opencode.ai/zen/go",
      apiKey: "sk-opencode-stale",
      telemetryConfig: { mode: "openCodeGoUsage" },
    })

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          usage: {
            rolling: { status: "error", percent: 1 },
            weekly: { status: "ok", percent: 20 },
          },
        }),
      ),
    )

    const snapshot = await refreshApiCredentialProfileTelemetry(profile.id)

    expect(snapshot.facts?.quota?.windows).toEqual([
      expect.objectContaining({ type: "weekly", remainingPercent: 80 }),
    ])
  })

  it("does not treat an incompatible OpenCode usage payload as quota data", async () => {
    const profile = await apiCredentialProfilesStorage.createProfile({
      name: "Invalid OpenCode",
      apiType: API_TYPES.ANTHROPIC,
      baseUrl: "https://opencode.ai/zen/go",
      apiKey: "sk-opencode-invalid",
      telemetryConfig: { mode: "openCodeGoUsage" },
    })

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          usage: {
            rolling: { status: "ok", percent: 125 },
            weekly: { status: "ok", percent: "unknown" },
            monthly: { status: "ok" },
          },
        }),
      ),
    )

    const snapshot = await refreshApiCredentialProfileTelemetry(profile.id)

    expect(snapshot.source).toBeUndefined()
    expect(snapshot.facts?.quota).toBeUndefined()
    expect(snapshot.attempts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "openCodeGoUsage",
          status: "unsupported",
          message: "No usage fields returned",
        }),
      ]),
    )
  })

  it("auto-detects GLM and normalizes five-hour and weekly quota windows", async () => {
    const profile = await apiCredentialProfilesStorage.createProfile({
      name: "GLM",
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      baseUrl: "https://open.bigmodel.cn",
      apiKey: "glm.example-key",
      telemetryConfig: { mode: "auto" },
    })

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith("/api/monitor/usage/quota/limit")) {
        return jsonResponse({
          success: true,
          data: {
            level: "pro",
            limits: [
              {
                type: "TOKENS_LIMIT",
                unit: 3,
                number: 5,
                percentage: 25,
                nextResetTime: 1776556800000,
              },
              {
                type: "CREDIT_LIMIT",
                unit: 6,
                number: 1,
                usage: 10000,
                currentValue: 2500,
                remaining: 7500,
              },
              {
                type: "TIME_LIMIT",
                percentage: 10,
                usage: 100,
                currentValue: 10,
                nextResetTime: 1779235200000,
              },
            ],
          },
        })
      }
      return jsonResponse({ data: [] })
    })
    vi.stubGlobal("fetch", fetchMock)

    const snapshot = await refreshApiCredentialProfileTelemetry(profile.id)

    expect(snapshot).toEqual(
      expect.objectContaining({
        health: { status: SiteHealthStatus.Healthy },
        source: "glmQuota",
        facts: expect.objectContaining({
          quota: {
            membershipLevel: "pro",
            windows: [
              expect.objectContaining({
                type: "fiveHour",
                remainingPercent: 75,
                unit: { kind: "percent" },
              }),
              expect.objectContaining({
                type: "weekly",
                remainingPercent: 75,
                used: 2500,
                limit: 10000,
                remaining: 7500,
                unit: {
                  kind: "quota",
                  code: "glm-credit",
                  label: "GLM credits",
                },
              }),
              expect.objectContaining({
                type: "monthly",
                remainingPercent: 90,
                used: 10,
                limit: 100,
                remaining: 90,
                unit: {
                  kind: "quota",
                  code: "glm-credit",
                  label: "GLM credits",
                },
              }),
            ],
          },
        }),
      }),
    )
    expect(fetchMock).toHaveBeenCalledWith(
      "https://open.bigmodel.cn/api/monitor/usage/quota/limit",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "glm.example-key",
        }),
      }),
    )
  })

  it("auto-detects the international GLM quota endpoint", async () => {
    const profile = await apiCredentialProfilesStorage.createProfile({
      name: "GLM International",
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      baseUrl: "https://api.z.ai/api/coding/paas/v4",
      apiKey: "zai.example-key",
      telemetryConfig: { mode: "auto" },
    })

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith("/api/monitor/usage/quota/limit")) {
        return jsonResponse({
          success: true,
          data: {
            level: "pro",
            limits: [
              {
                type: "TOKENS_LIMIT",
                unit: 3,
                number: 5,
                percentage: 20,
              },
            ],
          },
        })
      }
      return jsonResponse({ data: [] })
    })
    vi.stubGlobal("fetch", fetchMock)

    const snapshot = await refreshApiCredentialProfileTelemetry(profile.id)

    expect(snapshot.source).toBe("glmQuota")
    expect(snapshot.facts?.quota?.windows).toEqual([
      expect.objectContaining({ type: "fiveHour", remainingPercent: 80 }),
    ])
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.z.ai/api/monitor/usage/quota/limit",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "zai.example-key",
        }),
      }),
    )
  })

  it("does not treat a general Z.AI API endpoint as a Coding Plan", async () => {
    const profile = await apiCredentialProfilesStorage.createProfile({
      name: "Z.AI General API",
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      baseUrl: "https://api.z.ai/api/paas/v4",
      apiKey: "zai-general-key",
      telemetryConfig: { mode: "auto" },
    })

    const fetchMock = vi.fn(async () => jsonResponse({ data: [] }))
    vi.stubGlobal("fetch", fetchMock)

    const snapshot = await refreshApiCredentialProfileTelemetry(profile.id)

    expect(snapshot.source).not.toBe("glmQuota")
    expect(fetchMock).not.toHaveBeenCalledWith(
      "https://api.z.ai/api/monitor/usage/quota/limit",
      expect.anything(),
    )
  })

  it("refreshes Kimi quota windows and an enabled booster balance", async () => {
    const profile = await apiCredentialProfilesStorage.createProfile({
      name: "Kimi",
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      baseUrl: "https://api.kimi.com/coding/v1",
      apiKey: "kimi.example-key",
      telemetryConfig: { mode: "kimiQuota" },
    })

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith("/coding/v1/usages")) {
        return jsonResponse({
          usage: {
            limit: "1000",
            used: "200",
            remaining: "800",
            resetTime: "2026-05-01T00:00:00.000Z",
          },
          limits: [
            {
              window: { duration: 300 },
              detail: {
                limit: "500",
                used: "125",
                remaining: "375",
                resetTime: "2026-04-20T00:00:00.000Z",
              },
            },
          ],
          totalQuota: { limit: "1500", remaining: "1175" },
          user: { membership: { level: "LEVEL_PRO" } },
          boosterWallet: {
            status: "STATUS_ACTIVE",
            balance: { amountLeft: "315250700" },
          },
        })
      }
      return jsonResponse({ data: [] })
    })
    vi.stubGlobal("fetch", fetchMock)

    const snapshot = await refreshApiCredentialProfileTelemetry(profile.id)

    expect(snapshot).toEqual(
      expect.objectContaining({
        health: { status: SiteHealthStatus.Healthy },
        source: "kimiQuota",
        facts: expect.objectContaining({
          balances: [
            {
              amount: 3.152507,
              unit: { kind: "money", currency: "CNY", decimalPlaces: 2 },
              semantics: "provider-wallet",
              isAvailable: true,
            },
          ],
          quota: {
            membershipLevel: "LEVEL_PRO",
            windows: [
              expect.objectContaining({
                type: "weekly",
                remainingPercent: 80,
                remaining: 800,
              }),
              expect.objectContaining({
                type: "fiveHour",
                remainingPercent: 75,
                remaining: 375,
              }),
              expect.objectContaining({
                type: "total",
                remainingPercent: 78.33333333333333,
                remaining: 1175,
              }),
            ],
          },
        }),
      }),
    )
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.kimi.com/coding/v1/usages",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer kimi.example-key",
        }),
      }),
    )
  })

  it("auto-detects Kimi CN Open Platform balance telemetry", async () => {
    const profile = await apiCredentialProfilesStorage.createProfile({
      name: "Kimi Open Platform",
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      baseUrl: "https://api.moonshot.cn",
      apiKey: "sk-moonshot-cn",
      telemetryConfig: { mode: "auto" },
    })

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith("/v1/users/me/balance")) {
        return jsonResponse({
          code: 0,
          data: {
            available_balance: 49.58894,
            voucher_balance: 46.58893,
            cash_balance: 3.00001,
          },
          scode: "0x0",
          status: true,
        })
      }
      return jsonResponse({ data: [] })
    })
    vi.stubGlobal("fetch", fetchMock)

    const snapshot = await refreshApiCredentialProfileTelemetry(profile.id)

    expect(snapshot).toEqual(
      expect.objectContaining({
        health: { status: SiteHealthStatus.Healthy },
        source: "kimiOpenPlatformBalance",
        facts: expect.objectContaining({
          balances: [
            {
              amount: 49.58894,
              unit: { kind: "money", currency: "CNY", decimalPlaces: 2 },
              semantics: "provider-wallet",
              grantedAmount: 46.58893,
              toppedUpAmount: 3.00001,
              isAvailable: true,
            },
          ],
        }),
      }),
    )
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.moonshot.cn/v1/users/me/balance",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer sk-moonshot-cn",
        }),
      }),
    )
  })

  it("auto-detects Kimi international Open Platform balance in USD", async () => {
    const profile = await apiCredentialProfilesStorage.createProfile({
      name: "Kimi Open Platform International",
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      baseUrl: "https://api.moonshot.ai",
      apiKey: "sk-moonshot-intl",
      telemetryConfig: { mode: "auto" },
    })

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith("/v1/users/me/balance")) {
        return jsonResponse({
          code: 0,
          data: {
            available_balance: 4.25,
            voucher_balance: 1.25,
            cash_balance: 3,
          },
          status: true,
        })
      }
      return jsonResponse({ data: [] })
    })
    vi.stubGlobal("fetch", fetchMock)

    const snapshot = await refreshApiCredentialProfileTelemetry(profile.id)

    expect(snapshot.facts?.balances).toEqual([
      {
        amount: 4.25,
        unit: { kind: "money", currency: "USD", decimalPlaces: 2 },
        semantics: "provider-wallet",
        grantedAmount: 1.25,
        toppedUpAmount: 3,
        isAvailable: true,
      },
    ])
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.moonshot.ai/v1/users/me/balance",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer sk-moonshot-intl",
        }),
      }),
    )
  })

  it("rejects Kimi Open Platform balances without a successful envelope", async () => {
    const profile = await apiCredentialProfilesStorage.createProfile({
      name: "Kimi invalid balance",
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      baseUrl: "https://api.moonshot.cn",
      apiKey: "sk-moonshot-invalid",
      telemetryConfig: { mode: "kimiOpenPlatformBalance" },
    })

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          code: 1001,
          data: { available_balance: 99 },
          status: false,
        }),
      ),
    )

    const snapshot = await refreshApiCredentialProfileTelemetry(profile.id)

    expect(snapshot.source).toBeUndefined()
    expect(snapshot.facts?.balances).toBeUndefined()
  })

  it("keeps every DeepSeek currency balance in provider order", async () => {
    const profile = await apiCredentialProfilesStorage.createProfile({
      name: "DeepSeek USD",
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      baseUrl: "https://api.deepseek.com",
      apiKey: "sk-deepseek-usd",
      telemetryConfig: { mode: "deepSeekBalance" },
    })

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith("/user/balance")) {
        return jsonResponse({
          is_available: true,
          balance_infos: [
            {
              currency: "CNY",
              total_balance: "0",
              granted_balance: "0",
              topped_up_balance: "0",
            },
            {
              currency: "USD",
              total_balance: "10.50",
              granted_balance: "1.50",
              topped_up_balance: "9.00",
            },
          ],
        })
      }
      return jsonResponse({ data: [] })
    })
    vi.stubGlobal("fetch", fetchMock)

    const snapshot = await refreshApiCredentialProfileTelemetry(profile.id)

    expect(snapshot.facts?.balances).toEqual([
      expect.objectContaining({
        amount: 0,
        unit: { kind: "money", currency: "CNY", decimalPlaces: 2 },
      }),
      expect.objectContaining({
        amount: 10.5,
        unit: { kind: "money", currency: "USD", decimalPlaces: 2 },
      }),
    ])
  })

  it("refreshes NewAPI token telemetry and persists a healthy snapshot", async () => {
    const profile = await apiCredentialProfilesStorage.createProfile({
      name: "NewAPI",
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      baseUrl: "https://newapi.example.com",
      apiKey: "sk-newapi",
      telemetryConfig: { mode: "newApiTokenUsage" },
    })

    const fetchMock = vi.fn(async () =>
      jsonResponse({
        success: true,
        message: "",
        data: {
          total_granted: 5000000,
          total_used: 1250000,
          total_available: 3750000,
          expires_at: 1776556800,
        },
      }),
    )
    vi.stubGlobal("fetch", fetchMock)

    const snapshot = await refreshApiCredentialProfileTelemetry(profile.id)

    expect(fetchMock).toHaveBeenCalledWith(
      "https://newapi.example.com/api/usage/token/",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Authorization: "Bearer sk-newapi",
        }),
      }),
    )
    expect(snapshot).toEqual(
      expect.objectContaining({
        health: { status: SiteHealthStatus.Healthy },
        source: "newApiTokenUsage",
        facts: expect.objectContaining({
          models: { count: 2, preview: ["gpt-4o", "o3"] },
          usage: {
            totalUsed: expect.objectContaining({ value: 2.5 }),
            totalGranted: expect.objectContaining({ value: 10 }),
            totalAvailable: expect.objectContaining({ value: 7.5 }),
            expiresAt: 1776556800000,
          },
        }),
      }),
    )

    await expect(
      apiCredentialProfilesStorage.getProfileById(profile.id),
    ).resolves.toEqual(
      expect.objectContaining({
        telemetrySnapshot: expect.objectContaining({
          facts: expect.objectContaining({
            usage: expect.objectContaining({
              totalAvailable: expect.objectContaining({ value: 7.5 }),
            }),
          }),
        }),
      }),
    )
  })

  it("treats NewAPI unlimited token quota as unlimited instead of negative balance", async () => {
    const profile = await apiCredentialProfilesStorage.createProfile({
      name: "NewAPI Unlimited",
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      baseUrl: "https://newapi-unlimited.example.com",
      apiKey: "sk-newapi-unlimited",
      telemetryConfig: { mode: "newApiTokenUsage" },
    })

    const fetchMock = vi.fn(async () =>
      jsonResponse({
        code: true,
        message: "ok",
        data: {
          expires_at: 0,
          model_limits: {},
          model_limits_enabled: false,
          name: "test",
          object: "token_usage",
          total_available: -940656,
          total_granted: -1,
          total_used: 940655,
          unlimited_quota: true,
        },
      }),
    )
    vi.stubGlobal("fetch", fetchMock)

    const snapshot = await refreshApiCredentialProfileTelemetry(profile.id)

    expect(snapshot).toEqual(
      expect.objectContaining({
        health: { status: SiteHealthStatus.Healthy },
        source: "newApiTokenUsage",
        facts: expect.objectContaining({
          usage: {
            unlimited: true,
            totalUsed: expect.objectContaining({ value: 1.88131 }),
          },
        }),
      }),
    )
    expect(snapshot.facts?.usage?.totalGranted).toBeUndefined()
    expect(snapshot.facts?.usage?.totalAvailable).toBeUndefined()

    await expect(
      apiCredentialProfilesStorage.getProfileById(profile.id),
    ).resolves.toEqual(
      expect.objectContaining({
        telemetrySnapshot: expect.objectContaining({
          facts: expect.objectContaining({
            usage: expect.objectContaining({
              unlimited: true,
              totalUsed: expect.objectContaining({ value: 1.88131 }),
            }),
          }),
        }),
      }),
    )
  })

  it("clamps overdrawn NewAPI token balance to zero for limited tokens", async () => {
    const profile = await apiCredentialProfilesStorage.createProfile({
      name: "NewAPI Overdrawn",
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      baseUrl: "https://newapi-overdrawn.example.com",
      apiKey: "sk-newapi-overdrawn",
      telemetryConfig: { mode: "newApiTokenUsage" },
    })

    const fetchMock = vi.fn(async () =>
      jsonResponse({
        success: true,
        message: "",
        data: {
          total_granted: 1000000,
          total_used: 1250000,
          total_available: -250000,
          unlimited_quota: false,
        },
      }),
    )
    vi.stubGlobal("fetch", fetchMock)

    const snapshot = await refreshApiCredentialProfileTelemetry(profile.id)

    expect(snapshot).toEqual(
      expect.objectContaining({
        source: "newApiTokenUsage",
        facts: expect.objectContaining({
          usage: {
            totalAvailable: expect.objectContaining({ value: 0 }),
            totalGranted: expect.objectContaining({ value: 2 }),
            totalUsed: expect.objectContaining({ value: 2.5 }),
          },
        }),
      }),
    )
    expect(snapshot.facts?.usage?.unlimited).toBeUndefined()
  })

  it("falls through auto presets after unsupported usage endpoint responses", async () => {
    const profile = await apiCredentialProfilesStorage.createProfile({
      name: "Auto",
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      baseUrl: "https://auto.example.com",
      apiKey: "sk-auto",
    })
    fetchApiCredentialModelIdsMock.mockRejectedValue(new Error("models failed"))

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("<!doctype html><title>Not found</title>", {
          status: 404,
          headers: { "content-type": "text/html" },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          balance: 12,
          usage: { today: { requests: 3, cost: 1.25, tokens: 4000 } },
        }),
      )
    vi.stubGlobal("fetch", fetchMock)

    const snapshot = await refreshApiCredentialProfileTelemetry(profile.id)

    expect(snapshot.source).toBe("sub2apiUsage")
    expect(snapshot.facts?.balances?.[0]).toEqual(
      expect.objectContaining({ amount: 12, semantics: "budget-equivalent" }),
    )
    expect(snapshot.facts?.usage?.todayCost).toEqual(
      expect.objectContaining({ value: 1.25 }),
    )
    expect(snapshot.facts?.usage?.todayRequests).toEqual(
      expect.objectContaining({ value: 3 }),
    )
    expect(snapshot.facts?.usage?.todayTokens).toBeUndefined()
    expect(snapshot.attempts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "newApiTokenUsage",
          status: "unsupported",
        }),
        expect.objectContaining({
          source: "sub2apiUsage",
          status: "success",
        }),
      ]),
    )
  })

  it("prefers NewAPI token telemetry before OpenAI billing in auto mode", async () => {
    const profile = await apiCredentialProfilesStorage.createProfile({
      name: "NewAPI Auto",
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      baseUrl: "https://newapi-auto.example.com",
      apiKey: "sk-newapi-auto",
    })

    const fetchMock = vi.fn(async () =>
      jsonResponse({
        success: true,
        message: "",
        data: {
          total_granted: 5000000,
          total_used: 1250000,
          total_available: 3750000,
        },
      }),
    )
    vi.stubGlobal("fetch", fetchMock)

    const snapshot = await refreshApiCredentialProfileTelemetry(profile.id)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      "https://newapi-auto.example.com/api/usage/token/",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Authorization: "Bearer sk-newapi-auto",
        }),
      }),
    )
    expect(snapshot.source).toBe("newApiTokenUsage")
    expect(snapshot.facts?.usage?.totalAvailable).toEqual(
      expect.objectContaining({ value: 7.5 }),
    )
    expect(snapshot.facts?.usage?.totalUsed).toEqual(
      expect.objectContaining({ value: 2.5 }),
    )
    expect(snapshot.attempts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "newApiTokenUsage",
          status: "success",
        }),
      ]),
    )
  })

  it("preserves total usage when huge OpenAI billing hard limits are sentinel values", async () => {
    const profile = await apiCredentialProfilesStorage.createProfile({
      name: "Gateway",
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      baseUrl: "https://gateway.example.com",
      apiKey: "sk-gateway",
      telemetryConfig: { mode: "openaiBilling" },
    })

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          object: "billing_subscription",
          has_payment_method: true,
          soft_limit_usd: 100000000,
          hard_limit_usd: 100000000,
          system_hard_limit_usd: 100000000,
          access_until: 0,
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          object: "list",
          total_usage: 188.131,
        }),
      )
    vi.stubGlobal("fetch", fetchMock)

    const snapshot = await refreshApiCredentialProfileTelemetry(profile.id)

    expect(snapshot.source).toBe("openaiBilling")
    expect(snapshot.facts?.balances).toBeUndefined()
    expect(snapshot.facts?.usage?.totalGranted).toBeUndefined()
    expect(snapshot.facts?.usage?.totalUsed).toEqual(
      expect.objectContaining({ value: 1.88131 }),
    )
    expect(snapshot.attempts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "openaiBilling",
          status: "success",
        }),
      ]),
    )
  })

  it("skips credentialed network calls when telemetry is disabled", async () => {
    const profile = await apiCredentialProfilesStorage.createProfile({
      name: "Disabled",
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      baseUrl: "https://disabled.example.com",
      apiKey: "sk-disabled",
      telemetryConfig: { mode: "disabled" },
    })
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)

    const snapshot = await refreshApiCredentialProfileTelemetry(profile.id)

    expect(fetchApiCredentialModelIdsMock).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(snapshot).toEqual(
      expect.objectContaining({
        attempts: [],
        health: { status: SiteHealthStatus.Warning },
      }),
    )
  })

  it("accepts custom total-only telemetry as a successful refresh", async () => {
    const profile = await apiCredentialProfilesStorage.createProfile({
      name: "Custom Totals",
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      baseUrl: "https://custom-total.example.com",
      apiKey: "sk-custom-total",
      telemetryConfig: {
        mode: "customReadOnlyEndpoint",
        customEndpoint: {
          endpoint: "/usage/totals",
          jsonPaths: {
            expiresAt: "data.expiresAt",
            totalUsedUsd: "data.total.used",
          },
        },
      },
    })

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          data: {
            expiresAt: 1776556800,
            total: { used: 8.75 },
          },
        }),
      ),
    )

    const snapshot = await refreshApiCredentialProfileTelemetry(profile.id)

    expect(snapshot).toEqual(
      expect.objectContaining({
        source: "customReadOnlyEndpoint",
        facts: expect.objectContaining({
          usage: {
            expiresAt: 1776556800000,
            totalUsed: expect.objectContaining({ value: 8.75 }),
          },
        }),
      }),
    )
    expect(snapshot.attempts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          endpoint: "/usage/totals",
          source: "customReadOnlyEndpoint",
          status: "success",
        }),
      ]),
    )
  })

  it("resolves root-relative custom telemetry endpoints from the profile origin", async () => {
    const profile = await apiCredentialProfilesStorage.createProfile({
      name: "Custom Subpath",
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      baseUrl: "https://custom-subpath.example.com/api/agents",
      apiKey: "sk-custom-subpath",
      telemetryConfig: {
        mode: "customReadOnlyEndpoint",
        customEndpoint: {
          endpoint: "/api/telemetry/usage",
          jsonPaths: {
            balanceUsd: "balance",
          },
        },
      },
    })
    const fetchMock = vi.fn(async () => jsonResponse({ balance: 6.25 }))
    vi.stubGlobal("fetch", fetchMock)

    await refreshApiCredentialProfileTelemetry(profile.id)

    expect(fetchMock).toHaveBeenCalledWith(
      "https://custom-subpath.example.com/api/telemetry/usage",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer sk-custom-subpath",
        }),
      }),
    )
  })

  it("uses a dedicated bearer token for a cross-origin custom telemetry URL", async () => {
    const profile = await apiCredentialProfilesStorage.createProfile({
      name: "Custom Bearer",
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      baseUrl: "https://custom-bearer.example.com/api/agents",
      apiKey: "sk-custom-bearer",
      telemetryConfig: {
        mode: "customReadOnlyEndpoint",
        customEndpoint: {
          endpoint:
            "https://telemetry.example.com/api/telemetry/usage?period=today",
          bearerToken: "dedicated-telemetry-token",
          jsonPaths: {
            balanceUsd: "balance",
          },
        },
      },
    })
    const fetchMock = vi.fn(async () => jsonResponse({ balance: 7.5 }))
    vi.stubGlobal("fetch", fetchMock)

    await refreshApiCredentialProfileTelemetry(profile.id)

    expect(fetchMock).toHaveBeenCalledWith(
      "https://telemetry.example.com/api/telemetry/usage?period=today",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer dedicated-telemetry-token",
        }),
      }),
    )
  })

  it("omits authentication for a cross-origin custom telemetry URL when no dedicated token is set", async () => {
    const profile = await apiCredentialProfilesStorage.createProfile({
      name: "Custom Cross-Origin Anonymous",
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      baseUrl: "https://api.example.com/v1/models",
      apiKey: "sk-cross-origin-profile",
      telemetryConfig: {
        mode: "customReadOnlyEndpoint",
        customEndpoint: {
          endpoint: "https://telemetry.example.com/usage",
          jsonPaths: {
            balanceUsd: "balance",
          },
        },
      },
    })
    const fetchMock = vi.fn(async () => jsonResponse({ balance: 8.5 }))
    vi.stubGlobal("fetch", fetchMock)

    await refreshApiCredentialProfileTelemetry(profile.id)

    expect(fetchMock).toHaveBeenCalledWith(
      "https://telemetry.example.com/usage",
      expect.objectContaining({
        headers: expect.not.objectContaining({
          Authorization: expect.any(String),
        }),
      }),
    )
  })

  it("redacts custom endpoint query values before persisting attempts", async () => {
    const profile = await apiCredentialProfilesStorage.createProfile({
      name: "Custom Query",
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      baseUrl: "https://custom-query.example.com",
      apiKey: "sk-custom-query",
      telemetryConfig: {
        mode: "customReadOnlyEndpoint",
        customEndpoint: {
          endpoint: "/usage?token=sk-custom-query&cursor=secret-cursor",
          jsonPaths: {
            balanceUsd: "balance",
          },
        },
      },
    })

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ balance: 4.5 })),
    )

    const snapshot = await refreshApiCredentialProfileTelemetry(profile.id)
    const customAttempt = snapshot.attempts.find(
      (attempt) => attempt.source === "customReadOnlyEndpoint",
    )

    expect(customAttempt?.endpoint).toContain("/usage?")
    expect(customAttempt?.endpoint).not.toContain("sk-custom-query")
    expect(customAttempt?.endpoint).not.toContain("secret-cursor")
    expect(customAttempt?.endpoint).toContain("REDACTED")
  })

  it("redacts the dedicated bearer token from custom telemetry errors", async () => {
    const apiKey = "shared-telemetry-secret"
    const dedicatedBearerToken = `${apiKey}-private-tail`
    const profile = await apiCredentialProfilesStorage.createProfile({
      name: "Custom Error Redaction",
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      baseUrl: "https://custom-error.example.com",
      apiKey,
      telemetryConfig: {
        mode: "customReadOnlyEndpoint",
        customEndpoint: {
          endpoint: "/usage",
          bearerToken: dedicatedBearerToken,
          jsonPaths: {
            balanceUsd: "balance",
          },
        },
      },
    })
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(
          { message: `Authorization: Bearer ${dedicatedBearerToken}` },
          401,
        ),
      ),
    )

    const snapshot = await refreshApiCredentialProfileTelemetry(profile.id)
    const serializedSnapshot = JSON.stringify(snapshot)

    expect(serializedSnapshot).not.toContain(dedicatedBearerToken)
    expect(serializedSnapshot).not.toContain("private-tail")
    expect(serializedSnapshot).toContain("[REDACTED]")
  })

  it("prefers the custom configuration error when malformed custom endpoints are dropped during coercion", async () => {
    const profile = await apiCredentialProfilesStorage.createProfile({
      name: "Malformed Custom Endpoint",
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      baseUrl: "https://custom-malformed.example.com",
      apiKey: "sk-malformed",
      telemetryConfig: {
        mode: "customReadOnlyEndpoint",
        customEndpoint: {
          endpoint: "http://%",
          jsonPaths: {
            balanceUsd: "balance",
          },
        },
      },
    })

    fetchApiCredentialModelIdsMock.mockRejectedValueOnce(
      new Error("models failed"),
    )
    vi.stubGlobal("fetch", vi.fn())

    const snapshot = await refreshApiCredentialProfileTelemetry(profile.id)

    expect(snapshot.health).toEqual({ status: SiteHealthStatus.Warning })
    expect(snapshot.lastError).toBe("Custom endpoint is not configured")
    expect(snapshot.attempts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          endpoint: "/custom",
          message: "Custom endpoint is not configured",
          source: "customReadOnlyEndpoint",
          status: "error",
        }),
      ]),
    )
  })

  it("prefers an absolute custom endpoint error when model discovery also fails", async () => {
    const profile = await apiCredentialProfilesStorage.createProfile({
      name: "Absolute Custom Error",
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      baseUrl: "https://api.example.com/v1",
      apiKey: "sk-absolute-custom-error",
      telemetryConfig: {
        mode: "customReadOnlyEndpoint",
        customEndpoint: {
          endpoint: "https://telemetry.example.com/usage",
          bearerToken: "dedicated-token",
          jsonPaths: {
            balanceUsd: "balance",
          },
        },
      },
    })

    fetchApiCredentialModelIdsMock.mockRejectedValueOnce(
      new Error("models failed"),
    )
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ message: "custom failed" }, 500)),
    )

    const snapshot = await refreshApiCredentialProfileTelemetry(profile.id)
    const customAttempt = snapshot.attempts.find(
      (attempt) => attempt.source === "customReadOnlyEndpoint",
    )

    expect(customAttempt).toEqual(
      expect.objectContaining({
        status: "error",
        message: expect.stringContaining("custom failed"),
      }),
    )
    expect(snapshot.lastError).toBe(customAttempt?.message)
  })

  it("records empty model discovery as unsupported", async () => {
    const profile = await apiCredentialProfilesStorage.createProfile({
      name: "Empty Model Catalog",
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      baseUrl: "https://empty-models.example.invalid",
      apiKey: "sk-empty-models",
      telemetryConfig: { mode: "newApiTokenUsage" },
    })
    fetchApiCredentialModelIdsMock.mockResolvedValueOnce([])
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          data: {
            total_granted: 10,
            total_used: 4,
            total_available: 6,
          },
        }),
      ),
    )

    const snapshot = await refreshApiCredentialProfileTelemetry(profile.id)

    expect(snapshot.facts?.models).toEqual({ count: 0, preview: [] })
    expect(snapshot.attempts).toContainEqual(
      expect.objectContaining({
        source: "models",
        status: "unsupported",
        message: "No models returned",
      }),
    )
  })
})
