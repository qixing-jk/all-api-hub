import { afterEach, describe, expect, it, vi } from "vitest"

import {
  extractSub2ApiCheckinMessage,
  isSub2ApiAlreadyCheckedError,
  isSub2ApiAlreadyCheckedMessage,
  isSub2ApiMissingRouteError,
  parseSub2ApiCheckinPayload,
  SUB2API_CHECKIN_ROUTES,
} from "~/services/apiService/sub2api/checkin"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"

const createApiError = (statusCode: number, message = "boom") =>
  new ApiError(
    message,
    statusCode,
    "/api/v1/redeem/checkin",
    API_ERROR_CODES.HTTP_OTHER,
  )

afterEach(() => {
  vi.useRealTimers()
})

describe("sub2api check-in routes", () => {
  // The `/api/v1/check-in` pair is the only one observed on a live deployment,
  // so it must stay first to avoid wasting a 404 on every probe.
  it("probes the observed check-in pair before the redeem-scoped pair", () => {
    expect(SUB2API_CHECKIN_ROUTES.map((route) => route.statusEndpoint)).toEqual(
      ["/api/v1/check-in/status", "/api/v1/redeem/checkin/status"],
    )
    expect(
      SUB2API_CHECKIN_ROUTES.map((route) => route.checkinEndpoint),
    ).toEqual(["/api/v1/check-in", "/api/v1/redeem/checkin"])
  })
})

describe("parseSub2ApiCheckinPayload", () => {
  it("reads an explicit boolean flag through the envelope", () => {
    const payload = parseSub2ApiCheckinPayload({
      code: 0,
      message: "ok",
      data: { checked_in_today: true },
    })

    expect(payload.isCheckedInToday).toBe(true)
  })

  it("finds the flag no matter how deeply the deployment nests it", () => {
    const payload = parseSub2ApiCheckinPayload({
      code: 0,
      message: "",
      data: { data: { status: { has_checked_in: true } } },
    })

    expect(payload.isCheckedInToday).toBe(true)
  })

  it("locates a flag inside array payloads", () => {
    // `findValue` recurses into arrays; some deployments wrap the flag in an
    // array of objects rather than a plain envelope.
    expect(
      parseSub2ApiCheckinPayload({
        data: [{ id: 1 }, { checked_in_today: true }],
      }).isCheckedInToday,
    ).toBe(true)
  })

  it("treats a numeric flag as a boolean", () => {
    expect(
      parseSub2ApiCheckinPayload({ data: { is_checked_in: 1 } })
        .isCheckedInToday,
    ).toBe(true)
    expect(
      parseSub2ApiCheckinPayload({ data: { is_checked_in: 0 } })
        .isCheckedInToday,
    ).toBe(false)
  })

  it("falls back to comparing the last check-in date with today", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-07-29T12:00:00Z"))
    const today = new Date().toISOString().slice(0, 10)

    expect(
      parseSub2ApiCheckinPayload({
        data: { last_checkin_at: `${today}T04:12:00Z` },
      }).isCheckedInToday,
    ).toBe(true)
    expect(
      parseSub2ApiCheckinPayload({ data: { last_checkin_at: "2000-01-01" } })
        .isCheckedInToday,
    ).toBe(false)
  })

  it("falls back to backend copy when no flag or date is reported", () => {
    expect(
      parseSub2ApiCheckinPayload({ message: "今日已签到" }).isCheckedInToday,
    ).toBe(true)
    expect(
      parseSub2ApiCheckinPayload({ message: "签到成功" }).isCheckedInToday,
    ).toBe(false)
  })

  it("extracts the awarded amount and ignores non-scalar values", () => {
    expect(parseSub2ApiCheckinPayload({ data: { reward: 5 } }).reward).toBe("5")
    expect(
      parseSub2ApiCheckinPayload({ data: { quota_awarded: "0.5" } }).reward,
    ).toBe("0.5")
    // A non-scalar hit stops the lookup instead of digging into it, so an
    // unexpected shape reports "no reward" rather than "[object Object]".
    expect(
      parseSub2ApiCheckinPayload({ data: { reward: { amount: 5 } } }).reward,
    ).toBe("")
    expect(parseSub2ApiCheckinPayload({ data: {} }).reward).toBe("")
  })

  it("tolerates empty and non-object payloads", () => {
    for (const body of [null, undefined, "", 42, []]) {
      const payload = parseSub2ApiCheckinPayload(body)
      expect(payload).toEqual({
        isCheckedInToday: false,
        reward: "",
        message: "",
      })
    }
  })
})

describe("extractSub2ApiCheckinMessage", () => {
  it("prefers the envelope message and falls back to nested data", () => {
    expect(extractSub2ApiCheckinMessage({ message: " done " })).toBe("done")
    expect(extractSub2ApiCheckinMessage({ data: { detail: "nested" } })).toBe(
      "nested",
    )
    expect(extractSub2ApiCheckinMessage({ message: "   " })).toBe("")
  })
})

describe("isSub2ApiAlreadyCheckedMessage", () => {
  it("matches both Chinese and English phrasings", () => {
    expect(isSub2ApiAlreadyCheckedMessage("您已签到")).toBe(true)
    expect(isSub2ApiAlreadyCheckedMessage("Already checked in today")).toBe(
      true,
    )
    expect(isSub2ApiAlreadyCheckedMessage("重复签到")).toBe(true)
    expect(isSub2ApiAlreadyCheckedMessage("check-in failed")).toBe(false)
  })
})

describe("isSub2ApiMissingRouteError", () => {
  it("recognizes only missing-route statuses", () => {
    expect(isSub2ApiMissingRouteError(createApiError(404))).toBe(true)
    expect(isSub2ApiMissingRouteError(createApiError(405))).toBe(true)
    expect(isSub2ApiMissingRouteError(createApiError(401))).toBe(false)
    expect(isSub2ApiMissingRouteError(createApiError(500))).toBe(false)
    expect(isSub2ApiMissingRouteError(new Error("404"))).toBe(false)
  })
})

describe("isSub2ApiAlreadyCheckedError", () => {
  it("treats HTTP 409 as a repeated check-in", () => {
    expect(isSub2ApiAlreadyCheckedError(createApiError(409))).toBe(true)
  })

  it("falls back to message matching for other errors", () => {
    expect(
      isSub2ApiAlreadyCheckedError(createApiError(400, "今日已签到")),
    ).toBe(true)
    expect(isSub2ApiAlreadyCheckedError(new Error("already checked"))).toBe(
      true,
    )
    expect(isSub2ApiAlreadyCheckedError(createApiError(400, "配额不足"))).toBe(
      false,
    )
    expect(isSub2ApiAlreadyCheckedError("already checked")).toBe(false)
  })
})
