import { describe, expect, it } from "vitest"

import {
  DENXIO_DAILY_CHECK_IN_BEGIN_ENDPOINT,
  DENXIO_DAILY_CHECK_IN_CLAIM_ENDPOINT,
  DENXIO_DAILY_CHECK_IN_ERROR_CODES,
  DENXIO_DAILY_CHECK_IN_STATUS_ENDPOINT,
  parseDenxioDailyCheckInBeginResponse,
  parseDenxioDailyCheckInClaimResponse,
  parseDenxioDailyCheckInStatusResponse,
} from "~/services/apiService/sub2api/denxioCheckIn"
import { API_ERROR_CODES, type ApiError } from "~/services/apiTransport/errors"
import type { ApiTransportResponse } from "~/services/apiTransport/type"

const response = (
  status: number,
  body: unknown,
): ApiTransportResponse<unknown> => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { "content-type": "application/json" },
  body,
})

describe("Denxio daily check-in protocol parsing", () => {
  it("projects the observed status envelope to the safe status contract", () => {
    expect(
      parseDenxioDailyCheckInStatusResponse(
        response(200, {
          code: 0,
          message: "success",
          data: {
            today: "2026-09-04",
            normal_done: false,
            ad_done: false,
            makeup_done: false,
            recent_records: [],
            config: {
              normal_checkin_enabled: true,
              ad_checkin_enabled: false,
              ad_makeup_enabled: false,
            },
          },
        }),
      ),
    ).toEqual({ enabled: true, checkedInToday: false })
  })

  it.each([
    ["missing normal status", { config: { normal_checkin_enabled: true } }],
    ["missing config", { normal_done: false }],
    [
      "non-boolean availability",
      { normal_done: false, config: { normal_checkin_enabled: 1 } },
    ],
  ])("rejects status data with %s", (_name, data) => {
    expect(() =>
      parseDenxioDailyCheckInStatusResponse(
        response(200, { code: 0, message: "success", data }),
      ),
    ).toThrowError(
      expect.objectContaining({
        code: API_ERROR_CODES.JSON_PARSE_ERROR,
        endpoint: DENXIO_DAILY_CHECK_IN_STATUS_ENDPOINT,
      }),
    )
  })

  it("classifies a malformed success envelope as an invalid response", () => {
    expect(() =>
      parseDenxioDailyCheckInStatusResponse(
        response(200, { message: "success", data: {} }),
      ),
    ).toThrowError(
      expect.objectContaining({
        code: API_ERROR_CODES.JSON_PARSE_ERROR,
        endpoint: DENXIO_DAILY_CHECK_IN_STATUS_ENDPOINT,
      }),
    )
  })

  it("rejects a scalar success body as an invalid response", () => {
    expect(() =>
      parseDenxioDailyCheckInStatusResponse(response(200, null)),
    ).toThrowError(
      expect.objectContaining({
        code: API_ERROR_CODES.JSON_PARSE_ERROR,
        endpoint: DENXIO_DAILY_CHECK_IN_STATUS_ENDPOINT,
      }),
    )
  })

  it("parses a bounded begin challenge without exposing sponsor data", () => {
    expect(
      parseDenxioDailyCheckInBeginResponse(
        response(200, {
          code: 0,
          message: "success",
          data: {
            token: "one-time-challenge",
            wait_seconds: 3,
            available_at: "2026-09-04T07:00:00Z",
            sponsor: { name: "Example Sponsor" },
            no_sponsor_mode: false,
            exposure_cost: 1,
          },
        }),
      ),
    ).toEqual({ token: "one-time-challenge", waitMilliseconds: 3_000 })
  })

  it.each([-1, 60.1, Number.NaN])(
    "rejects an unsafe begin wait of %s seconds",
    (waitSeconds) => {
      expect(() =>
        parseDenxioDailyCheckInBeginResponse(
          response(200, {
            code: 0,
            message: "success",
            data: { token: "one-time-challenge", wait_seconds: waitSeconds },
          }),
        ),
      ).toThrowError(
        expect.objectContaining({
          code: API_ERROR_CODES.JSON_PARSE_ERROR,
          endpoint: DENXIO_DAILY_CHECK_IN_BEGIN_ENDPOINT,
        }),
      )
    },
  )

  it("accepts the observed claim record and retains only the reward amount", () => {
    expect(
      parseDenxioDailyCheckInClaimResponse(
        response(200, {
          code: 0,
          message: "success",
          data: {
            record: {
              id: 123,
              amount: 0.5,
              checkin_type: "normal",
            },
          },
        }),
      ),
    ).toEqual({ rewardAmount: 0.5 })
  })

  it("preserves stable deployment error codes for provider policy", () => {
    expect(() =>
      parseDenxioDailyCheckInClaimResponse(
        response(409, {
          code: DENXIO_DAILY_CHECK_IN_ERROR_CODES.AlreadyChecked,
          message: "already checked",
        }),
      ),
    ).toThrowError(
      expect.objectContaining({
        statusCode: 409,
        endpoint: DENXIO_DAILY_CHECK_IN_CLAIM_ENDPOINT,
        upstreamCode: DENXIO_DAILY_CHECK_IN_ERROR_CODES.AlreadyChecked,
      } satisfies Partial<ApiError>),
    )
  })

  it("preserves HTTP diagnostics when an upstream failure has no envelope", () => {
    expect(() =>
      parseDenxioDailyCheckInClaimResponse(response(503, null)),
    ).toThrowError(
      expect.objectContaining({
        statusCode: 503,
        code: API_ERROR_CODES.HTTP_OTHER,
        endpoint: DENXIO_DAILY_CHECK_IN_CLAIM_ENDPOINT,
      } satisfies Partial<ApiError>),
    )
  })

  it("uses a local fallback when an error envelope has a blank message", () => {
    expect(() =>
      parseDenxioDailyCheckInClaimResponse(
        response(503, { code: 503, message: " " }),
      ),
    ).toThrowError(
      expect.objectContaining({
        message: "Denxio daily check-in request failed with HTTP 503",
        statusCode: 503,
        endpoint: DENXIO_DAILY_CHECK_IN_CLAIM_ENDPOINT,
      }),
    )
  })

  it("rejects a claim without a finite reward amount", () => {
    expect(() =>
      parseDenxioDailyCheckInClaimResponse(
        response(200, {
          code: 0,
          message: "success",
          data: { record: { amount: Number.NaN } },
        }),
      ),
    ).toThrowError(
      expect.objectContaining({
        code: API_ERROR_CODES.JSON_PARSE_ERROR,
        endpoint: DENXIO_DAILY_CHECK_IN_CLAIM_ENDPOINT,
      }),
    )
  })

  it("rejects an HTTP success carrying a failure code", () => {
    expect(() =>
      parseDenxioDailyCheckInBeginResponse(
        response(200, {
          code: DENXIO_DAILY_CHECK_IN_ERROR_CODES.SessionPending,
          message: "pending",
        }),
      ),
    ).toThrowError(
      expect.objectContaining({
        code: API_ERROR_CODES.BUSINESS_ERROR,
        endpoint: DENXIO_DAILY_CHECK_IN_BEGIN_ENDPOINT,
        upstreamCode: DENXIO_DAILY_CHECK_IN_ERROR_CODES.SessionPending,
      }),
    )
  })
})
