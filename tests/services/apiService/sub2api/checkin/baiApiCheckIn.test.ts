import { beforeEach, describe, expect, it, vi } from "vitest"

import { recoverSub2ApiBrowserAuth } from "~/services/apiService/sub2api/auth/browserAuth"
import { refreshSub2ApiTokens } from "~/services/apiService/sub2api/auth/tokenRefresh"
import {
  fetchBaiApiCheckInStatus,
  parseBaiApiCheckInMutationResponse,
  parseBaiApiCheckInStatusResponse,
  performBaiApiCheckIn,
  readBaiApiAward,
} from "~/services/apiService/sub2api/checkin/baiApiCheckIn"
import {
  createBaiApiCheckInStatusEndpoint,
  resolveBaiApiCheckInTimezone,
} from "~/services/apiService/sub2api/checkin/baiApiCheckInProtocol"
import { API_ERROR_CODES } from "~/services/apiTransport/errors"
import { fetchApiResponse } from "~/services/apiTransport/request"
import { API_DIRECT_REQUEST_REASONS } from "~/services/apiTransport/type"
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
  directRequestReason: API_DIRECT_REQUEST_REASONS.Passive,
  baseUrl: "https://relay.example",
  auth: {
    authType: AuthTypeEnum.AccessToken,
    accessToken: "example-token",
    userId: "42",
  },
}

const STATUS_ENDPOINT = createBaiApiCheckInStatusEndpoint(
  resolveBaiApiCheckInTimezone(),
)

// Field shape captured from https://byeapi.top on 2026-11-03 (see
// .scratch/byeapi-checkin/research.md); personal history is trimmed here.
const statusData = (overrides: Record<string, unknown> = {}) => ({
  attendance_start_date: "2026-09-05",
  makeup_cards: 0,
  attendance_cycle_day: 0,
  attendance_rewards: [],
  registered_date: "2026-11-01",
  checked_today: false,
  checkin_date: "2026-11-02",
  streak_days: 0,
  next_checkin_streak_days: 1,
  history: [],
  ...overrides,
})

