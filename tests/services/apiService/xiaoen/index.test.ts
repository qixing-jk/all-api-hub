import { http, HttpResponse } from "msw"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { getSiteTypeCapabilities } from "~/services/apiAdapters/registry"
import { performCheckIn } from "~/services/apiService/xiaoen/checkIn"
import { xiaoenProvider } from "~/services/checkin/autoCheckin/providers/xiaoen"
import { loadAccountCatalogSource } from "~/services/modelCatalog/loader"
import { AuthTypeEnum } from "~/types"
import { server } from "~~/tests/msw/server"
import { installCookieTransport } from "~~/tests/test-utils/cookieTransport"
import { buildDisplaySiteData } from "~~/tests/test-utils/factories"

import { createCheckInConfig } from "../../apiAdapters/checkInFixtures"

const origin = "https://free.supxh.xin"
const user = {
  id: "sample-account",
  username: "sample",
  quota: 36000,
  permanentQuota: 34000,
  dailyQuota: 2000,
  hasSignedInToday: true,
  isVip: false,
  vipExpiresAt: null,
  apiKey: "sk-test-service-key",
  apiBaseUrl: "https://speed27.toter.me",
  inviteCode: "CODE",
}
const request = {
  baseUrl: origin,
  auth: { authType: AuthTypeEnum.Cookie, userId: user.id },
}

