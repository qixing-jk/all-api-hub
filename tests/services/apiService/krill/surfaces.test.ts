import { http, HttpResponse } from "msw"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  fetchKrillAnnouncementItems,
  fetchKrillInviteLink,
  fetchKrillModelIds,
  fetchKrillModelPricing,
  redeemKrillCode,
} from "~/services/apiService/krill"
import { AuthTypeEnum } from "~/types"
import { server } from "~~/tests/msw/server"
import { installCookieTransport } from "~~/tests/test-utils/cookieTransport"

const origin = "https://www.krill-code.com"
const request = {
  baseUrl: origin,
  auth: { authType: AuthTypeEnum.Cookie, userId: "47044" },
}

describe("Krill AI console surfaces", () => {
  let browserBoundary: ReturnType<typeof installCookieTransport>
  beforeEach(() => {
    server.use(
      http.get(`${origin}/api/auth/me`, () =>
        HttpResponse.json({
          success: true,
          code: 0,
          data: {
            id: 47044,
            email: "kai@example.com",
            credit_balance_usd: "12.500000",
            enterprise_memberships: [],
          },
        }),
      ),
    )
    browserBoundary = installCookieTransport()
    browserBoundary.cookies.mockResolvedValue([
      {
        name: "krill_jwt",
        value: "console-session",
        domain: "www.krill-code.com",
        path: "/",
        secure: true,
        httpOnly: false,
        hostOnly: true,
        session: false,
        sameSite: "lax",
        storeId: "0",
        firstPartyDomain: "",
        expirationDate: Date.now() / 1000 + 3600,
      },
    ])
  })
  afterEach(() => vi.restoreAllMocks())

  it("refuses redemption when the browser is signed into another account", async () => {
    let submitted = false
    server.use(
      http.get(`${origin}/api/auth/me`, () =>
        HttpResponse.json({
          success: true,
          data: {
            id: 99999,
            email: "other@example.com",
            credit_balance_usd: "0",
            enterprise_memberships: [],
          },
        }),
      ),
      http.post(`${origin}/api/redeem`, () => {
        submitted = true
        return HttpResponse.json({
          success: true,
          data: { code_type: "quota" },
        })
      }),
    )
    await expect(
      redeemKrillCode(request as never, "unused-code"),
    ).rejects.toMatchObject({ code: "ACCOUNT_IDENTITY_MISMATCH" })
    expect(submitted).toBe(false)
  })

  it("builds the native registration link from the invite code", async () => {
    server.use(
      http.get(`${origin}/api/invite/me`, () =>
        HttpResponse.json({
          success: true,
          code: 0,
          data: { invite_code: "4JRUGQ40DN" },
        }),
      ),
    )
    await expect(fetchKrillInviteLink(request as never)).resolves.toBe(
      "https://www.krill-code.com/register?invite=4JRUGQ40DN",
    )
  })

  it("reads public announcements without borrowing the account Cookie", async () => {
    let sentAuth: string | null = null
    server.use(
      http.get(`${origin}/api/public/announcements`, ({ request }) => {
        sentAuth = request.headers.get("authorization")
        return HttpResponse.json({
          success: true,
          code: 0,
          data: {
            items: [
              {
                id: 140,
                title: "Channel incident",
                content: "<p>Switch models for now</p>",
                summary: "Switch models for now",
                created_at: "2026-10-14T06:54:50Z",
                updated_at: "2026-10-14T06:57:20Z",
              },
              {
                id: 139,
                title: "",
                content: "",
                summary: "",
                created_at: "not-a-date",
                updated_at: "",
              },
            ],
          },
        })
      }),
    )
    const items = await fetchKrillAnnouncementItems(request as never)

    expect(sentAuth).toBeNull()
    expect(items).toEqual([
      {
        id: "140",
        title: "Channel incident",
        content: "<p>Switch models for now</p>",
        summary: "Switch models for now",
        createdAt: Date.parse("2026-10-14T06:54:50Z"),
      },
    ])
  })

  it("redeems a console code and reports no invented credit amount", async () => {
    let sent: unknown = null
    server.use(
      http.post(`${origin}/api/redeem`, async ({ request }) => {
        sent = await request.json()
        return HttpResponse.json({
          success: true,
          code: 0,
          data: { code_type: "quota" },
        })
      }),
    )
    await expect(
      redeemKrillCode(request as never, " ABC-123 "),
    ).resolves.toBeUndefined()
    expect(sent).toEqual({ code: "ABC-123" })
  })

  it("reads the account's own model ids", async () => {
    server.use(
      http.get(`${origin}/api/models`, () =>
        HttpResponse.json({
          success: true,
          code: 0,
          data: ["claude-opus-5", "gpt-6-sol"],
        }),
      ),
    )
    await expect(fetchKrillModelIds(request as never)).resolves.toEqual([
      "claude-opus-5",
      "gpt-6-sol",
    ])
  })

  it("maps USD per million token prices and marks route multipliers as unapplied", async () => {
    server.use(
      http.get(`${origin}/api/model-pricing`, () =>
        HttpResponse.json({
          success: true,
          code: 0,
          data: [
            {
              model_name: "claude-opus-5",
              provider: "Claude",
              model_type: "text",
              billing_mode: "token",
              input_token_price: "15.0000000000",
              cache_read_input_token_price: "1.5000000000",
              cache_creation_token_price: "18.7500000000",
              output_token_price: "75.0000000000",
              request_price_usd: "0",
              context_window: 1000000,
              max_output_tokens: 128000,
              modalities: "text,image",
              enabled: true,
              route_multipliers: { cdn: "0.9500000000" },
            },
            {
              model_name: "image-once",
              provider: "Grok",
              model_type: "image",
              billing_mode: "request",
              input_token_price: "0",
              cache_read_input_token_price: "0",
              cache_creation_token_price: "0",
              output_token_price: "0",
              request_price_usd: "0.0100000000",
              enabled: true,
            },
          ],
        }),
      ),
    )
    const pricing = await fetchKrillModelPricing(request as never)

    expect(pricing).toHaveLength(2)
    expect(pricing[0]).toMatchObject({
      model_name: "claude-opus-5",
      provider: "Claude",
      enabled: true,
      billingMode: "token",
      input: 15,
      output: 75,
      cacheRead: 1.5,
      cacheWrite: 18.75,
      requestUsd: 0,
      contextWindow: 1000000,
      routeMultipliers: { cdn: 0.95 },
    })
    expect(pricing[1]).toMatchObject({
      billingMode: "request",
      requestUsd: 0.01,
      contextWindow: null,
      routeMultipliers: {},
    })
  })
})
