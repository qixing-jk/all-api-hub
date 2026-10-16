import { describe, expect, it } from "vitest"

import { parseClawhudDailyCheckInStatusResponse } from "~/services/apiService/sub2api/checkin/clawhudCheckIn"
import { parseFreeApiDailyCheckInStatusResponse } from "~/services/apiService/sub2api/checkin/freeApiCheckIn"
import { API_ERROR_CODES } from "~/services/apiTransport/errors"
import type { ApiTransportResponse } from "~/services/apiTransport/type"

describe.each([
  ["FreeAPI", "/api/v1/user/checkin", parseFreeApiDailyCheckInStatusResponse],
  [
    "Clawhud",
    "/api/v1/user/checkin/status",
    parseClawhudDailyCheckInStatusResponse,
  ],
] as const)("%s code-envelope error contract", (name, endpoint, parse) => {
  const response = (
    body: unknown,
    status = 200,
  ): ApiTransportResponse<unknown> => ({
    ok: status >= 200 && status < 300,
    status,
    headers: {},
    body,
  })

  it.each([
    [401, API_ERROR_CODES.HTTP_401],
    [403, API_ERROR_CODES.HTTP_403],
    [429, API_ERROR_CODES.HTTP_429],
    [500, API_ERROR_CODES.HTTP_OTHER],
  ])("preserves HTTP %s with and without a JSON body", (status, code) => {
    for (const body of [null, { code: "DENIED", message: "  denied  " }]) {
      expect(() => parse(response(body, status))).toThrow(
        expect.objectContaining({
          code,
          statusCode: status,
          endpoint,
          message: body
            ? "denied"
            : `${name} daily check-in request failed with HTTP ${status}`,
        }),
      )
    }
  })

  it.each([
    ["CHECKIN_DISABLED", "CHECKIN_DISABLED"],
    ["", "12"],
    [undefined, "12"],
  ])(
    "preserves reason precedence and blank-message fallback: %s",
    (reason, upstreamCode) => {
      expect(() =>
        parse(response({ code: 12, reason, message: "  " })),
      ).toThrow(
        expect.objectContaining({
          code: API_ERROR_CODES.BUSINESS_ERROR,
          endpoint,
          message: `${name} daily check-in request failed with HTTP 200`,
          upstreamCode,
        }),
      )
    },
  )

  it.each([
    { code: 0, message: "ok", data: [] },
    { code: 0, message: "ok", data: null },
    { code: 0, data: {} },
  ])("keeps invalid envelope errors site-specific: %j", (body) => {
    expect(() => parse(response(body))).toThrow(
      expect.objectContaining({
        code: API_ERROR_CODES.JSON_PARSE_ERROR,
        endpoint,
        message: `Invalid ${name} daily check-in response`,
      }),
    )
  })
})
