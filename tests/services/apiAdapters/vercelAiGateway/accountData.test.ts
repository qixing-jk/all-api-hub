import { http, HttpResponse } from "msw"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { QUOTA_PER_USD } from "~/constants/money"
import { SITE_TYPES } from "~/constants/siteType"
import { AutoDetectCompletionError } from "~/services/accounts/autoDetectCompletion/types"
import { vercelAiGatewayCapabilities } from "~/services/apiAdapters/vercelAiGateway"
import {
  fetchAccountData,
  refreshAccountData,
} from "~/services/apiService/vercelAiGateway"
import { pricingPlanSchema } from "~/services/modelPricing/pricingPlan"
import { AuthTypeEnum, SiteHealthStatus } from "~/types"
import { server } from "~~/tests/msw/server"
import { buildCheckInConfig } from "~~/tests/test-utils/checkIn"

const TEAM_ID = "team_test"
const request = {
  baseUrl: "https://vercel.com",
  accountId: "acc-vercel",
  auth: {
    authType: AuthTypeEnum.AccessToken,
    userId: TEAM_ID,
    accessToken: "vercel-access-token",
  },
  checkIn: buildCheckInConfig(),
} as const

const creditsHandler = (balance: string, totalUsed: string) =>
  http.get("https://ai-gateway.vercel.sh/v1/credits", () =>
    HttpResponse.json({ balance, total_used: totalUsed }),
  )

