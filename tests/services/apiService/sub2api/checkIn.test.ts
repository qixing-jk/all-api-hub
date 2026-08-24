import { describe, expect, it } from "vitest"

import {
  parseSub2ApiProDailyCheckInMutationResponse,
  parseSub2ApiProDailyCheckInStatusResponse,
  SUB2API_PRO_DAILY_CHECK_IN_ERROR_REASONS,
} from "~/services/apiService/sub2api/checkIn"
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

describe("Sub2API Pro daily check-in protocol parsing", () => {
  it("parses the strict status envelope without retaining reward data", () => {
    expect(
      parseSub2ApiProDailyCheckInStatusResponse(
        response(200, {
          code: 0,
          message: "success",
          data: {
            enabled: true,
            checked_in_today: false,
            reward_min: 1,
            reward_max: 3,
            reward_amount: 2.5,
            additive_field: "ignored",
          },
        }),
      ),
    ).toEqual({ enabled: true, checkedInToday: false })
  })

  it.each([
    [
      "missing enabled",
      { checked_in_today: false, reward_min: 1, reward_max: 3 },
    ],
    [
      "malformed checked flag",
      { enabled: true, checked_in_today: 0, reward_min: 1, reward_max: 3 },
    ],
    [
      "non-finite minimum",
      {
        enabled: true,
        checked_in_today: false,
        reward_min: Number.NaN,
        reward_max: 3,
      },
    ],
    [
      "reversed reward bounds",
      { enabled: true, checked_in_today: false, reward_min: 4, reward_max: 3 },
    ],
    [
      "non-finite optional reward",
      {
        enabled: true,
        checked_in_today: true,
        reward_min: 1,
        reward_max: 3,
        reward_amount: Number.POSITIVE_INFINITY,
      },
    ],
  ])("rejects a status envelope with %s", (_name, data) => {
    expect(() =>
      parseSub2ApiProDailyCheckInStatusResponse(
        response(200, { code: 0, message: "success", data }),
      ),
    ).toThrow()
  })

  it("rejects an HTTP success carrying a non-zero business code", () => {
    expect(() =>
      parseSub2ApiProDailyCheckInStatusResponse(
        response(200, { code: 403, message: "disabled" }),
      ),
    ).toThrow()
  })

  it("parses successful mutation data and the stable error reasons", () => {
    expect(
      parseSub2ApiProDailyCheckInMutationResponse(
        response(200, {
          code: 0,
          message: "success",
          data: {
            message: "Daily check-in successful",
            reward_amount: 1.25,
            new_balance: 8.5,
            checked_in_at: "2026-08-24T00:00:00Z",
          },
        }),
      ),
    ).toEqual({
      kind: "applied",
      data: {
        rewardAmount: 1.25,
        newBalance: 8.5,
        checkedInAt: "2026-08-24T00:00:00Z",
      },
    })

    expect(
      parseSub2ApiProDailyCheckInMutationResponse(
        response(409, {
          code: 409,
          message: "already checked in today",
          reason: SUB2API_PRO_DAILY_CHECK_IN_ERROR_REASONS.AlreadyCheckedToday,
        }),
      ),
    ).toEqual({ kind: "already_checked" })

    expect(
      parseSub2ApiProDailyCheckInMutationResponse(
        response(403, {
          code: 403,
          message: "disabled",
          reason: SUB2API_PRO_DAILY_CHECK_IN_ERROR_REASONS.Disabled,
        }),
      ),
    ).toEqual({ kind: "disabled" })

    expect(
      parseSub2ApiProDailyCheckInMutationResponse(
        response(403, {
          code: 403,
          message: "forbidden",
          reason: SUB2API_PRO_DAILY_CHECK_IN_ERROR_REASONS.RoleForbidden,
        }),
      ),
    ).toEqual({ kind: "role_forbidden" })
  })

  it.each([
    [
      "mismatched error code",
      response(409, {
        code: 403,
        message: "already checked in today",
        reason: SUB2API_PRO_DAILY_CHECK_IN_ERROR_REASONS.AlreadyCheckedToday,
      }),
    ],
    [
      "missing machine reason",
      response(403, { code: 403, message: "disabled" }),
    ],
    [
      "malformed success data",
      response(200, {
        code: 0,
        message: "success",
        data: {
          message: "ok",
          reward_amount: Number.NaN,
          new_balance: 8.5,
          checked_in_at: "2026-08-24T00:00:00Z",
        },
      }),
    ],
  ])("rejects mutation response with %s", (_name, value) => {
    expect(() => parseSub2ApiProDailyCheckInMutationResponse(value)).toThrow()
  })
})
