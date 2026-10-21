import { http, HttpResponse } from "msw"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createKey, fetchKeys } from "~/services/apiService/dahl"
import { AuthTypeEnum } from "~/types"
import { server } from "~~/tests/msw/server"
import { installCookieTransport } from "~~/tests/test-utils/cookieTransport"

const origin = "https://inference.dahl.global"
const userId = "00000000-0000-4000-8000-000000000001"
const request = {
  baseUrl: origin,
  auth: { authType: AuthTypeEnum.Cookie, userId },
}
const key = {
  id: 7,
  available_tokens: 0,
  total_tokens: 0,
  created_at: "2026-10-11T00:00:00Z",
  status: "active",
  masked: "dahl_abc…xyz",
  token: "dahl_example",
}

describe("Dahl operation-bound Cookie transport", () => {
  let boundary: ReturnType<typeof installCookieTransport>
  beforeEach(async () => {
    boundary = installCookieTransport()
    const base = (await browser.cookies.getAll({}))[0]!
    boundary.cookies.mockResolvedValue([
      {
        ...base,
        domain: "inference.dahl.global",
        name: "dahl_session",
        value: "account-A",
      },
    ])
    boundary.cookies.mockClear()
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it("uses the same bound Cookie through Firefox's existing interceptor transport", async () => {
    vi.stubEnv("BROWSER", "firefox")
    vi.spyOn(browser.runtime, "getURL").mockImplementation(
      (path) => `moz-extension://test-extension/${path}`,
    )
    server.use(
      http.get(`${origin}/v1/account`, ({ request }) => {
        expect(request.headers.get("cookie")).toBe("dahl_session=account-A")
        // Only reads after identity verification would replace the bound session.
        boundary.cookies.mockClear()
        boundary.cookies.mockResolvedValue([])
        return HttpResponse.json({ user: { user_id: userId, username: "A" } })
      }),
      http.post(`${origin}/v1/account/keys`, ({ request }) => {
        expect(request.headers.get("cookie")).toBe("dahl_session=account-A")
        expect(request.headers.get("all-api-hub-session-cookie")).toBe(
          "dahl_session=account-A",
        )
        return HttpResponse.json({ key })
      }),
    )
    await expect(createKey(request)).resolves.toMatchObject({ id: 7 })
    expect(boundary.cookies).not.toHaveBeenCalled()
    expect(
      boundary.updateRules.mock.calls.every(
        ([update]) => !update.addRules?.length,
      ),
    ).toBe(true)
  })

  it("does not dispatch on Firefox when its interceptor permissions are missing", async () => {
    vi.stubEnv("BROWSER", "firefox")
    vi.mocked(browser.permissions.contains).mockResolvedValue(false)
    await expect(
      createKey({
        ...request,
        auth: { ...request.auth, cookie: "dahl_session=saved-A" },
      }),
    ).rejects.toMatchObject({ code: "COOKIE_PERMISSION_REQUIRED" })
    expect(boundary.fetch).not.toHaveBeenCalled()
    expect(boundary.cookies).not.toHaveBeenCalled()
  })

  it.each(["create", "inventory"])(
    "keeps the verified session for %s when the native login changes",
    async (operation) => {
      server.use(
        http.get(`${origin}/v1/account`, ({ request }) => {
          expect(request.headers.get("cookie")).toBe("dahl_session=account-A")
          // Only reads after identity verification would replace the bound session.
          boundary.cookies.mockClear()
          boundary.cookies.mockResolvedValue([])
          return HttpResponse.json({ user: { user_id: userId, username: "A" } })
        }),
        http.post(`${origin}/v1/account/keys`, ({ request }) => {
          expect(request.headers.get("cookie")).toBe("dahl_session=account-A")
          return HttpResponse.json({ key })
        }),
        http.get(`${origin}/v1/account/keys`, ({ request }) => {
          expect(request.headers.get("cookie")).toBe("dahl_session=account-A")
          return HttpResponse.json({ keys: [key] })
        }),
      )
      if (operation === "create")
        await expect(createKey(request)).resolves.toMatchObject({ id: 7 })
      else await expect(fetchKeys(request)).resolves.toHaveLength(1)
      expect(boundary.cookies).not.toHaveBeenCalled()
      expect(
        boundary.fetch.mock.calls.every(
          ([, options]) => options?.credentials === "omit",
        ),
      ).toBe(true)
    },
  )

  it("rejects an unresolved private store before reading regular-profile cookies", async () => {
    await expect(
      createKey({
        ...request,
        fetchContext: { kind: "browser-context", incognito: true },
      }),
    ).rejects.toMatchObject({ code: "COOKIE_REQUEST_UNAVAILABLE" })
    expect(boundary.cookies).not.toHaveBeenCalled()
    expect(boundary.fetch).not.toHaveBeenCalled()
  })

  it("does not replace an expired saved session with the browser login", async () => {
    server.use(
      http.get(`${origin}/v1/account`, ({ request }) => {
        expect(request.headers.get("cookie")).toBe("dahl_session=expired")
        return HttpResponse.json({ error: "expired" }, { status: 401 })
      }),
    )
    await expect(
      createKey({
        ...request,
        auth: { ...request.auth, cookie: "dahl_session=expired" },
      }),
    ).rejects.toMatchObject({ statusCode: 401 })
    expect(boundary.cookies).not.toHaveBeenCalled()
    expect(boundary.fetch).toHaveBeenCalledTimes(1)
  })
})
