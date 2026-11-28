import { http, HttpResponse } from "msw"
import { afterEach, expect, it, vi } from "vitest"

import { pmplanProvider } from "~/services/checkin/autoCheckin/providers/pmplan"
import { clickPmplanCheckInPage } from "~/services/checkin/autoCheckin/providers/pmplanNativePageClick"
import { AuthTypeEnum } from "~/types"
import { server } from "~~/tests/msw/server"
import { installCookieTransport } from "~~/tests/test-utils/cookieTransport"
import { buildSiteAccount } from "~~/tests/test-utils/factories"

vi.mock(
  "~/services/checkin/autoCheckin/providers/pmplanNativePageClick",
  () => ({
    clickPmplanCheckInPage: vi.fn().mockResolvedValue({
      status: "failed",
      reasonCode: "manual_verification_required",
    }),
  }),
)
afterEach(() => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
})
const account = () =>
  buildSiteAccount({
    site_type: "pmplan",
    site_url: "https://plan.pmcat.top",
    authType: AuthTypeEnum.Cookie,
    cookieAuth: { sessionCookie: "pmplan_session=saved" },
    account_info: { ...buildSiteAccount().account_info, id: "661" },
  })

it("requires Cookie credentials and an account identity before execution", () => {
  expect(pmplanProvider.getReadiness(account())).toEqual({ ready: true })
  expect(
    pmplanProvider.getReadiness({
      ...account(),
      authType: AuthTypeEnum.AccessToken,
    }),
  ).toMatchObject({ ready: false })
  expect(
    pmplanProvider.getReadiness({
      ...account(),
      account_info: { ...account().account_info, id: "" },
    }),
  ).toMatchObject({ ready: false })
})
it("does not invent status when neither a saved account nor a request is available", async () => {
  expect(await pmplanProvider.getStatus!({ observedAt: 123 })).toBeUndefined()
})
it.each([true, false])(
  "reads and discovers saved-account status without mutating (checked=%s)",
  async (checked) => {
    installCookieTransport("pmplan_session", "plan.pmcat.top")
    server.use(
      http.get("https://plan.pmcat.top/api/me", () =>
        HttpResponse.json({
          user: { id: 661, username: "sample" },
          checkin: {
            checked_in_today: checked,
            can_checkin: !checked,
            today: "2026-11-28",
            streak: 1,
          },
        }),
      ),
    )
    const result = await pmplanProvider.detect!({
      account: account(),
      signal: new AbortController().signal,
      observedAt: 123,
    })
    expect(result).toMatchObject({
      detection: { outcome: "matched" },
      status: {
        outcome: "known",
        today: checked ? "checked" : "not_checked",
        requiresManualVerification: true,
      },
    })
    expect(clickPmplanCheckInPage).not.toHaveBeenCalled()
  },
)
it("reports an expired session as unknown without claiming a completed check-in", async () => {
  installCookieTransport("pmplan_session", "plan.pmcat.top")
  server.use(
    http.get("https://plan.pmcat.top/api/me", () =>
      HttpResponse.json({}, { status: 401 }),
    ),
  )
  expect(
    await pmplanProvider.getStatus!({ account: account(), observedAt: 123 }),
  ).toMatchObject({ outcome: "unknown", attemptedAt: 123 })
  expect(clickPmplanCheckInPage).not.toHaveBeenCalled()
})
it.each([true, false])(
  "honors explicit verification continuation (enabled=%s)",
  async (enabled) => {
    const saved = account()
    saved.checkIn = {
      ...saved.checkIn,
      continueWhenVerificationRequired: enabled,
    }
    const result = await pmplanProvider.checkIn(saved, {} as never)
    expect(result.status).toBe("failed")
    if (enabled) expect(clickPmplanCheckInPage).toHaveBeenCalledWith(saved, {})
    else {
      expect(clickPmplanCheckInPage).not.toHaveBeenCalled()
      expect(result).toMatchObject({
        messageParams: { checkInUrl: "https://plan.pmcat.top/#/" },
      })
    }
  },
)