describe("Vercel AI Gateway account data", () => {
  beforeEach(() => server.resetHandlers())
  afterEach(() => server.resetHandlers())

  it("validates the chosen team against the submitted credential before saving", async () => {
    server.use(
      http.get("https://api.vercel.com/v2/teams", () =>
        HttpResponse.json({ teams: [{ id: TEAM_ID, slug: "chosen" }] }),
      ),
    )
    const persistence = vercelAiGatewayCapabilities.account!.persistence!
    expect(
      await persistence.prepareIdentity({
        accessToken: "pat",
        userId: TEAM_ID,
      }),
    ).toBe(TEAM_ID)
    await expect(
      persistence.prepareIdentity({
        accessToken: "pat",
        userId: "team_inaccessible",
      }),
    ).rejects.toBeDefined()
  })

  it("uses native image, character, audio and video units instead of quoting them as tokens", async () => {
    server.use(
      http.get("https://ai-gateway.vercel.sh/v1/models", () =>
        HttpResponse.json({
          data: [
            { id: "image", type: "image", pricing: { image: "0.08" } },
            {
              id: "speech",
              type: "speech",
              pricing: {
                input: "0.00001",
                speech_input_character_cost: "0.00001",
              },
            },
            {
              id: "transcription",
              type: "transcription",
              pricing: {
                input: "0.0000000001",
                transcription_duration_cost_per_second: "0.0001",
              },
            },
            {
              id: "video",
              type: "video",
              pricing: {
                video_duration_pricing: [
                  { resolution: "720p", cost_per_second: "0.1" },
                  { resolution: "1080p", cost_per_second: "0.15" },
                ],
              },
            },
          ],
          request_context_availability: {
            http: {
              status: "unavailable",
              reason: "customer_verification_required",
            },
          },
        }),
      ),
    )
    const snapshot =
      await vercelAiGatewayCapabilities.account!.modelPricing!.fetchPricing(
        request,
      )
    expect(snapshot.data[0]?.pricingPlan?.rates.outputImage).toMatchObject({
      amount: 0.08,
      unit: "image",
      per: 1,
    })
    expect(snapshot.data[1]?.pricingPlan?.rates.characters).toMatchObject({
      amount: 0.00001,
      unit: "character",
      per: 1,
    })
    expect(snapshot.data[1]?.token_price_usd_per_million).toBeUndefined()
    expect(snapshot.data[2]?.pricingPlan?.rates.audio).toMatchObject({
      amount: 0.0001,
      unit: "second",
    })
    expect(snapshot.data[3]?.pricingPlan?.rules).toHaveLength(2)
    for (const row of snapshot.data)
      expect(pricingPlanSchema.safeParse(row.pricingPlan).success).toBe(true)
    expect(snapshot.data[0]?.availability).toMatchObject({
      available: false,
      reason: "customer_verification_required",
    })
  })

  it("retains image input-token charges alongside per-image output prices", async () => {
    server.use(
      http.get("https://ai-gateway.vercel.sh/v1/models", () =>
        HttpResponse.json({
          data: [
            {
              id: "image",
              type: "image",
              pricing: { input: "0.000000003", image: "0.035" },
            },
          ],
        }),
      ),
    )
    const snapshot =
      await vercelAiGatewayCapabilities.account!.modelPricing!.fetchPricing(
        request,
      )
    expect(snapshot.data[0]?.pricingPlan?.rates.input).toMatchObject({
      amount: 0.000000003,
      unit: "token",
    })
  })

  it("does not apply an HTTP restriction to a realtime-only model", async () => {
    server.use(
      http.get("https://ai-gateway.vercel.sh/v1/models", () =>
        HttpResponse.json({
          data: [
            {
              id: "live",
              type: "realtime",
              model_eligibility: { status: "eligible" },
              pricing: { input: "0.000001" },
            },
          ],
          request_context_availability: {
            http: {
              status: "unavailable",
              reason: "customer_verification_required",
            },
            realtime_websocket: { status: "available" },
          },
        }),
      ),
    )
    const snapshot =
      await vercelAiGatewayCapabilities.account!.modelPricing!.fetchPricing(
        request,
      )
    expect(snapshot.data[0]?.availability?.available).toBe(true)
  })

  it("does not label an unadapted image rule as an exact price", async () => {
    server.use(
      http.get("https://ai-gateway.vercel.sh/v1/models", () =>
        HttpResponse.json({
          data: [
            {
              id: "image",
              type: "image",
              pricing: {
                image: "0.1",
                image_dimension_quality_pricing: [
                  { operation: "unknown", cost: "0.02" },
                ],
              },
            },
          ],
        }),
      ),
    )
    const snapshot =
      await vercelAiGatewayCapabilities.account!.modelPricing!.fetchPricing(
        request,
      )
    expect(snapshot.data[0]?.price_metadata?.precision).toBe("unavailable")
    expect(snapshot.data[0]?.pricingPlan?.source.rulesUnavailable).toBe(true)
  })

  it("keeps image quality conditions and refuses to flatten video audio or mode conditions", async () => {
    server.use(
      http.get("https://ai-gateway.vercel.sh/v1/models", () =>
        HttpResponse.json({
          data: [
            {
              id: "image",
              type: "image",
              pricing: {
                image: "0.1",
                image_dimension_quality_pricing: [
                  { size: "2048x2048", quality: "low", cost: "0.06" },
                ],
              },
            },
            {
              id: "video",
              type: "video",
              pricing: {
                video_duration_pricing: [
                  { resolution: "720p", audio: false, cost_per_second: "0.1" },
                  { resolution: "720p", audio: true, cost_per_second: "0.2" },
                ],
              },
            },
          ],
        }),
      ),
    )
    const snapshot =
      await vercelAiGatewayCapabilities.account!.modelPricing!.fetchPricing(
        request,
      )
    expect(snapshot.data[0]?.pricingPlan?.rules[0]?.conditions).toContainEqual({
      kind: "selection",
      axis: "imageQuality",
      value: "low",
    })
    expect(snapshot.data[1]?.pricingPlan?.source.rulesUnavailable).toBe(true)
    expect(snapshot.data[1]?.price_metadata?.precision).toBe("unavailable")
  })

  it("opens the saved team's console routes rather than the current default team's", async () => {
    server.use(
      http.get("https://api.vercel.com/v2/teams", () =>
        HttpResponse.json({
          teams: [
            { id: "other", slug: "other" },
            { id: TEAM_ID, slug: "chosen" },
          ],
        }),
      ),
    )
    const bootstrap = vercelAiGatewayCapabilities.account!.bootstrap!
    const target = {
      baseUrl: "https://vercel.com",
      siteType: SITE_TYPES.VERCEL_AI_GATEWAY,
      userId: TEAM_ID,
      token: "pat",
    }
    expect(await bootstrap.resolveRoutePath(target, "usage")).toBe(
      "/chosen/~/ai-gateway/logs",
    )
    expect(await bootstrap.resolveRoutePath(target, "adminCredentials")).toBe(
      "/chosen/~/ai-gateway/api-keys",
    )
  })

  it("reports the remaining AI Gateway credit as the account balance", async () => {
    server.use(creditsHandler("12.5", "3"))
    const data = await fetchAccountData({ ...request })

    expect(data.quota).toBe(12.5 * QUOTA_PER_USD)
    // Credit is purchased USD, not a token allowance.
    expect(data.nativeBalance).toEqual({
      unit: "USD",
      total: 12.5,
      permanent: 12.5,
      daily: 0,
    })
    // Spend reports are plan-gated, so no today window is published.
    expect(data.todayStatsAvailability?.consumption.status).toBe("unavailable")
    expect(data.today_quota_consumption).toBe(0)
  })

  it("keeps a zero balance distinct from a missing balance", async () => {
    server.use(creditsHandler("0", "0"))
    const data = await fetchAccountData({ ...request })
    expect(data.quota).toBe(0)
    expect(data.nativeBalance).toMatchObject({ unit: "USD", total: 0 })
  })

  it("fails rather than reporting zero when the balance is unreadable", async () => {
    server.use(
      http.get("https://ai-gateway.vercel.sh/v1/credits", () =>
        HttpResponse.json({ balance: "n/a", total_used: "0" }),
      ),
    )
    await expect(fetchAccountData({ ...request })).rejects.toThrow(
      "vercel_credits_unreadable",
    )
  })

  it("requires the saved team before reading credits", async () => {
    await expect(
      fetchAccountData({
        ...request,
        auth: { ...request.auth, userId: undefined },
      }),
    ).rejects.toThrow("vercel_credits_unreadable")
  })

  it("maps a rejected credential to an unhealthy refresh", async () => {
    server.use(
      http.get("https://ai-gateway.vercel.sh/v1/credits", () =>
        HttpResponse.json(
          {
            error: {
              message: "Authentication failed",
              type: "authentication_error",
            },
          },
          { status: 401 },
        ),
      ),
    )
    const result = await refreshAccountData({ ...request })
    expect(result.success).toBe(false)
    expect(result.healthStatus.status).not.toBe(SiteHealthStatus.Healthy)
  })

  it("publishes the model catalog as exact provider prices per million tokens", async () => {
    server.use(
      http.get("https://ai-gateway.vercel.sh/v1/models", () =>
        HttpResponse.json({
          object: "list",
          data: [
            {
              id: "openai/gpt-test",
              name: "GPT Test",
              owned_by: "openai",
              type: "language",
              tags: ["tool-use"],
              context_window: 128000,
              max_tokens: 16384,
              pricing: {
                input: "0.000002",
                output: "0.000012",
                input_cache_read: "0.0000002",
              },
              model_eligibility: { status: "eligible" },
            },
            {
              id: "image/test",
              name: "Image Test",
              owned_by: "openai",
              type: "image",
              pricing: { image: "0.04" },
            },
          ],
        }),
      ),
    )

    const snapshot =
      await vercelAiGatewayCapabilities.account?.modelPricing?.fetchPricing({
        ...request,
      })

    expect(snapshot?.success).toBe(true)
    const [language, image] = snapshot!.data
    expect(language!.model_name).toBe("openai/gpt-test")
    expect(language!.token_price_usd_per_million).toEqual({
      input: 2,
      output: 12,
      cache_read: 0.2,
    })
    expect(language!.price_metadata).toMatchObject({
      source: "provider-catalog",
      precision: "exact",
    })
    expect(language!.availability).toEqual({ available: true })
    expect(language!.supported_endpoint_types).toEqual(["/v1/chat/completions"])

    // Per-image pricing is not a token rate, so no token quote is invented.
    expect(image!.token_price_usd_per_million).toBeUndefined()
    expect(image!.price_metadata).toMatchObject({ precision: "exact" })
    expect(image!.pricingPlan?.rates.outputImage?.unit).toBe("image")
    expect(snapshot!.model_list_source?.provider).toBe(
      SITE_TYPES.VERCEL_AI_GATEWAY,
    )
    expect(snapshot!.model_list_source?.actionPolicy).toMatchObject({
      supportsTokenCompatibility: true,
      supportsCredentialVerification: true,
      supportsBatchCredentialVerification: true,
      supportsCliVerification: true,
    })
  })

  it("completes onboarding with the team identity and the supplied token", async () => {
    server.use(
      http.get("https://api.vercel.com/v2/user", () =>
        HttpResponse.json({
          user: { id: "user_1", username: "someone", defaultTeamId: TEAM_ID },
        }),
      ),
      http.get("https://api.vercel.com/v2/teams", () =>
        HttpResponse.json({
          teams: [{ id: TEAM_ID, slug: "chosen", name: "Chosen Team" }],
        }),
      ),
    )
    const captured: unknown[] = []
    const completed =
      await vercelAiGatewayCapabilities.account?.completion?.complete(
        {
          url: "https://vercel.com",
          requestedAuthType: AuthTypeEnum.AccessToken,
          existingAccessToken: "vercel-access-token",
          detected: { userId: TEAM_ID, siteType: SITE_TYPES.VERCEL_AI_GATEWAY },
          context: {},
        },
        {
          createServiceRequest: ({ baseUrl, auth }) => ({ baseUrl, auth }),
          captureRecoveryData: (data) => captured.push(data),
          createInitialCheckInConfig: () => buildCheckInConfig(),
          fetchSiteName: async () => "Vercel AI Gateway",
          trimString: (value) => String(value ?? "").trim(),
          handleCheckInSupportFetchFailure: () => false,
          createCompletionError: (reason, cause) =>
            new AutoDetectCompletionError(reason, cause),
        },
      )

    expect(completed).toMatchObject({
      // The saved account identity is the team, not the personal user.
      userId: TEAM_ID,
      username: "Chosen Team",
      accessToken: "vercel-access-token",
      authType: AuthTypeEnum.AccessToken,
      siteName: "Vercel AI Gateway",
    })
    expect(captured).toEqual([
      {
        userId: TEAM_ID,
        username: "Chosen Team",
        authType: AuthTypeEnum.AccessToken,
      },
    ])
  })

  it("asks for a token through the guided detour when none was supplied", async () => {
    await expect(
      vercelAiGatewayCapabilities.account?.completion?.complete(
        {
          url: "https://vercel.com",
          requestedAuthType: AuthTypeEnum.AccessToken,
          detected: {
            userId: TEAM_ID,
            siteType: SITE_TYPES.VERCEL_AI_GATEWAY,
          },
          context: {},
        },
        {
          createServiceRequest: ({ baseUrl, auth }) => ({ baseUrl, auth }),
          captureRecoveryData: () => {},
          createInitialCheckInConfig: () => buildCheckInConfig(),
          fetchSiteName: async () => "Vercel AI Gateway",
          trimString: (value) => String(value ?? "").trim(),
          handleCheckInSupportFetchFailure: () => false,
          createCompletionError: (reason, cause) =>
            new AutoDetectCompletionError(reason, cause),
        },
      ),
    ).rejects.toMatchObject({
      reason: "access_token_verification_required",
    })
  })

  it("reports an ineligible model as unavailable with the provider's reason", async () => {
    server.use(
      http.get("https://ai-gateway.vercel.sh/v1/models", () =>
        HttpResponse.json({
          data: [
            {
              id: "openai/gpt-test",
              owned_by: "openai",
              pricing: { input: "0.000002", output: "0.000012" },
              model_eligibility: {
                status: "ineligible",
                category: "configuration",
                reason: "provider_not_allowed",
              },
            },
          ],
        }),
      ),
    )
    const snapshot =
      await vercelAiGatewayCapabilities.account?.modelPricing?.fetchPricing({
        ...request,
      })
    expect(snapshot!.data[0]!.availability).toEqual({
      available: false,
      reason: "provider_not_allowed",
    })
  })
})