describe("肖恩 AI console", () => {
  it("limits the actual account Model List loader to runtime-visible models, retaining missing-price models", async () => {
    server.use(
      http.get("https://speed27.toter.me/v1/models", ({ request: native }) => {
        expect(native.headers.get("authorization")).toBe(
          "Bearer sk-test-service-key",
        )
        return HttpResponse.json({
          data: [{ id: "visible-model" }, { id: "unpriced-model" }],
        })
      }),
      http.get(`${origin}/api/models/pricing`, () =>
        HttpResponse.json({
          success: true,
          data: {
            models: [
              {
                name: "visible-model",
                priceLabel: "300 额度/1K tokens",
                priceType: "token",
              },
              {
                name: "locked-model",
                priceLabel: "900 额度/次",
                priceType: "call",
              },
            ],
          },
        }),
      ),
    )
    const result = await loadAccountCatalogSource({
      account: buildDisplaySiteData({
        id: "xiaoen-loader",
        siteType: "xiaoen",
        baseUrl: origin,
        authType: AuthTypeEnum.Cookie,
        userId: user.id,
        token: "",
      }),
      loadScope: {},
    })
    const data = result.contexts[0]!.pricing.data
    expect(data.map((model) => model.model_name)).toEqual([
      "visible-model",
      "unpriced-model",
    ])
    expect(data[0]).toMatchObject({
      model_description: "300 额度/1K tokens",
      price_metadata: { precision: "unavailable" },
    })
    expect(data[1]).toMatchObject({
      price_metadata: { precision: "unavailable" },
    })
  })
  it("rejects another console origin and token auth without borrowing Cookie sessions", async () => {
    const capability = getSiteTypeCapabilities("xiaoen").account!.bootstrap!
    await expect(
      capability.fetchUserInfo({ ...request, baseUrl: "https://go.toter.me" }),
    ).rejects.toMatchObject({ code: "FEATURE_UNSUPPORTED" })
    await expect(
      capability.fetchUserInfo({
        ...request,
        auth: {
          ...request.auth,
          authType: AuthTypeEnum.AccessToken,
          accessToken: user.apiKey,
        },
      }),
    ).rejects.toMatchObject({ code: "FEATURE_UNSUPPORTED" })
  })
  it("does not display incomplete credits as zero", async () => {
    server.use(
      http.get(`${origin}/api/auth/me`, () =>
        HttpResponse.json({
          success: true,
          data: { ...user, dailyQuota: null },
        }),
      ),
    )
    await expect(
      getSiteTypeCapabilities("xiaoen").account!.data!.fetchData({
        ...request,
        checkIn: createCheckInConfig("xiaoen"),
      }),
    ).rejects.toMatchObject({ code: "JSON_PARSE_ERROR" })
  })
  it("does not export a masked inference key", async () => {
    server.use(
      http.get(`${origin}/api/auth/me`, () =>
        HttpResponse.json({
          success: true,
          data: { ...user, apiKey: "sk-****" },
        }),
      ),
    )
    await expect(
      getSiteTypeCapabilities("xiaoen").account!.serviceCredential!.fetch(
        request,
      ),
    ).rejects.toMatchObject({ code: "JSON_PARSE_ERROR" })
  })
  it("reports authoritative status using only the identity GET", async () => {
    expect(
      await xiaoenProvider.getStatus!({ request, observedAt: 12345 }),
    ).toMatchObject({
      outcome: "known",
      availability: "enabled",
      today: "checked",
      evidence: { observedAt: 12345 },
    })
  })
  it("classifies an expired Cookie as authentication required", async () => {
    server.use(
      http.get(`${origin}/api/auth/me`, () =>
        HttpResponse.json({ success: false, message: "未登录" }),
      ),
    )
    expect(
      await xiaoenProvider.getStatus!({ request, observedAt: 12345 }),
    ).toMatchObject({ outcome: "unknown", reason: "authentication_required" })
  })
  it("submits once and keeps daily credit awards distinct from cash", async () => {
    server.use(
      http.get(`${origin}/api/auth/me`, () =>
        HttpResponse.json({
          success: true,
          data: { ...user, hasSignedInToday: false },
        }),
      ),
    )
    const mutation = vi.fn(({ request: native }: { request: Request }) => {
      expect(native.headers.get("authorization")).toBeNull()
      return HttpResponse.json({
        success: true,
        message: "签到成功！获得 +2962 额度 (当日有效)",
        data: { bonus: 2962, newQuota: 38962 },
      })
    })
    server.use(http.post(`${origin}/api/user/signin`, mutation))
    expect(await performCheckIn(request)).toMatchObject({
      alreadyChecked: false,
      data: { bonus: 2962 },
      message: "签到成功！获得 +2962 额度 (当日有效)",
    })
    expect(mutation).toHaveBeenCalledTimes(1)
  })
  it("rejects missing status without submitting", async () => {
    server.use(
      http.get(`${origin}/api/auth/me`, () =>
        HttpResponse.json({
          success: true,
          data: { id: user.id, username: user.username },
        }),
      ),
    )
    const mutation = vi.fn(() => HttpResponse.json({ success: true }))
    server.use(http.post(`${origin}/api/user/signin`, mutation))
    await expect(performCheckIn(request)).rejects.toMatchObject({
      code: "JSON_PARSE_ERROR",
    })
    expect(mutation).not.toHaveBeenCalled()
  })
  it("uses the account route for key-visible models and excludes the public catalog", async () => {
    server.use(
      http.get("https://speed27.toter.me/v1/models", ({ request: native }) => {
        expect(native.headers.get("authorization")).toBe(
          "Bearer sk-test-service-key",
        )
        return HttpResponse.json({
          data: [{ id: "visible-model" }],
          object: "list",
        })
      }),
    )
    const models = await getSiteTypeCapabilities(
      "xiaoen",
    ).account!.modelCatalog!.fetchModels(
      { ...request, auth: { ...request.auth, apiKey: user.apiKey } },
      { accountRequest: request },
    )
    expect(models).toMatchObject([{ id: "visible-model" }])
  })
  beforeEach(async () => {
    const transport = installCookieTransport()
    const cookie = (await browser.cookies.getAll({}))[0]!
    transport.cookies.mockResolvedValue([
      { ...cookie, name: "auth_token", domain: "free.supxh.xin" },
    ])
    server.use(
      http.get(`${origin}/api/auth/me`, () =>
        HttpResponse.json({ success: true, data: user }),
      ),
    )
  })
  afterEach(() => vi.restoreAllMocks())

  it("refreshes native expiring credits without assigning a dollar value", async () => {
    const data = await getSiteTypeCapabilities(
      "xiaoen",
    ).account!.data!.fetchData({
      ...request,
      checkIn: createCheckInConfig("xiaoen"),
    })
    expect(data).toMatchObject({
      quota: 0,
      nativeBalance: {
        unit: "credits",
        total: 36000,
        permanent: 34000,
        daily: 2000,
      },
    })
  })
  it("exports the singleton inference credential to its account-specific route", async () => {
    expect(
      await getSiteTypeCapabilities("xiaoen").account!.serviceCredential!.fetch(
        request,
      ),
    ).toMatchObject({
      kind: "singleton_service_key",
      key: "sk-test-service-key",
      baseUrl: "https://speed27.toter.me/v1",
    })
    expect(
      getSiteTypeCapabilities("xiaoen").account!.serviceCredential!.rotate,
    ).toBeUndefined()
  })
  it("uses the official invitation host and encodes the native code", async () => {
    server.use(
      http.get(`${origin}/api/site-config`, () =>
        HttpResponse.json({
          success: true,
          data: { externalLinks: { siteUrl: "https://go.toter.me" } },
        }),
      ),
    )
    expect(
      await getSiteTypeCapabilities(
        "xiaoen",
      ).account!.inviteLink!.fetchInviteLink({ request }),
    ).toBe("https://go.toter.me/register?code=CODE")
  })
  it("rejects another identity before accepting account facts or inference secrets", async () => {
    await expect(
      getSiteTypeCapabilities("xiaoen").account!.serviceCredential!.fetch({
        ...request,
        auth: { ...request.auth, userId: "other" },
      }),
    ).rejects.toMatchObject({ code: "ACCOUNT_IDENTITY_MISMATCH" })
  })
  it("does not submit again when the authoritative status is already checked", async () => {
    const mutation = vi.fn(() =>
      HttpResponse.json({ success: true, data: { bonus: 2962 } }),
    )
    server.use(http.post(`${origin}/api/user/signin`, mutation))
    expect(await performCheckIn(request)).toMatchObject({
      alreadyChecked: true,
    })
    expect(mutation).not.toHaveBeenCalled()
  })
  it("retains public native price labels without inventing a dollar price or key access", async () => {
    server.use(
      http.get("https://speed27.toter.me/v1/models", () =>
        HttpResponse.json({ data: [{ id: "example" }] }),
      ),
      http.get(`${origin}/api/models/pricing`, () =>
        HttpResponse.json({
          success: true,
          data: {
            models: [
              {
                name: "example",
                description: "",
                priceLabel: "300 额度/1K tokens",
                priceType: "token",
              },
            ],
          },
        }),
      ),
    )
    const catalog =
      await getSiteTypeCapabilities(
        "xiaoen",
      ).account!.modelPricing!.fetchPricing(request)
    expect(catalog.data[0]).toMatchObject({
      model_name: "example",
      model_description: "300 额度/1K tokens",
      price_metadata: { precision: "unavailable" },
    })
  })
  it("reads public announcements without acknowledging upstream messages", async () => {
    server.use(
      http.get(`${origin}/api/announcements`, () =>
        HttpResponse.json({
          success: true,
          data: [
            {
              id: "announcement",
              content: "Migration",
              isActive: true,
              createdAt: "2026-09-23T02:46:06.838Z",
            },
          ],
        }),
      ),
    )
    expect(
      await getSiteTypeCapabilities("xiaoen").site!.announcements!.fetch(
        request,
      ),
    ).toEqual([
      {
        id: "announcement",
        content: "Migration",
        createdAt: Date.parse("2026-09-23T02:46:06.838Z"),
      },
    ])
  })
})
