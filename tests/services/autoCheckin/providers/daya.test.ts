import { http, HttpResponse } from "msw"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { dayaProvider } from "~/services/checkin/autoCheckin/providers/daya"
import { PROTECTION_BYPASS_USER_COMMANDS } from "~/services/protectionBypass/contracts"
import { AuthTypeEnum } from "~/types"
import { TEMP_WINDOW_REQUEST_SOURCES } from "~/types/tempWindowFetch"
import { server } from "~~/tests/msw/server"
import { userCommandExecution } from "~~/tests/services/protectionBypass/fixtures"
import { installCookieTransport } from "~~/tests/test-utils/cookieTransport"
import { buildSiteAccount } from "~~/tests/test-utils/factories"

const origin = "https://api.dayaai.com"
const envelope = (data: unknown) => ({ code: 0, message: "success", data })
const account = buildSiteAccount({
  id: "daya-account",
  site_url: origin,
  site_type: SITE_TYPES.DAYA,
  authType: AuthTypeEnum.Cookie,
  account_info: { ...buildSiteAccount().account_info, id: "615" },
})
const context = {
  tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Background,
  protectionBypassExecution: userCommandExecution(
    PROTECTION_BYPASS_USER_COMMANDS.ManualCheckin,
  ),
}

describe("dayaProvider confirmation", () => {
  beforeEach(() => {
    installCookieTransport("daya_sid", "api.dayaai.com")
    server.use(
      http.get(`${origin}/api/v1/auth/me`, () =>
        HttpResponse.json(
          envelope({
            id: 615,
            username: "daya-test-user",
            balance: 0,
            status: "active",
          }),
        ),
      ),
    )
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it("uses the stable GET observation to confirm an already-taken grant", async () => {
    const startedAt = new Date(2026, 0, 31, 23, 59, 59).getTime()
    vi.useFakeTimers()
    vi.setSystemTime(startedAt)
    let reads = 0
    const write = vi.fn(() => HttpResponse.json(envelope({})))
    server.use(
      http.get(`${origin}/api/v1/rewards/overview`, async () => {
        if (reads++ === 0) {
          await Promise.resolve()
          vi.setSystemTime(startedAt + 2_000)
        }
        return HttpResponse.json(
          envelope({ daily_check_in: { claimable: false } }),
        )
      }),
      http.post(`${origin}/api/v1/rewards/check-in`, write),
    )
    await expect(dayaProvider.checkIn(account, context)).resolves.toMatchObject(
      {
        status: "already_checked",
        confirmation: {
          kind: "observed",
          accountId: "daya-account",
          siteUrl: origin,
          userId: "615",
          observedAt: startedAt + 2_000,
          status: {
            outcome: "known",
            today: "checked",
            evidence: { source: "probe", observedAt: startedAt + 2_000 },
          },
        },
      },
    )
    expect(reads).toBe(2)
    expect(write).not.toHaveBeenCalled()
  })

  it("returns unavailable uncertainty without claiming after two unstable GETs", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 0, 31, 23, 59, 59))
    let reads = 0
    const write = vi.fn(() => HttpResponse.json(envelope({})))
    server.use(
      http.get(`${origin}/api/v1/rewards/overview`, async () => {
        await Promise.resolve()
        vi.setSystemTime(new Date(2026, 1, ++reads, 0, 0, 1))
        return HttpResponse.json(
          envelope({ daily_check_in: { claimable: true } }),
        )
      }),
      http.post(`${origin}/api/v1/rewards/check-in`, write),
    )
    await expect(dayaProvider.checkIn(account, context)).resolves.toMatchObject(
      {
        status: "uncertain",
        reasonCode: "checkin_unconfirmed",
        confirmation: {
          kind: "unavailable",
          accountId: "daya-account",
          siteUrl: origin,
          userId: "615",
        },
      },
    )
    expect(reads).toBe(2)
    expect(write).not.toHaveBeenCalled()
  })

  it("keeps a granted POST as a protocol response and sends it once", async () => {
    const write = vi.fn(() =>
      HttpResponse.json(envelope({ amount: 0.5, currency: "USD" })),
    )
    server.use(
      http.get(`${origin}/api/v1/rewards/overview`, () =>
        HttpResponse.json(
          envelope({
            daily_check_in: { claimable: true, display_amount: 0.5 },
          }),
        ),
      ),
      http.post(`${origin}/api/v1/rewards/check-in`, write),
    )
    await expect(dayaProvider.checkIn(account, context)).resolves.toMatchObject(
      {
        status: "success",
        data: { amount: 0.5, currency: "USD" },
        confirmation: { kind: "response" },
      },
    )
    expect(write).toHaveBeenCalledOnce()
  })
})
