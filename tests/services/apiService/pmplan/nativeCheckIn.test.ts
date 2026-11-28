import { http, HttpResponse } from "msw"
import { afterEach, expect, it, vi } from "vitest"

import { clickPmplanCheckInPage } from "~/services/checkin/autoCheckin/providers/pmplanNativePageClick"
import { tempWindowTriggerCheckinPageAction } from "~/utils/browser/tempWindowFetch"
import { server } from "~~/tests/msw/server"
import { installCookieTransport } from "~~/tests/test-utils/cookieTransport"

afterEach(() => vi.restoreAllMocks())

vi.mock("~/utils/browser/tempWindowFetch", () => ({
  tempWindowTriggerCheckinPageAction: vi.fn(async () => ({
    success: false,
    reason: "identity_missing",
  })),
}))
it("targets the native PM-Plan check-in button once", async () => {
  const result = await clickPmplanCheckInPage(
    {
      id: "test",
      site_url: "https://plan.pmcat.top",
      site_type: "pmplan",
      authType: "cookie",
      account_info: { id: "661" },
    } as never,
    {} as never,
  )
  expect(tempWindowTriggerCheckinPageAction).toHaveBeenCalledOnce()
  expect(tempWindowTriggerCheckinPageAction).toHaveBeenCalledWith(
    expect.objectContaining({
      trigger: expect.objectContaining({
        selector: 'button[data-action="checkin"]:not(:disabled)',
        throttle: { maxAttempts: 1 },
      }),
    }),
  )
  expect(result.status).not.toBe("success")
})

it("confirms a native click with account-bound status evidence on the current day", async () => {
  installCookieTransport("pmplan_session", "plan.pmcat.top")
  vi.mocked(tempWindowTriggerCheckinPageAction).mockResolvedValueOnce({
    success: true,
    reason: "clicked",
  })
  server.use(
    http.get("https://plan.pmcat.top/api/me", () =>
      HttpResponse.json({
        user: { id: 661, username: "sample" },
        checkin: {
          checked_in_today: true,
          can_checkin: false,
          today: "2026-11-27",
          streak: 1,
        },
      }),
    ),
  )
  const result = await clickPmplanCheckInPage(
    {
      id: "test",
      site_url: "https://plan.pmcat.top",
      site_type: "pmplan",
      authType: "cookie",
      cookieAuth: { sessionCookie: "pmplan_session=saved" },
      account_info: { id: "661" },
    } as never,
    {} as never,
  )
  expect(result).toMatchObject({
    status: "success",
    confirmation: {
      kind: "observed",
      accountId: "test",
      siteUrl: "https://plan.pmcat.top",
      userId: "661",
      status: {
        outcome: "known",
        today: "checked",
        evidence: { observedAt: expect.any(Number) },
      },
    },
  })
})
