import { http, HttpResponse } from "msw"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { getAccountSiteDefinition } from "~/services/accountSiteDefinitions/registry"
import { getContentSessionExtractors } from "~/services/accountSiteOnboarding/registry"
import { dayaBrowserIdentity } from "~/services/apiAdapters/daya/browserIdentity"
import { AuthTypeEnum } from "~/types"
import { server } from "~~/tests/msw/server"
import { installCookieTransport } from "~~/tests/test-utils/cookieTransport"

const origin = "https://api.dayaai.com"

describe("Daya API onboarding", () => {
  it("registers Cookie-only console authentication", () => {
    expect(
      getAccountSiteDefinition("daya")?.productProfile?.auth,
    ).toMatchObject({
      defaultAuthType: AuthTypeEnum.Cookie,
      allowedAuthTypes: [AuthTypeEnum.Cookie],
    })
  })

  it("extracts the live identity from the console session", async () => {
    const context = {
      url: `${origin}/dashboard`,
      siteTypeHint: "daya" as const,
    }
    const extractor = getContentSessionExtractors().find((item) =>
      item.canExtract(context),
    )
    expect(extractor).toBeDefined()
    server.use(
      http.get(`${origin}/api/v1/auth/me`, () =>
        HttpResponse.json({
          code: 0,
          message: "success",
          data: { id: 615, username: "daya-test-user", balance: 3.5 },
        }),
      ),
    )
    expect(await extractor!.extract(context)).toMatchObject({
      userId: "615",
      user: { id: "615", username: "daya-test-user" },
      siteTypeHint: "daya",
    })
    expect(
      extractor!.canExtract({ ...context, url: "https://daya.to/v1" }),
    ).toBe(false)
  })

  it.each([
    HttpResponse.json({ code: 401, message: "unauthorized", data: null }),
    HttpResponse.json({ code: 0, message: "success", data: { id: 0 } }),
    HttpResponse.error(),
    new HttpResponse(null, { status: 401 }),
  ])("does not onboard when the identity is unavailable", async (response) => {
    const context = { url: origin, siteTypeHint: "daya" as const }
    const extractor = getContentSessionExtractors().find((item) =>
      item.canExtract(context),
    )!
    expect(extractor.canExtract({ ...context, url: "invalid-url" })).toBe(false)
    expect(extractor.canExtract({ siteTypeHint: "daya" })).toBe(false)
    server.use(http.get(`${origin}/api/v1/auth/me`, () => response))
    expect(await extractor.extract(context)).toBeNull()
  })

  it("verifies the browser identity against the console origin", async () => {
    const context = {
      origin,
      siteType: "daya" as const,
      candidateUserIds: ["615"],
    }
    expect(dayaBrowserIdentity.canObserve(context)).toBe(true)
    expect(
      dayaBrowserIdentity.canObserve({
        ...context,
        origin: "https://dayaai.com",
      }),
    ).toBe(false)
    const observation = dayaBrowserIdentity.observe(context)!
    expect(observation.cacheResult).toBe(false)
    const read = vi
      .fn()
      .mockResolvedValueOnce({
        code: 0,
        data: { id: 615, username: "u" },
      })
      .mockResolvedValueOnce({ code: 500 })
    expect(await observation.verify(read)).toBe("615")
    expect(await observation.verify(read)).toBeNull()
    expect(read).toHaveBeenCalledWith({ url: `${origin}/api/v1/auth/me` })
  })
})

describe("Daya API Cookie transport", () => {
  let boundary: ReturnType<typeof installCookieTransport>
  beforeEach(() => {
    boundary = installCookieTransport("daya_sid", "api.dayaai.com")
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("captures one session snapshot per operation without re-reading cookies", async () => {
    server.use(
      http.get(`${origin}/api/v1/auth/me`, ({ request }) => {
        expect(request.headers.get("cookie")).toBe("daya_sid=browser-account")
        boundary.cookies.mockResolvedValue([])
        boundary.cookies.mockClear()
        return HttpResponse.json({
          code: 0,
          data: { id: 615, username: "u", balance: 3.5, status: "active" },
        })
      }),
      http.get(`${origin}/api/v1/keys`, ({ request }) => {
        expect(request.headers.get("cookie")).toBe("daya_sid=browser-account")
        return HttpResponse.json({
          code: 0,
          data: { items: [], total: 0, page: 1, page_size: 100 },
        })
      }),
    )
    const { fetchDayaKeys } = await import("~/services/apiService/daya/keys")
    await expect(
      fetchDayaKeys({
        baseUrl: origin,
        auth: { authType: AuthTypeEnum.Cookie, userId: "615" },
      }),
    ).resolves.toEqual([])
    expect(boundary.cookies).not.toHaveBeenCalled()
  })

  it("reports session expiry as HTTP 401 instead of a business failure", async () => {
    server.use(
      http.get(
        `${origin}/api/v1/auth/me`,
        () => new HttpResponse(null, { status: 401 }),
      ),
    )
    const { fetchDayaIdentity } = await import(
      "~/services/apiService/daya/identity"
    )
    await expect(
      fetchDayaIdentity({
        baseUrl: origin,
        auth: { authType: AuthTypeEnum.Cookie, userId: "615" },
      }),
    ).rejects.toMatchObject({ statusCode: 401 })
  })
})
