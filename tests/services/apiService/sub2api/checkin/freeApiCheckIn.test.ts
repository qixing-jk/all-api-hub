import { beforeEach, describe, expect, it, vi } from "vitest"

import { recoverSub2ApiBrowserAuth } from "~/services/apiService/sub2api/auth/browserAuth"
import { refreshSub2ApiTokens } from "~/services/apiService/sub2api/auth/tokenRefresh"
import { ForeignCheckInContractError } from "~/services/apiService/sub2api/checkin/foreignCheckInContract"
import {
  fetchFreeApiDailyCheckInStatus,
  FREE_API_DAILY_CHECK_IN_RESULT_KINDS,
  parseFreeApiDailyCheckInMutationResponse,
  parseFreeApiDailyCheckInStatusResponse,
  performFreeApiDailyCheckIn,
} from "~/services/apiService/sub2api/checkin/freeApiCheckIn"
import {
  createFreeApiDailyCheckInStatusEndpoint,
  resolveFreeApiCheckInTimezone,
} from "~/services/apiService/sub2api/checkin/freeApiCheckInProtocol"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
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
  baseUrl: "https://freeapi.site",
  auth: {
    authType: AuthTypeEnum.AccessToken,
    accessToken: "example-token",
    userId: "42",
  },
}

const STATUS_ENDPOINT = createFreeApiDailyCheckInStatusEndpoint(
  resolveFreeApiCheckInTimezone(),
)

describe("FreeAPI check-in protocol", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(fetchApiResponse).mockReset()
  })

  it("retains only the authoritative status fields", () => {
    expect(
      parseFreeApiDailyCheckInStatusResponse(
        response({
          enabled: true,
          checked_in_today: false,
          min_amount: 1,
          max_amount: 999,
          total_count: 0,
          total_amount: 0,
          recent: [],
        }),
      ),
    ).toEqual({ enabled: true, checkedInToday: false })
  })

  it("keeps a checked-in status including its day award", () => {
    expect(
      parseFreeApiDailyCheckInStatusResponse(
        response({
          enabled: true,
          checked_in_today: true,
          today_amount: 12.5,
          min_amount: 1,
          max_amount: 999,
          total_count: 3,
          total_amount: 40,
          recent: [{ id: 1, checkin_date: "2026-10-16", amount: 12.5 }],
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
    { checked_in_today: false },
    { enabled: true },
  ])("rejects invalid or incomplete status DTO %j", (data) => {
    expect(() =>
      parseFreeApiDailyCheckInStatusResponse(response(data)),
    ).toThrow()
  })

  it("classifies a success envelope of a sibling contract as foreign, not malformed", () => {
    // The Genius Programmer fork answers `today_checked_in` on its shared
    // status path; discovery must read that as "not served here" instead of
    // an unknown probe that would poison a unique-match decision.
    expect(() =>
      parseFreeApiDailyCheckInStatusResponse(
        response({
          enabled: true,
          today_checked_in: false,
          recent_records: [],
        }),
      ),
    ).toThrow(ForeignCheckInContractError)
  })

  it.each([
    { checked_in_today: false, today_checked_in: false },
    { checked_in_today: true, today_checked_in: false },
    { checked_in_today: true, today_checked_in: true },
  ])(
    "rejects hybrid status rather than authorizing either method: %j",
    (data) => {
      expect(() =>
        parseFreeApiDailyCheckInStatusResponse(
          response({ enabled: true, ...data }),
        ),
      ).toThrow(
        expect.objectContaining({ code: API_ERROR_CODES.JSON_PARSE_ERROR }),
      )
    },
  )

  it("keeps a malformed contract as an invalid response", () => {
    let thrown: unknown
    try {
      parseFreeApiDailyCheckInStatusResponse(
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
        parseFreeApiDailyCheckInStatusResponse({
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
      parseFreeApiDailyCheckInStatusResponse({ ...response(null), body }),
    ).toThrow()
  })

  it("keeps the request unauthorized error for later classification", () => {
    expect(() =>
      parseFreeApiDailyCheckInStatusResponse({
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
    // CheckInView renders `checkin.success` with `result.amount`, so that field
    // is the dashboard's own award amount rather than a balance delta.
    expect(
      parseFreeApiDailyCheckInMutationResponse(
        response({ amount: 12.5, checked_in_today: true }),
      ),
    ).toEqual({
      kind: FREE_API_DAILY_CHECK_IN_RESULT_KINDS.Applied,
      data: { rewardAmount: 12.5 },
    })
  })

  it("accepts a decimal string award from the same field", () => {
    expect(
      parseFreeApiDailyCheckInMutationResponse(response({ amount: "0.5" })),
    ).toEqual({
      kind: FREE_API_DAILY_CHECK_IN_RESULT_KINDS.Applied,
      data: { rewardAmount: 0.5 },
    })
  })

  it.each([
    {},
    { checked_in_today: true },
    { amount: null },
    { amount: "" },
    { amount: "1.14 " },
    { amount: -1 },
    { amount: Infinity },
    { amount: true },
  ])("does not claim success for malformed mutation %j", (data) => {
    expect(() =>
      parseFreeApiDailyCheckInMutationResponse(response(data)),
    ).toThrow()
  })

  it("sends an authenticated uncached GET with the browser timezone", async () => {
    vi.mocked(fetchApiResponse).mockResolvedValue(
      response({ enabled: true, checked_in_today: false }),
    )
    await expect(fetchFreeApiDailyCheckInStatus(request)).resolves.toEqual({
      enabled: true,
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
        response({ enabled: false, checked_in_today: false }),
      )
      await fetchFreeApiDailyCheckInStatus(request)
      expect(fetchApiResponse).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          endpoint: "/api/v1/user/checkin?timezone=UTC",
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
        fetchFreeApiDailyCheckInStatus({
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
    vi.mocked(fetchApiResponse).mockResolvedValue(response({ amount: 12.5 }))
    await expect(performFreeApiDailyCheckIn(request)).resolves.toEqual({
      kind: FREE_API_DAILY_CHECK_IN_RESULT_KINDS.Applied,
      data: { rewardAmount: 12.5 },
    })
    expect(fetchApiResponse).toHaveBeenCalledTimes(1)
    expect(fetchApiResponse).toHaveBeenCalledWith(expect.anything(), {
      endpoint: "/api/v1/user/checkin",
      options: { method: "POST", cache: "no-store" },
    })
  })

  it.each([fetchFreeApiDailyCheckInStatus, performFreeApiDailyCheckIn])(
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
    await expect(performFreeApiDailyCheckIn(request)).rejects.toMatchObject({
      message: "Failed to fetch",
    })
    expect(fetchApiResponse).toHaveBeenCalledTimes(1)
  })
})
