import { http, HttpResponse } from "msw"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  fetchAccountData,
  fetchInviteLink,
} from "~/services/apiService/cubence"
import { fetchAnnouncements } from "~/services/apiService/cubence/announcements"
import { fetchCubenceModels } from "~/services/apiService/cubence/catalog"
import { fetchUserInfo } from "~/services/apiService/cubence/identity"
import { fetchGroups, fetchKeys } from "~/services/apiService/cubence/keys"
import { readCubenceResponse } from "~/services/apiService/cubence/transport"
import { AuthTypeEnum } from "~/types"
import { getCookiesForDomain } from "~/utils/browser/cookies"
import i18n from "~/utils/i18n/core"
import { server } from "~~/tests/msw/server"
import { installCookieTransport } from "~~/tests/test-utils/cookieTransport"

import { createCheckInConfig } from "../../apiAdapters/checkInFixtures"

const origin = "https://cubence.com"
const request = {
  baseUrl: origin,
  auth: { authType: AuthTypeEnum.Cookie, userId: 7 },
}
const user = {
  id: 7,
  username: "Example",
  active: true,
  normal_balance: 1_000_000,
}
const group = {
  id: 72,
  name: "Group",
  is_active: true,
  multiplier: 1,
  supported_protocols: ["openai.responses"],
}

