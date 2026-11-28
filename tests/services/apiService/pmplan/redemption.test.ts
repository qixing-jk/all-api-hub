import { http, HttpResponse } from "msw"
import { afterEach, expect, it, vi } from "vitest"

import { getSiteTypeCapabilities } from "~/services/apiAdapters/registry"
import { API_DIRECT_REQUEST_REASONS } from "~/services/apiTransport/type"
import { AuthTypeEnum } from "~/types"
import { server } from "~~/tests/msw/server"
import { installCookieTransport } from "~~/tests/test-utils/cookieTransport"

const origin = "https://selfhosted.pmplan.test"
const code = "PMRC-ABCD-EFGH-JKMN-PQRS"
const request = {
  baseUrl: origin,
  directRequestReason: API_DIRECT_REQUEST_REASONS.CallerManaged,
  auth: {
    authType: AuthTypeEnum.Cookie,
    userId: "661",
    cookie: "pmplan_session=saved-account",
  },
}
afterEach(() => vi.restoreAllMocks())

it.each([
  { status: 404, message: "兑换码不存在" },
  { status: 409, message: "该兑换码已被使用" },
  { status: 400, message: "该兑换码已过期" },
])(
  "preserves a confirmed native rejection ($status)",
  async ({ status, message }) => {
    installCookieTransport("pmplan_session", "selfhosted.pmplan.test")
    let writes = 0
    server.use(
      http.get(`${origin}/api/me`, () =>
        HttpResponse.json({ user: { id: 661, username: "sample" } }),
      ),
      http.post(`${origin}/api/reset-cards/redeem`, () => {
        writes++
        return HttpResponse.json({ error: message }, { status })
      }),
    )
    await expect(
      getSiteTypeCapabilities("pmplan").account!.redemption!.redeem({
        request,
        code,
      }),
    ).rejects.toMatchObject({ message: expect.stringContaining(message) })
    expect(writes).toBe(1)
  },
)

it.each(["mismatch", "expired", "invalid-code"])(
  "does not dispatch a claim for %s",
  async (mode) => {
    installCookieTransport("pmplan_session", "selfhosted.pmplan.test")
    let writes = 0
    server.use(
      http.get(`${origin}/api/me`, () =>
        mode === "expired"
          ? HttpResponse.json({ error: "unauthorized" }, { status: 401 })
          : HttpResponse.json({ user: { id: 662, username: "other" } }),
      ),
      http.post(`${origin}/api/reset-cards/redeem`, () => {
        writes++
        return HttpResponse.json({ ok: true })
      }),
    )
    await expect(
      getSiteTypeCapabilities("pmplan").account!.redemption!.redeem({
        request,
        code: mode === "invalid-code" ? "PMRC-invalid" : code,
      }),
    ).rejects.not.toHaveProperty("retryable", false)
    expect(writes).toBe(0)
  },
)

it("retains an acknowledged claim without optional card metadata", async () => {
  installCookieTransport("pmplan_session", "selfhosted.pmplan.test")
  server.use(
    http.get(`${origin}/api/me`, () =>
      HttpResponse.json({ user: { id: 661, username: "sample" } }),
    ),
    http.post(`${origin}/api/reset-cards/redeem`, () =>
      HttpResponse.json({ ok: true }),
    ),
  )
  expect(
    await getSiteTypeCapabilities("pmplan").account!.redemption!.redeem({
      request,
      code,
    }),
  ).toMatchObject({
    awards: [],
    message: "redemptionAssist:messages.pmplanCardClaimed",
  })
})

it.each(["lost", "malformed", "server-error"])(
  "reports an uncertain claim after %s without replaying the write",
  async (mode) => {
    installCookieTransport("pmplan_session", "selfhosted.pmplan.test")
    let writes = 0
    server.use(
      http.get(`${origin}/api/me`, () =>
        HttpResponse.json({ user: { id: 661, username: "sample" } }),
      ),
      http.post(`${origin}/api/reset-cards/redeem`, () => {
        writes++
        return mode === "lost"
          ? HttpResponse.error()
          : mode === "malformed"
            ? HttpResponse.json({})
            : HttpResponse.json({ error: "unavailable" }, { status: 503 })
      }),
    )
    await expect(
      getSiteTypeCapabilities("pmplan").account!.redemption!.redeem({
        request,
        code,
      }),
    ).rejects.toMatchObject({
      message: "redemptionAssist:messages.pmplanClaimUncertain",
      retryable: false,
    })
    expect(writes).toBe(1)
  },
)

it("claims a reset card through the registered capability without using it or inventing a monetary award", async () => {
  installCookieTransport("pmplan_session", "selfhosted.pmplan.test")
  const writes: string[] = []
  server.use(
    http.get(`${origin}/api/me`, ({ request }) => {
      expect(request.headers.get("Cookie")).toBe("pmplan_session=saved-account")
      return HttpResponse.json({ user: { id: 661, username: "sample" } })
    }),
    http.post(`${origin}/api/reset-cards/redeem`, async ({ request }) => {
      writes.push(new URL(request.url).pathname)
      expect(await request.json()).toEqual({ code })
      expect(request.headers.get("Cookie")).toBe("pmplan_session=saved-account")
      expect(request.headers.get("Authorization")).toBeNull()
      expect(request.headers.get("X-PMPlan-CSRF")).toBe("1")
      return HttpResponse.json({ ok: true, id: 42 })
    }),
    http.post(`${origin}/api/reset-cards/:id/use`, () => {
      writes.push("unexpected-use")
      return HttpResponse.json({ ok: true })
    }),
  )
  const redemption = getSiteTypeCapabilities("pmplan").account?.redemption
  expect(redemption).toBeDefined()
  expect(
    await redemption!.redeem({ request, code: ` ${code.toLowerCase()} ` }),
  ).toEqual({
    awards: [],
    message: "redemptionAssist:messages.pmplanCardClaimed",
  })
  expect(writes).toEqual(["/api/reset-cards/redeem"])
})
