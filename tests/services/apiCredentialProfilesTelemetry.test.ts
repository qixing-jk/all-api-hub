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
        balance: {
          amount: 12.34,
          currency: "CNY",
          grantedAmount: 2,
          toppedUpAmount: 10.34,
          isAvailable: true,
        },
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
          reason: "Provider account is unavailable",
        },
        source: "deepSeekBalance",
        balance: {
          amount: 0,
          currency: "CNY",
          isAvailable: false,
        },
      }),
    )
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
        balanceUsd: 7.5,
        totalUsedUsd: 2.5,
        totalGrantedUsd: 10,
        totalAvailableUsd: 7.5,
        models: { count: 2, preview: ["gpt-4o", "o3"] },
      }),
    )

    await expect(
      apiCredentialProfilesStorage.getProfileById(profile.id),
    ).resolves.toEqual(
      expect.objectContaining({
        telemetrySnapshot: expect.objectContaining({
          balanceUsd: 7.5,
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
        unlimitedQuota: true,
        totalUsedUsd: 1.88131,
      }),
    )
    expect(snapshot.balanceUsd).toBeUndefined()
    expect(snapshot.totalGrantedUsd).toBeUndefined()
    expect(snapshot.totalAvailableUsd).toBeUndefined()

    await expect(
      apiCredentialProfilesStorage.getProfileById(profile.id),
    ).resolves.toEqual(
      expect.objectContaining({
        telemetrySnapshot: expect.objectContaining({
          unlimitedQuota: true,
          totalUsedUsd: 1.88131,
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
        balanceUsd: 0,
        totalAvailableUsd: 0,
        totalGrantedUsd: 2,
        totalUsedUsd: 2.5,
      }),
    )
    expect(snapshot.unlimitedQuota).toBeUndefined()
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
    expect(snapshot.balanceUsd).toBe(12)
    expect(snapshot.todayCostUsd).toBe(1.25)
    expect(snapshot.todayRequests).toBe(3)
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
    expect(snapshot.balanceUsd).toBe(7.5)
    expect(snapshot.totalUsedUsd).toBe(2.5)
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
    expect(snapshot.balanceUsd).toBeUndefined()
    expect(snapshot.totalGrantedUsd).toBeUndefined()
    expect(snapshot.totalUsedUsd).toBe(1.88131)
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
        health: {
          reason: "No supported telemetry endpoint returned data",
          status: SiteHealthStatus.Warning,
        },
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
        expiresAt: 1776556800000,
        source: "customReadOnlyEndpoint",
        totalUsedUsd: 8.75,
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

    expect(snapshot.health).toEqual({
      reason: "Custom endpoint is not configured",
      status: SiteHealthStatus.Warning,
    })
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

    expect(snapshot.models).toEqual({ count: 0, preview: [] })
    expect(snapshot.attempts).toContainEqual(
      expect.objectContaining({
        source: "models",
        status: "unsupported",
        message: "No models returned",
      }),
    )
  })
})
