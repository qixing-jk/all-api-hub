import { http, HttpResponse } from "msw"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  resolveAutoCheckinProvider,
  type AutoCheckinProvider,
} from "~/services/checkin/autoCheckin/providers"
import { sub2ApiProvider } from "~/services/checkin/autoCheckin/providers/sub2api"
import { AuthTypeEnum, type SiteAccount } from "~/types"
import { CHECKIN_RESULT_STATUS } from "~/types/autoCheckin"
import { server } from "~~/tests/msw/server"

const { mockIsSub2ApiCheckinEnabled } = vi.hoisted(() => ({
  mockIsSub2ApiCheckinEnabled: vi.fn(),
}))

vi.mock("~/services/checkin/sub2apiCheckinPreference", () => ({
  isSub2ApiCheckinEnabled: mockIsSub2ApiCheckinEnabled,
}))

const SITE_URL = "https://sub2api.invalid"
// Primary = the pair observed on a live deployment; fallback = the
// redeem-scoped pair kept for forks that register check-in elsewhere.
const PRIMARY_STATUS_URL = `${SITE_URL}/api/v1/check-in/status`
const PRIMARY_CHECKIN_URL = `${SITE_URL}/api/v1/check-in`
const FALLBACK_STATUS_URL = `${SITE_URL}/api/v1/redeem/checkin/status`
const FALLBACK_CHECKIN_URL = `${SITE_URL}/api/v1/redeem/checkin`

const createAccount = (overrides: Partial<SiteAccount> = {}): SiteAccount =>
  ({
    id: "account-1",
    site_type: SITE_TYPES.SUB2API,
    site_url: SITE_URL,
    authType: AuthTypeEnum.AccessToken,
    account_info: {
      id: "7",
      access_token: "jwt-dashboard",
    },
    checkIn: {
      enableDetection: true,
    },
    ...overrides,
  }) as unknown as SiteAccount

const envelope = (data: unknown, message = "") => ({
  code: 0,
  message,
  data,
})

describe("sub2ApiProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsSub2ApiCheckinEnabled.mockResolvedValue(true)
  })

  it("registers the Sub2API auto-check-in provider", () => {
    expect(resolveAutoCheckinProvider(createAccount())).toBe(
      sub2ApiProvider as AutoCheckinProvider,
    )
  })

  describe("canCheckIn", () => {
    it("requires detection to be enabled and a dashboard token", () => {
      expect(sub2ApiProvider.canCheckIn(createAccount())).toBe(true)
      expect(
        sub2ApiProvider.canCheckIn(
          createAccount({ checkIn: { enableDetection: false } }),
        ),
      ).toBe(false)
      expect(
        sub2ApiProvider.canCheckIn(
          createAccount({
            account_info: { id: "7", access_token: "" },
          } as Partial<SiteAccount>),
        ),
      ).toBe(false)
    })
  })

  it("skips without any request while the global opt-in is off", async () => {
    mockIsSub2ApiCheckinEnabled.mockResolvedValue(false)
    const statusHandler = vi.fn()
    server.use(
      http.get(PRIMARY_STATUS_URL, () => {
        statusHandler()
        return HttpResponse.json(envelope({ checked_in_today: false }))
      }),
    )

    const result = await sub2ApiProvider.checkIn(createAccount())

    expect(result.status).toBe(CHECKIN_RESULT_STATUS.SKIPPED)
    expect(result.messageKey).toBe(
      "autoCheckin:providerFallback.sub2apiDisabled",
    )
    expect(statusHandler).not.toHaveBeenCalled()
  })

  it("checks in through the primary route", async () => {
    const checkinHandler = vi.fn()
    server.use(
      http.get(PRIMARY_STATUS_URL, () =>
        HttpResponse.json(envelope({ checked_in_today: false })),
      ),
      http.post(PRIMARY_CHECKIN_URL, ({ request }) => {
        checkinHandler(request.headers.get("authorization"))
        return HttpResponse.json(
          envelope({ quota_awarded: "0.5" }, "签到成功，获得 0.5"),
        )
      }),
    )

    const result = await sub2ApiProvider.checkIn(createAccount())

    expect(result.status).toBe(CHECKIN_RESULT_STATUS.SUCCESS)
    expect(result.rawMessage).toBe("签到成功，获得 0.5")
    expect(result.data).toEqual({ reward: "0.5" })
    expect(checkinHandler).toHaveBeenCalledWith("Bearer jwt-dashboard")
  })

  it("falls back to the redeem-scoped route when the primary route is missing", async () => {
    const fallbackCheckin = vi.fn()
    server.use(
      http.get(
        PRIMARY_STATUS_URL,
        () => new HttpResponse(null, { status: 404 }),
      ),
      http.get(FALLBACK_STATUS_URL, () =>
        HttpResponse.json(envelope({ checked_in_today: false })),
      ),
      http.post(FALLBACK_CHECKIN_URL, () => {
        fallbackCheckin()
        return HttpResponse.json(envelope({ reward: 1 }, "ok"))
      }),
    )

    const result = await sub2ApiProvider.checkIn(createAccount())

    expect(result.status).toBe(CHECKIN_RESULT_STATUS.SUCCESS)
    expect(fallbackCheckin).toHaveBeenCalledTimes(1)
  })

  it("reports an unsupported deployment when neither route exists", async () => {
    server.use(
      http.get(
        PRIMARY_STATUS_URL,
        () => new HttpResponse(null, { status: 404 }),
      ),
      http.get(
        FALLBACK_STATUS_URL,
        () => new HttpResponse(null, { status: 404 }),
      ),
    )

    const result = await sub2ApiProvider.checkIn(createAccount())

    expect(result.status).toBe(CHECKIN_RESULT_STATUS.FAILED)
    expect(result.messageKey).toBe(
      "autoCheckin:providerFallback.endpointNotSupported",
    )
  })

  it("does not post a second check-in when the status route already reports today", async () => {
    const checkinHandler = vi.fn()
    server.use(
      http.get(PRIMARY_STATUS_URL, () =>
        HttpResponse.json(envelope({ checked_in_today: true })),
      ),
      http.post(PRIMARY_CHECKIN_URL, () => {
        checkinHandler()
        return HttpResponse.json(envelope({}))
      }),
    )

    const result = await sub2ApiProvider.checkIn(createAccount())

    expect(result.status).toBe(CHECKIN_RESULT_STATUS.ALREADY_CHECKED)
    expect(checkinHandler).not.toHaveBeenCalled()
  })

  it("maps an HTTP 409 from the check-in route to already-checked", async () => {
    server.use(
      http.get(PRIMARY_STATUS_URL, () =>
        HttpResponse.json(envelope({ checked_in_today: false })),
      ),
      http.post(
        PRIMARY_CHECKIN_URL,
        () => new HttpResponse(null, { status: 409 }),
      ),
    )

    const result = await sub2ApiProvider.checkIn(createAccount())

    expect(result.status).toBe(CHECKIN_RESULT_STATUS.ALREADY_CHECKED)
  })

  it("surfaces an unexpected upstream failure as a failed result", async () => {
    server.use(
      http.get(
        PRIMARY_STATUS_URL,
        () => new HttpResponse(null, { status: 500 }),
      ),
    )

    const result = await sub2ApiProvider.checkIn(createAccount())

    expect(result.status).toBe(CHECKIN_RESULT_STATUS.FAILED)
  })
})
