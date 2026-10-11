import { beforeEach, describe, expect, it, vi } from "vitest"

import { recoverSub2ApiBrowserAuth } from "~/services/apiService/sub2api/auth/browserAuth"
import { refreshSub2ApiTokens } from "~/services/apiService/sub2api/auth/tokenRefresh"
import {
  CLAWHUD_DAILY_CHECK_IN_ERROR_CODES,
  CLAWHUD_DAILY_CHECK_IN_RESULT_KINDS,
  fetchClawhudDailyCheckInStatus,
  parseClawhudDailyCheckInMutationResponse,
  parseClawhudDailyCheckInStatusResponse,
  performClawhudDailyCheckIn,
} from "~/services/apiService/sub2api/checkin/clawhudCheckIn"
import { ForeignCheckInContractError } from "~/services/apiService/sub2api/checkin/foreignCheckInContract"
import { ApiError } from "~/services/apiTransport/errors"
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
  baseUrl: "https://api.clawhud.com",
  auth: {
    authType: AuthTypeEnum.AccessToken,
    accessToken: "example-token",
    userId: "42",
  },
}

describe("Clawhud check-in protocol", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(fetchApiResponse).mockReset()
  })

  it("retains only the authoritative status fields", () => {
    expect(
      parseClawhudDailyCheckInStatusResponse(
        response({
          enabled: true,
          checked_in_today: true,
          today: "2026-10-11",
          timezone: "Asia/Taipei",
          min_amount: 1,
          max_amount: 10,
          today_amount: 1.14,
          total_count: 1,
          total_amount: 1.14,
        }),
      ),
    ).toEqual({ enabled: true, checkedInToday: true })
  })

  it.each([
    null,
    [],
    {},
    { enabled: true, today_checked_in: false },
    { enabled: "true", checked_in_today: false },
    { enabled: true, checked_in_today: 0 },
  ])("rejects invalid or sibling status DTO %j", (data) => {
    expect(() =>
      parseClawhudDailyCheckInStatusResponse(response(data)),
    ).toThrow()
  })

  it("classifies a success envelope of a sibling contract as foreign, not malformed", () => {
    // The Genius Programmer fork shares this path with a different DTO;
    // discovery must treat it as "not served here" instead of an unknown probe.
    expect(() =>
      parseClawhudDailyCheckInStatusResponse(
        response({
          enabled: true,
          today_checked_in: false,
          recent_records: [],
        }),
      ),
    ).toThrow(ForeignCheckInContractError)
  })

  it.each([
    {},
    { enabled: true },
    { enabled: true, today_checked_in: 0 },
    { enabled: "true", today_checked_in: false },
    { enabled: true, checked_in_today: undefined, today_checked_in: false },
  ])("keeps incomplete or malformed status inconclusive: %j", (data) => {
    expect(() =>
      parseClawhudDailyCheckInStatusResponse(response(data)),
    ).toThrow(expect.objectContaining({ code: "JSON_PARSE_ERROR" }))
  })

  it("keeps a malformed contract on this path as an invalid response", () => {
    let thrown: unknown
    try {
      parseClawhudDailyCheckInStatusResponse(
        response({ enabled: "true", checked_in_today: false }),
      )
    } catch (error) {
      thrown = error
    }
    expect(thrown).toBeInstanceOf(ApiError)
    expect(thrown).not.toBeInstanceOf(ForeignCheckInContractError)
  })

  it.each([401, 403, 404, 405, 409, 429, 500])(
    "preserves HTTP %s even with a malformed envelope",
    (status) => {
      expect(() =>
        parseClawhudDailyCheckInStatusResponse({
          ...response(null, status),
          body: "not JSON",
        }),
      ).toThrow(expect.objectContaining({ statusCode: status }))
    },
  )

  it.each([
    null,
    {},
    { code: "0", message: "success" },
    { code: NaN, message: "success" },
    {
      code: "UNAUTHORIZED",
      message: "Authorization header is required",
      data: null,
    },
  ])("rejects malformed envelopes %j", (body) => {
    expect(() =>
      parseClawhudDailyCheckInStatusResponse({
        ...response(null),
        body,
      }),
    ).toThrow()
  })

  it("keeps the request unauthorized error for later classification", () => {
    expect(() =>
      parseClawhudDailyCheckInStatusResponse({
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

  it("maps the granted mutation response to an applied award", () => {
    expect(
      parseClawhudDailyCheckInMutationResponse(
        response({
          enabled: true,
          checked_in_today: true,
          today: "2026-10-11",
          timezone: "Asia/Taipei",
          min_amount: 1,
          max_amount: 10,
          today_amount: 1.14,
          total_count: 1,
          total_amount: 1.14,
          new_balance: 6.14,
          checked_in_at: "2026-10-11T12:52:08.131448304+08:00",
        }),
      ),
    ).toEqual({
      kind: CLAWHUD_DAILY_CHECK_IN_RESULT_KINDS.Applied,
      data: { rewardAmount: 1.14 },
    })
  })

  it("exposes the already-checked reason on the duplicate mutation", () => {
    expect(() =>
      parseClawhudDailyCheckInMutationResponse({
        ...response(null, 409),
        body: {
          code: 409,
          message: "already checked in today",
          reason: "CHECKIN_ALREADY_DONE",
        },
      }),
    ).toThrow(
      expect.objectContaining({
        statusCode: 409,
        upstreamCode: CLAWHUD_DAILY_CHECK_IN_ERROR_CODES.AlreadyChecked,
      }),
    )
  })

  it.each(["", "   "])(
    "preserves duplicate classification with a blank upstream message: %j",
    (message) => {
      expect(() =>
        parseClawhudDailyCheckInMutationResponse({
          ...response(null, 409),
          body: {
            code: 409,
            message,
            reason: "CHECKIN_ALREADY_DONE",
          },
        }),
      ).toThrow(
        expect.objectContaining({
          message: "Clawhud daily check-in request failed with HTTP 409",
          statusCode: 409,
          upstreamCode: CLAWHUD_DAILY_CHECK_IN_ERROR_CODES.AlreadyChecked,
        }),
      )
    },
  )

  it.each([
    {},
    { checked_in_today: false, today_amount: 1.14 },
    { checked_in_today: true },
    { checked_in_today: true, today_amount: "1.14" },
    { checked_in_today: true, today_amount: -1 },
    { checked_in_today: true, today_amount: Infinity },
  ])("does not claim success for malformed mutation %j", (data) => {
    expect(() =>
      parseClawhudDailyCheckInMutationResponse(response(data)),
    ).toThrow()
  })

  it("sends an authenticated uncached GET with the browser timezone", async () => {
    vi.mocked(fetchApiResponse).mockResolvedValue(
      response({ enabled: true, checked_in_today: false }),
    )
    await expect(fetchClawhudDailyCheckInStatus(request)).resolves.toEqual({
      enabled: true,
      checkedInToday: false,
    })
    expect(fetchApiResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        auth: expect.objectContaining({ accessToken: "example-token" }),
      }),
      {
        endpoint: `/api/v1/user/checkin/status?timezone=${encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone)}`,
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
        response({ enabled: false, checked_in_today: false }),
      )
      await fetchClawhudDailyCheckInStatus(request)
      expect(fetchApiResponse).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          endpoint: "/api/v1/user/checkin/status?timezone=UTC",
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
        fetchClawhudDailyCheckInStatus({
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
      response({ checked_in_today: true, today_amount: 1.14 }),
    )
    await expect(performClawhudDailyCheckIn(request)).resolves.toEqual({
      kind: CLAWHUD_DAILY_CHECK_IN_RESULT_KINDS.Applied,
      data: { rewardAmount: 1.14 },
    })
    expect(fetchApiResponse).toHaveBeenCalledTimes(1)
    expect(fetchApiResponse).toHaveBeenCalledWith(expect.anything(), {
      endpoint: "/api/v1/user/checkin",
      options: { method: "POST", cache: "no-store" },
    })
  })

  it.each([fetchClawhudDailyCheckInStatus, performClawhudDailyCheckIn])(
    "does not replay after an unauthorized response",
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
      expect(fetchApiResponse).toHaveBeenCalledTimes(1)
    },
  )

  it("does not replay a write whose response was lost", async () => {
    vi.mocked(fetchApiResponse).mockRejectedValue(
      new TypeError("Failed to fetch"),
    )
    await expect(performClawhudDailyCheckIn(request)).rejects.toMatchObject({
      message: "Failed to fetch",
    })
    expect(fetchApiResponse).toHaveBeenCalledTimes(1)
  })
})