describe("柏API check-in protocol", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(fetchApiResponse).mockReset()
  })

  it("retains only the status fields the method needs", () => {
    expect(parseBaiApiCheckInStatusResponse(response(statusData()))).toEqual({
      enabled: true,
      checkedInToday: false,
      streakDays: 0,
    })
  })

  it.each([
    [true, 7],
    [false, 0],
  ])("reads checked_today=%s with its streak", (checkedToday, streakDays) => {
    expect(
      parseBaiApiCheckInStatusResponse(
        response(
          statusData({ checked_today: checkedToday, streak_days: streakDays }),
        ),
      ),
    ).toEqual({ enabled: true, checkedInToday: checkedToday, streakDays })
  })

  it.each([
    null,
    [],
    {},
    { checked_today: false },
    { checkin_date: "2026-11-02" },
    { checked_today: "true", checkin_date: "2026-11-02" },
    { checked_today: false, checkin_date: 20261102 },
  ])("rejects an invalid or incomplete status DTO %j", (data) => {
    expect(() => parseBaiApiCheckInStatusResponse(response(data))).toThrow()
  })

  it("keeps a missing streak unset instead of reporting zero", () => {
    expect(
      parseBaiApiCheckInStatusResponse(
        response(statusData({ streak_days: "3" })),
      ),
    ).toEqual({ enabled: true, checkedInToday: false })
  })

  it.each([401, 403, 404, 405, 500])(
    "preserves HTTP %s even with a non-JSON body",
    (status) => {
      expect(() =>
        parseBaiApiCheckInStatusResponse({
          ...response(null, status),
          body: "404 page not found",
        }),
      ).toThrow(expect.objectContaining({ statusCode: status }))
    },
  )

  it("classifies an unauthorized login envelope for later mapping", () => {
    expect(() =>
      parseBaiApiCheckInStatusResponse({
        ...response(null, 401),
        body: {
          code: "UNAUTHORIZED",
          message: "Authorization header is required",
        },
      }),
    ).toThrow(
      expect.objectContaining({
        statusCode: 401,
        upstreamCode: "UNAUTHORIZED",
      }),
    )
  })

  it.each([
    { code: 0, message: "success" },
    { code: "0", message: "success", data: statusData() },
    { code: 0, message: "success", data: null },
  ])("rejects a malformed envelope %j", (body) => {
    expect(() =>
      parseBaiApiCheckInStatusResponse({ ...response(null), body }),
    ).toThrow()
  })

  it("maps the day's record with its awarded USD amount", () => {
    expect(
      parseBaiApiCheckInMutationResponse(
        response({
          checkin_date: "2026-11-03",
          streak_days: 1,
          cash_amount_usd: 0.1,
          qualification_id: 12,
        }),
      ),
    ).toEqual({ rewardAmount: 0.1, checkinDate: "2026-11-03", streakDays: 1 })
  })

  it("lets a blind-box draw award win over the record amount", () => {
    // The header card reads `draw.cash_amount_usd ?? cash_amount_usd`.
    expect(
      readBaiApiAward({ cash_amount_usd: 0.1, draw: { cash_amount_usd: 0.8 } }),
    ).toBe(0.8)
    expect(
      readBaiApiAward({ cash_amount_usd: 0.1, draw: { cash_amount_usd: 0 } }),
    ).toBeUndefined()
    expect(readBaiApiAward({ cash_amount_usd: 0.1, draw: null })).toBe(0.1)
    expect(
      readBaiApiAward({ cash_amount_usd: 0.1, draw: { cash_amount_usd: "1" } }),
    ).toBe(1)
  })

  it.each([0, "0", "0.00"])(
    "does not report the record amount when the authoritative draw is %s",
    (drawAmount) => {
      expect(
        parseBaiApiCheckInMutationResponse(
          response({
            checkin_date: "2026-11-03",
            cash_amount_usd: 0.1,
            draw: { cash_amount_usd: drawAmount },
          }),
        ),
      ).toEqual({ checkinDate: "2026-11-03" })
    },
  )

  it.each([null, undefined])(
    "uses the record only when the draw amount is nullish: %s",
    (drawAmount) => {
      expect(
        parseBaiApiCheckInMutationResponse(
          response({
            checkin_date: "2026-11-03",
            cash_amount_usd: "0.1",
            draw: { cash_amount_usd: drawAmount },
          }),
        ),
      ).toEqual({ checkinDate: "2026-11-03", rewardAmount: 0.1 })
    },
  )

  it.each(["invalid", "", -1, false])(
    "does not substitute a record reward for malformed draw %s",
    (drawAmount) => {
      expect(
        parseBaiApiCheckInMutationResponse(
          response({
            checkin_date: "2026-11-03",
            cash_amount_usd: 0.1,
            draw: { cash_amount_usd: drawAmount },
          }),
        ),
      ).toEqual({ checkinDate: "2026-11-03" })
    },
  )

  it("accepts a decimal-string award from the same field", () => {
    expect(
      parseBaiApiCheckInMutationResponse(
        response({ checkin_date: "2026-11-03", cash_amount_usd: "0.25" }),
      ),
    ).toEqual({ rewardAmount: 0.25, checkinDate: "2026-11-03" })
  })

  it.each([
    {},
    { cash_amount_usd: 0.1 },
    { checkin_date: 20261103, cash_amount_usd: 0.1 },
    { checkin_date: "", cash_amount_usd: 0.1 },
  ])("does not claim success for a malformed mutation %j", (data) => {
    expect(() => parseBaiApiCheckInMutationResponse(response(data))).toThrow()
  })

  it("leaves a missing or zero award unset rather than reporting zero", () => {
    expect(
      parseBaiApiCheckInMutationResponse(
        response({ checkin_date: "2026-11-03", cash_amount_usd: 0 }),
      ),
    ).toEqual({ checkinDate: "2026-11-03" })
  })

  it("sends an authenticated uncached GET with the browser timezone", async () => {
    vi.mocked(fetchApiResponse).mockResolvedValue(
      response(statusData({ checked_today: true, streak_days: 2 })),
    )
    await expect(fetchBaiApiCheckInStatus(request)).resolves.toEqual({
      enabled: true,
      checkedInToday: true,
      streakDays: 2,
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

  it("falls back to UTC when the browser cannot resolve its timezone", async () => {
    const spy = vi.spyOn(Intl, "DateTimeFormat").mockImplementation(() => {
      throw new Error("unavailable")
    })
    try {
      vi.mocked(fetchApiResponse).mockResolvedValue(response(statusData()))
      await fetchBaiApiCheckInStatus(request)
      expect(fetchApiResponse).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          endpoint: "/api/v1/daily-rewards/checkin/status?timezone=UTC",
        }),
      )
    } finally {
      spy.mockRestore()
    }
  })

  it.each([undefined, "example-refresh-token"])(
    "does not recover missing credentials during status discovery (refresh=%s)",
    async (refreshToken) => {
      vi.mocked(fetchApiResponse).mockResolvedValue(response(null, 401))
      await expect(
        fetchBaiApiCheckInStatus({
          ...request,
          auth: { ...request.auth!, accessToken: "", refreshToken },
        }),
      ).rejects.toMatchObject({ statusCode: 401 })
      expect(recoverSub2ApiBrowserAuth).not.toHaveBeenCalled()
      expect(refreshSub2ApiTokens).not.toHaveBeenCalled()
      expect(fetchApiResponse).not.toHaveBeenCalled()
    },
  )

  it("submits a single POST without a request body", async () => {
    vi.mocked(fetchApiResponse).mockResolvedValue(
      response({ checkin_date: "2026-11-03", cash_amount_usd: 0.1 }),
    )
    await expect(performBaiApiCheckIn(request)).resolves.toEqual({
      rewardAmount: 0.1,
      checkinDate: "2026-11-03",
    })
    expect(fetchApiResponse).toHaveBeenCalledTimes(1)
    expect(fetchApiResponse).toHaveBeenCalledWith(expect.anything(), {
      endpoint: "/api/v1/daily-rewards/checkin",
      options: { method: "POST", cache: "no-store" },
    })
  })

  it.each([fetchBaiApiCheckInStatus, performBaiApiCheckIn])(
    "does not repeat an unauthorized request",
    async (operation) => {
      vi.mocked(fetchApiResponse).mockResolvedValue({
        ok: false,
        status: 401,
        headers: {},
        body: {
          code: "UNAUTHORIZED",
          message: "Authorization header is required",
        },
      })
      await expect(operation(request)).rejects.toMatchObject({
        statusCode: 401,
      })
      // One unauthorized response never becomes two calls: the transport's
      // own recovery runs first, and with none available the call ends.
      expect(fetchApiResponse).toHaveBeenCalledTimes(1)
    },
  )

  it("reports a success envelope with an unmapped code as a business error", () => {
    expect(() =>
      parseBaiApiCheckInMutationResponse({
        ...response(null),
        body: { code: 50001, message: "签到未开放" },
      }),
    ).toThrow(
      expect.objectContaining({
        code: API_ERROR_CODES.BUSINESS_ERROR,
        message: "签到未开放",
        upstreamCode: "50001",
      }),
    )
  })
})
