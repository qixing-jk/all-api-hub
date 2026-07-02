import { http, HttpResponse } from "msw"
import { beforeEach, describe, expect, it } from "vitest"

import { UI_CONSTANTS } from "~/constants/ui"
import {
  fetchAccountData,
  fetchCodexServiceCredential,
  fetchCodexServiceModels,
  fetchUserInfo,
  rotateCodexServiceCredential,
} from "~/services/apiService/sharedchat"
import { AuthTypeEnum } from "~/types"
import { sharedChatCodexQuotaSample } from "~~/tests/fixtures/sharedchat/codexQuota.sample"
import { server } from "~~/tests/msw/server"

const baseRequest = {
  baseUrl: "https://new.sharedchat.cc",
  auth: {
    authType: AuthTypeEnum.Cookie,
    userId: "12672",
    accessToken: "user-token-redacted",
  },
}

const accountRequest = {
  ...baseRequest,
  checkIn: {
    enableDetection: false,
  },
}

describe("apiService SharedChat", () => {
  beforeEach(() => {
    server.resetHandlers()
  })

  it("fetches the logged-in user from the frontend getme endpoint", async () => {
    server.use(
      http.get("https://new.sharedchat.cc/frontend-api/getme", () =>
        HttpResponse.json({
          code: 1,
          msg: "success",
          data: {
            id: "12672",
            name: "Example User",
            email: "user@example.invalid",
            userToken: "user-token-redacted",
          },
        }),
      ),
    )

    await expect(fetchUserInfo(baseRequest)).resolves.toEqual({
      id: "12672",
      username: "Example User",
      access_token: "user-token-redacted",
      user: expect.objectContaining({
        id: "12672",
        username: "Example User",
        access_token: "user-token-redacted",
      }),
    })
  })

  it("maps codex quota into AccountData product usage and subscription fields", async () => {
    server.use(
      http.get("https://new.sharedchat.cc/frontend-api/vibe-code/quota", () =>
        HttpResponse.json(sharedChatCodexQuotaSample),
      ),
    )

    await expect(fetchAccountData(accountRequest)).resolves.toMatchObject({
      quota: 88 * UI_CONSTANTS.EXCHANGE_RATE.CONVERSION_FACTOR,
      today_requests_count: 10,
      today_prompt_tokens: 0,
      today_completion_tokens: 12345,
      today_quota_consumption:
        1.23 * UI_CONSTANTS.EXCHANGE_RATE.CONVERSION_FACTOR,
      today_income: 0,
      usage: {
        scope: "rolling_window",
        totalRequests: 10,
        totalTokens: 12345,
        totalCost: 1.23,
        lastRequestTime: "2026-07-01T12:34:56+08:00",
      },
      subscription: {
        billingType: "amount",
        limit: 100,
        amountLimit: 100,
        usedAmount: 12,
        remainingAmount: 88,
        usedCount: 3,
        remainingCount: 97,
        period: "month",
        periodResetTime: "2026-08-01T00:00:00+08:00",
        expireTime: "2026-09-01T00:00:00+08:00",
        isLongTerm: false,
        isActive: true,
      },
      recentUsageRecords: [
        {
          requestTime: "2026-07-01T12:34:56+08:00",
          model: "gpt-5-example",
          inputTokens: 100,
          outputTokens: 200,
          cacheCreationTokens: 3,
          cacheReadTokens: 4,
          cacheInputTokens: 5,
          reasoningTokens: 6,
          totalTokens: 318,
          responseTime: 1234,
          firstByteTime: 456,
          cost: 0.01,
          errorMessage: "",
          status: "success",
        },
      ],
      checkIn: {
        enableDetection: false,
        siteStatus: {
          isCheckedInToday: undefined,
        },
      },
    })
  })

  it("fetches the singleton Codex service credential without using token CRUD", async () => {
    server.use(
      http.get("https://new.sharedchat.cc/frontend-api/vibe-code/quota", () =>
        HttpResponse.json(sharedChatCodexQuotaSample),
      ),
    )

    await expect(fetchCodexServiceCredential(baseRequest)).resolves.toEqual({
      kind: "singleton_service_key",
      service: "codex",
      label: "Codex",
      key: "sk-redacted",
      isAuthenticated: true,
      baseUrl: "https://new.sharedchat.cc/codex",
    })
  })

  it("fetches Codex service models through the OpenAI-compatible model list", async () => {
    server.use(
      http.get("https://new.sharedchat.cc/codex/v1/models", ({ request }) => {
        expect(request.headers.get("Authorization")).toBe("Bearer sk-redacted")
        return HttpResponse.json({
          object: "list",
          success: true,
          data: [
            {
              id: "gpt-5.5",
              object: "model",
              owned_by: "openai",
            },
            {
              id: " gpt-5.4-mini ",
              object: "model",
              owned_by: "openai",
            },
          ],
        })
      }),
    )

    await expect(
      fetchCodexServiceModels({
        ...baseRequest,
        auth: {
          authType: AuthTypeEnum.AccessToken,
          apiKey: "sk-redacted",
        },
      }),
    ).resolves.toEqual(["gpt-5.5", " gpt-5.4-mini "])
  })

  it("rotates the singleton Codex service credential with the codex subtype", async () => {
    let capturedBody: unknown
    server.use(
      http.post(
        "https://new.sharedchat.cc/frontend-api/vibe-code/reset-key",
        async ({ request }) => {
          capturedBody = await request.json()
          return HttpResponse.json({
            code: 1,
            msg: "success",
            data: {
              newKey: "sk-rotated-redacted",
            },
          })
        },
      ),
    )

    await expect(rotateCodexServiceCredential(baseRequest)).resolves.toEqual({
      kind: "singleton_service_key",
      service: "codex",
      label: "Codex",
      key: "sk-rotated-redacted",
      isAuthenticated: true,
      baseUrl: "https://new.sharedchat.cc/codex",
    })
    expect(capturedBody).toEqual({ subtype: "codex" })
  })
})
