import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  ACCOUNT_TOKEN_FALLBACK_LOAD_FAILED,
  loadAccountTokenFallbackPricingResponse,
} from "~/services/apiCredentialProfiles/modelCatalog"
import { AuthTypeEnum } from "~/types"

const {
  fetchOpenAICompatibleModelIdsMock,
  resolveDisplayAccountTokenForSecretMock,
} = vi.hoisted(() => ({
  fetchOpenAICompatibleModelIdsMock: vi.fn(),
  resolveDisplayAccountTokenForSecretMock: vi.fn(),
}))

vi.mock("~/services/apiService/openaiCompatible", () => ({
  fetchOpenAICompatibleModelIds: (...args: unknown[]) =>
    fetchOpenAICompatibleModelIdsMock(...args),
}))

vi.mock(
  "~/services/accounts/utils/apiServiceRequest",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("~/services/accounts/utils/apiServiceRequest")
      >()

    return {
      ...actual,
      resolveDisplayAccountTokenForSecret: (...args: unknown[]) =>
        resolveDisplayAccountTokenForSecretMock(...args),
    }
  },
)

const ACCOUNT = {
  id: "account-1",
  name: "Example Account",
  username: "tester",
  balance: { USD: 0, CNY: 0 },
  todayConsumption: { USD: 0, CNY: 0 },
  todayIncome: { USD: 0, CNY: 0 },
  todayTokens: { upload: 0, download: 0 },
  health: { status: 1 },
  siteType: "new-api",
  baseUrl: "https://example.com",
  token: "account-token",
  userId: 1,
  authType: AuthTypeEnum.AccessToken,
  checkIn: { enableDetection: false },
} as const

const TOKEN = {
  id: 10,
  user_id: 1,
  key: "sk-masked",
  status: 1,
  name: "Fallback Key",
  created_time: 0,
  accessed_time: 0,
  expired_time: -1,
  remain_quota: 0,
  unlimited_quota: true,
  used_quota: 0,
  models: "",
} as const

describe("loadAccountTokenFallbackPricingResponse", () => {
  beforeEach(() => {
    fetchOpenAICompatibleModelIdsMock.mockReset()
    resolveDisplayAccountTokenForSecretMock.mockReset()
    resolveDisplayAccountTokenForSecretMock.mockImplementation(
      async (_account, token) => token,
    )
  })

  it("merges token-declared and upstream model ids into a normalized catalog", async () => {
    resolveDisplayAccountTokenForSecretMock.mockResolvedValueOnce({
      ...TOKEN,
      key: "sk-real-secret",
      models: "gpt-4o-mini, claude-3-haiku",
    })
    fetchOpenAICompatibleModelIdsMock.mockResolvedValueOnce([
      "gpt-4o",
      " gpt-4o-mini ",
      "gpt-4o",
    ])

    const result = await loadAccountTokenFallbackPricingResponse({
      account: ACCOUNT,
      token: {
        ...TOKEN,
        models: "gpt-4o-mini, claude-3-haiku",
      },
    })

    expect(fetchOpenAICompatibleModelIdsMock).toHaveBeenCalledWith({
      baseUrl: "https://example.com",
      apiKey: "sk-real-secret",
    })
    expect(result.data.map((item) => item.model_name)).toEqual([
      "gpt-4o-mini",
      "claude-3-haiku",
      "gpt-4o",
    ])
  })

  it("falls back to token-declared models when the upstream key lookup fails", async () => {
    resolveDisplayAccountTokenForSecretMock.mockResolvedValueOnce({
      ...TOKEN,
      key: "sk-real-secret",
      models: "gpt-4o-mini",
    })
    fetchOpenAICompatibleModelIdsMock.mockRejectedValueOnce(
      new Error("temporary upstream failure"),
    )

    const result = await loadAccountTokenFallbackPricingResponse({
      account: ACCOUNT,
      token: {
        ...TOKEN,
        models: "gpt-4o-mini",
      },
    })

    expect(result.data.map((item) => item.model_name)).toEqual(["gpt-4o-mini"])
  })

  it("redacts the resolved key and base URL when fallback loading fails", async () => {
    resolveDisplayAccountTokenForSecretMock.mockResolvedValueOnce({
      ...TOKEN,
      key: "sk-real-secret",
    })
    fetchOpenAICompatibleModelIdsMock.mockRejectedValueOnce(
      new Error("401 for sk-real-secret at https://example.com/v1/models"),
    )

    let caughtError: unknown

    try {
      await loadAccountTokenFallbackPricingResponse({
        account: ACCOUNT,
        token: {
          ...TOKEN,
          models: "",
        },
      })
    } catch (error) {
      caughtError = error
    }

    expect(caughtError).toBeInstanceOf(Error)

    const message = caughtError instanceof Error ? caughtError.message : ""
    expect(message).not.toContain("sk-real-secret")
    expect(message).not.toContain("https://example.com")
    expect(message.length).toBeGreaterThan(0)
    expect(message).not.toBe(ACCOUNT_TOKEN_FALLBACK_LOAD_FAILED)
  })
})