describe("Cubence protocol rejection and recovery boundaries", () => {
  beforeEach(() => {
    installCookieTransport()
    server.use(
      http.get(`${origin}/api/v1/auth/me`, () => HttpResponse.json({ user })),
    )
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it.each([
    { ...user, id: 0 },
    { ...user, active: false },
    { ...user, username: null },
    null,
  ])(
    "rejects invalid live identity without trusting cached account data",
    async (invalid) => {
      server.use(
        http.get(`${origin}/api/v1/auth/me`, () =>
          HttpResponse.json({ user: invalid }),
        ),
      )
      await expect(fetchUserInfo(request)).rejects.toMatchObject({
        code: "JSON_PARSE_ERROR",
      })
    },
  )
  it("reads Firefox identity from the live endpoint", async () => {
    vi.stubEnv("BROWSER", "firefox")
    try {
      await expect(fetchUserInfo(request)).resolves.toMatchObject({ id: "7" })
    } finally {
      vi.unstubAllEnvs()
    }
  })
  it.each([
    {},
    { data: { models: {} }, success: true },
    {
      data: { models: [{ model_name: "", group_ids: [], is_active: true }] },
      success: true,
    },
  ])("rejects malformed model inventories", async (body) => {
    server.use(
      http.get(`${origin}/api/model-plaza`, () => HttpResponse.json(body)),
    )
    await expect(fetchCubenceModels(request)).rejects.toMatchObject({
      code: "JSON_PARSE_ERROR",
    })
  })
  it("reads current native group choices without losing their protocol metadata", async () => {
    server.use(
      http.get(`${origin}/api/v1/share-groups/available`, () =>
        HttpResponse.json({ data: [group] }),
      ),
    )
    await expect(fetchGroups(request)).resolves.toEqual([group])
  })
  it.each([
    null,
    [null],
    [{ ...group, supported_protocols: [1] }],
    [{ ...group, multiplier: -1 }],
  ])("rejects malformed group choices", async (data) => {
    server.use(
      http.get(`${origin}/api/v1/share-groups/available`, () =>
        HttpResponse.json({ data }),
      ),
    )
    await expect(fetchGroups(request)).rejects.toMatchObject({
      code: "JSON_PARSE_ERROR",
    })
  })
  it.each([
    {},
    { success: true, data: {} },
    { success: true, data: [{ id: 0 }] },
  ])("rejects malformed key inventories", async (body) => {
    server.use(
      http.get(`${origin}/api/v1/user/apikeys`, () => HttpResponse.json(body)),
    )
    await expect(fetchKeys(request)).rejects.toMatchObject({
      code: "JSON_PARSE_ERROR",
    })
  })
  it.each([{}, { invite_code: " " }])(
    "rejects missing invitation codes",
    async (data) => {
      server.use(
        http.get(`${origin}/api/v1/invite/my-code`, () =>
          HttpResponse.json({ code: 0, data }),
        ),
      )
      await expect(fetchInviteLink(request)).rejects.toThrow()
    },
  )
  it.each([401, 403])(
    "propagates expired or forbidden usage reads (%i)",
    async (status) => {
      server.use(
        http.get(`${origin}/api/v1/analytics/apikeys/hourly-usage`, () =>
          HttpResponse.json({}, { status }),
        ),
      )
      await expect(
        fetchAccountData({
          ...request,
          checkIn: createCheckInConfig("cubence"),
        }),
      ).rejects.toMatchObject({ statusCode: status })
    },
  )
  it.each([
    {},
    { success: true, data: { total: -1, announcements: [] } },
    { success: true, data: { total: 1, announcements: [null] } },
  ])("rejects malformed announcement pages", async (body) => {
    server.use(
      http.get(`${origin}/api/v1/announcements`, () => HttpResponse.json(body)),
    )
    await expect(fetchAnnouncements(request)).rejects.toMatchObject({
      code: "JSON_PARSE_ERROR",
    })
  })
  it("stops announcement traversal at the bounded page limit", async () => {
    const read = vi.fn(({ request }: { request: Request }) => {
      const page = Number(new URL(request.url).searchParams.get("page"))
      return HttpResponse.json({
        success: true,
        data: {
          total: 101,
          announcements: [{ id: page, title: "News", content: "Body" }],
        },
      })
    })
    server.use(http.get(`${origin}/api/v1/announcements`, read))
    await expect(fetchAnnouncements(request)).rejects.toMatchObject({
      code: "JSON_PARSE_ERROR",
    })
    expect(read).toHaveBeenCalledTimes(100)
  })
  it("uses English before language initialization and keeps missing dates absent", async () => {
    const language = i18n.language
    const resolvedLanguage = i18n.resolvedLanguage
    const read = vi.fn(({ request }: { request: Request }) => {
      expect(new URL(request.url).searchParams.get("lang")).toBe("en")
      return HttpResponse.json({
        success: true,
        data: {
          total: 1,
          announcements: [{ id: 1, title: "News", content: "Body" }],
        },
      })
    })
    server.use(http.get(`${origin}/api/v1/announcements`, read))
    try {
      i18n.resolvedLanguage = undefined
      i18n.language = undefined as unknown as string
      expect(await fetchAnnouncements(request)).toEqual([
        { id: "1", title: "News", content: "Body" },
      ])
      i18n.language = "en"
      expect(await fetchAnnouncements(request)).toEqual([
        { id: "1", title: "News", content: "Body" },
      ])
      expect(read).toHaveBeenCalledTimes(2)
    } finally {
      i18n.language = language
      i18n.resolvedLanguage = resolvedLanguage
    }
  })
  it("requires an actual login Cookie and Cookie read permission", async () => {
    vi.mocked(browser.cookies.getAll).mockResolvedValue([])
    await expect(
      readCubenceResponse(request, "/api/test"),
    ).rejects.toMatchObject({ statusCode: 401 })
    vi.mocked(browser.permissions.contains).mockResolvedValue(false)
    await expect(
      readCubenceResponse(request, "/api/test"),
    ).rejects.toMatchObject({ code: "COOKIE_PERMISSION_REQUIRED" })
  })
  it("rejects non-console routes and business-error envelopes", async () => {
    await expect(
      readCubenceResponse(request, "/not-api"),
    ).rejects.toMatchObject({ code: "FEATURE_UNSUPPORTED" })
    server.use(
      http.get(`${origin}/api/test`, () =>
        HttpResponse.json({ success: false }),
      ),
    )
    await expect(
      readCubenceResponse(request, "/api/test"),
    ).rejects.toMatchObject({ code: "JSON_PARSE_ERROR" })
  })
  it("reports unavailable Cookie APIs instead of dispatching without credentials", async () => {
    vi.stubGlobal("browser", {
      ...browser,
      cookies: { ...browser.cookies, getAll: undefined },
    })
    await expect(getCookiesForDomain("cubence.com")).rejects.toThrow(
      "Browser Cookie API is unavailable",
    )
  })
})
