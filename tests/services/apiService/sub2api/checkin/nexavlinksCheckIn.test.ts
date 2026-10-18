import { beforeEach, describe, expect, it, vi } from "vitest"

import { recoverSub2ApiBrowserAuth } from "~/services/apiService/sub2api/auth/browserAuth"
import { refreshSub2ApiTokens } from "~/services/apiService/sub2api/auth/tokenRefresh"
import {
  fetchNexaVlinksDailyCheckInStatus,
  parseNexaVlinksCheckInStatusResponse,
} from "~/services/apiService/sub2api/checkin/nexavlinksCheckIn"
import {
  createNexaVlinksCheckInStatusEndpoint,
  resolveNexaVlinksCheckInTimezone,
} from "~/services/apiService/sub2api/checkin/nexavlinksCheckInProtocol"
import { fetchApiResponse } from "~/services/apiTransport/request"
import type {
  ApiServiceRequest,
  ApiTransportResponse,
} from "~/services/apiTransport/type"
import { AuthTypeEnum } from "~/types"

vi.mock(
  "~/services/apiService/sub2api/auth/browserAuth",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("~/services/apiService/sub2api/auth/browserAuth")
    >()),
    recoverSub2ApiBrowserAuth: vi.fn().mockResolvedValue(null),
  }),
)
vi.mock(
  "~/services/apiService/sub2api/auth/tokenRefresh",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("~/services/apiService/sub2api/auth/tokenRefresh")
    >()),
    refreshSub2ApiTokens: vi
      .fn()
      .mockRejectedValue(new Error("refresh unavailable")),
  }),
)
vi.mock("~/services/apiTransport/request", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/services/apiTransport/request")>()),
  fetchApiResponse: vi.fn(),
}))

const response = (
  data: unknown,
  status = 200,
): ApiTransportResponse<unknown> => ({
  ok: status >= 200 && status < 300,
  status,
  headers: {},
  body: { code: 0, message: "success", data },
})

const request: ApiServiceRequest = {
  baseUrl: "https://asia.nexavlinks.com",
  auth: {
    authType: AuthTypeEnum.AccessToken,
    accessToken: "example-token",
    userId: "6262",
  },
}

const STATUS_ENDPOINT = createNexaVlinksCheckInStatusEndpoint(
  resolveNexaVlinksCheckInTimezone(),
)

/** The full DTO captured at https://asia.nexavlinks.com/check-in, 2026-10-17. */
const observedStatus = () => ({
  checked_in_today: false,
  eligible: false,
  current_streak: 0,
  recent_records: [
    {
      id: 20075,
      date: "2026-09-28T00:00:00Z",
      streak: 1,
      daily_amount: 0.5,
      amount: 0.5,
      balance_type: "gift",
    },
  ],
  settings: {
    captcha_mode: "rotate",
    balance_type: "gift",
    daily_reward: { mode: "fixed", amount: 0.5, min_amount: 0, max_amount: 0 },
    consecutive_rewards: [{ days: 3, reward: { mode: "fixed", amount: 1 } }],
  },
})

describe("NexaVlinks check-in protocol", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(fetchApiResponse).mockReset()
  })

  it("keeps only the fields the provider decides on", () => {
    expect(
      parseNexaVlinksCheckInStatusResponse(response(observedStatus())),
    ).toEqual({
      // The deployment has no `enabled` flag; `eligible: false` means today's
      // usage threshold has not been met, so the method is not actionable.
      enabled: false,
      checkedInToday: false,
    })
  })

  it("keeps an already-checked account enabled despite an eligibility gate", () => {
    expect(
      parseNexaVlinksCheckInStatusResponse(
        response({ ...observedStatus(), checked_in_today: true }),
      ),
    ).toMatchObject({ enabled: true, checkedInToday: true })
  })

  it("treats a missing eligibility flag as actionable", () => {
    expect(
      parseNexaVlinksCheckInStatusResponse(
        response({
          checked_in_today: false,
          settings: { captcha_mode: "rotate" },
        }),
      ),
    ).toMatchObject({ enabled: true })
  })

  it.each([
    null,
    [],
    {},
    { eligible: false },
    { checked_in_today: "false" },
    { checked_in_today: false, eligible: "false" },
    { checked_in_today: false, settings: [] },
    { checked_in_today: false, settings: "rotate" },
  ])("rejects invalid or incomplete status DTO %j", (data) => {
    expect(() => parseNexaVlinksCheckInStatusResponse(response(data))).toThrow()
  })

  it.each([
    { code: 1, message: "not eligible" },
    { code: "UNAUTHORIZED", message: "Authorization header is required" },
    null,
    "not JSON",
  ])("rejects a non-success envelope %j", (body) => {
    expect(() =>
      parseNexaVlinksCheckInStatusResponse({ ...response(null), body }),
    ).toThrow()
  })

  it.each([401, 403, 404, 429, 500])(
    "preserves HTTP %s even with a malformed body",
    (status) => {
      expect(() =>
        parseNexaVlinksCheckInStatusResponse({
          ...response(null, status),
          body: "not JSON",
        }),
      ).toThrow(expect.objectContaining({ statusCode: status }))
    },
  )

  it("sends an authenticated uncached GET with the browser timezone", async () => {
    vi.mocked(fetchApiResponse).mockResolvedValue(response(observedStatus()))
    await expect(fetchNexaVlinksDailyCheckInStatus(request)).resolves.toEqual({
      enabled: false,
      checkedInToday: false,
    })
    expect(fetchApiResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        auth: expect.objectContaining({ accessToken: "example-token" }),
      }),
      {
        endpoint: STATUS_ENDPOINT,
        options: { method: "GET", cache: "no-store" },
      },
    )
  })

  it("falls back to UTC if the browser cannot resolve its timezone", async () => {
    const spy = vi.spyOn(Intl, "DateTimeFormat").mockImplementation(() => {
      throw new Error("unavailable")
    })
    try {
      vi.mocked(fetchApiResponse).mockResolvedValue(
        response({ checked_in_today: false }),
      )
      await fetchNexaVlinksDailyCheckInStatus(request)
      expect(fetchApiResponse).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          endpoint: "/api/v1/check-in?timezone=UTC",
        }),
      )
    } finally {
      spy.mockRestore()
    }
  })

  it("does not recover missing credentials during status discovery", async () => {
    vi.mocked(fetchApiResponse).mockResolvedValue(response(null, 401))
    await expect(
      fetchNexaVlinksDailyCheckInStatus({
        ...request,
        auth: { ...request.auth!, accessToken: "", refreshToken: "rt" },
      }),
    ).rejects.toMatchObject({ statusCode: 401 })
    expect(recoverSub2ApiBrowserAuth).not.toHaveBeenCalled()
    expect(refreshSub2ApiTokens).not.toHaveBeenCalled()
    expect(fetchApiResponse).not.toHaveBeenCalled()
  })
})
