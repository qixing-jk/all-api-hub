import { http, HttpResponse } from "msw"
import { afterEach, expect, it, vi } from "vitest"

import { fetchPmplanCheckInStatus } from "~/services/apiService/pmplan/checkIn"
import { API_ERROR_CODES } from "~/services/apiTransport/errors"
import { API_DIRECT_REQUEST_REASONS } from "~/services/apiTransport/type"
import { AuthTypeEnum } from "~/types"
import { server } from "~~/tests/msw/server"
import { installCookieTransport } from "~~/tests/test-utils/cookieTransport"

afterEach(() => vi.restoreAllMocks())

it.each([
  undefined,
  null,
  [],
  "invalid",
  {},
  {
    checked_in_today: "true",
    can_checkin: false,
    today: "2026-11-03",
    streak: 1,
  },
  { checked_in_today: true, can_checkin: 0, today: "2026-11-03", streak: 1 },
  { checked_in_today: true, can_checkin: false, today: "invalid", streak: 1 },
  {
    checked_in_today: true,
    can_checkin: false,
    today: "2026-11-03",
    streak: -1,
  },
  {
    checked_in_today: true,
    can_checkin: false,
    today: "2026-11-03",
    streak: 1.5,
  },
])(
  "rejects malformed check-in facts without accepting status: %j",
  async (checkin) => {
    installCookieTransport("pmplan_session", "plan.pmcat.top")
    server.use(
      http.get("https://plan.pmcat.top/api/me", () =>
        HttpResponse.json({ user: { id: 661, username: "sample" }, checkin }),
      ),
    )
    await expect(
      fetchPmplanCheckInStatus({
        directRequestReason: API_DIRECT_REQUEST_REASONS.Passive,
        baseUrl: "https://plan.pmcat.top",
        auth: {
          authType: AuthTypeEnum.Cookie,
          userId: "661",
          cookie: "pmplan_session=saved",
        },
      }),
    ).rejects.toMatchObject({
      message: "Invalid PM-Plan check-in status",
      code: API_ERROR_CODES.JSON_PARSE_ERROR,
    })
  },
)

it("reads today's authoritative check-in gate without posting a grant", async () => {
  installCookieTransport("pmplan_session", "plan.pmcat.top")
  server.use(
    http.get("https://plan.pmcat.top/api/me", () =>
      HttpResponse.json({
        user: { id: 661, username: "sample" },
        checkin: {
          checked_in_today: true,
          can_checkin: false,
          today: "2026-11-03",
          streak: 1,
        },
      }),
    ),
  )
  expect(
    await fetchPmplanCheckInStatus({
      directRequestReason: API_DIRECT_REQUEST_REASONS.Passive,
      baseUrl: "https://plan.pmcat.top",
      auth: {
        authType: AuthTypeEnum.Cookie,
        userId: "661",
        cookie: "pmplan_session=saved",
      },
    }),
  ).toEqual({
    checkedInToday: true,
    canCheckIn: false,
    today: "2026-11-03",
    streak: 1,
    requiresManualVerification: true,
  })
})

it("registers authoritative status with a manual-verification gate", async () => {
  const { pmplanProvider } =
    await import("~/services/checkin/autoCheckin/providers/pmplan")
  installCookieTransport("pmplan_session", "plan.pmcat.top")
  server.use(
    http.get("https://plan.pmcat.top/api/me", () =>
      HttpResponse.json({
        user: { id: 661, username: "sample" },
        checkin: {
          checked_in_today: false,
          can_checkin: true,
          today: "2026-11-03",
          streak: 1,
        },
      }),
    ),
  )
  expect(
    await pmplanProvider.getStatus!({
      request: {
        directRequestReason: API_DIRECT_REQUEST_REASONS.Passive,
        baseUrl: "https://plan.pmcat.top",
        auth: {
          authType: AuthTypeEnum.Cookie,
          userId: "661",
          cookie: "pmplan_session=saved",
        },
      },
      observedAt: 123,
    }),
  ).toMatchObject({
    outcome: "known",
    today: "not_checked",
    requiresManualVerification: true,
  })
})

it("includes verified check-in support in bootstrap facts", async () => {
  const { getSiteTypeCapabilities } =
    await import("~/services/apiAdapters/registry")
  installCookieTransport("pmplan_session", "plan.pmcat.top")
  server.use(
    http.get("https://plan.pmcat.top/api/me", () =>
      HttpResponse.json({
        user: { id: 661, username: "sample" },
        checkin: {
          checked_in_today: true,
          can_checkin: false,
          today: "2026-11-03",
          streak: 1,
        },
      }),
    ),
  )
  expect(
    await getSiteTypeCapabilities(
      "pmplan",
    ).account!.bootstrap!.loadBootstrapFacts({
      directRequestReason: API_DIRECT_REQUEST_REASONS.Passive,
      baseUrl: "https://plan.pmcat.top",
      auth: {
        authType: AuthTypeEnum.Cookie,
        userId: "661",
        cookie: "pmplan_session=saved",
      },
    }),
  ).toMatchObject({ checkInSupported: true })
  await expect(
    getSiteTypeCapabilities("pmplan").account!.bootstrap!.fetchCheckInSupport(
      {
        directRequestReason: API_DIRECT_REQUEST_REASONS.Passive,
        baseUrl: "https://plan.pmcat.top",
        auth: { authType: AuthTypeEnum.Cookie },
      },
      { checkInSupported: true },
    ),
  ).resolves.toBe(true)
})
