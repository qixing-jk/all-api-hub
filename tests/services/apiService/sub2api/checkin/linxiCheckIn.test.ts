import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  parseLinxiClaim,
  parseLinxiStatus,
} from "~/services/apiService/sub2api/checkin/linxiCheckIn"
import { linxiStatusRoute } from "~/services/apiService/sub2api/checkin/linxiCheckInProtocol"

const day = "2026-11-23"
const status = {
  enabled: true,
  checked_in_today: false,
  check_in_date: day,
  turnstile_required: false,
}
const response = (data: unknown, code = 0) => ({
  ok: true,
  status: 200,
  headers: {},
  body: { code, message: "OK", data },
})

describe("Linxi and 100xLabs check-in response", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-11-22T16:01:00Z"))
  })
  afterEach(() => vi.useRealTimers())
  it("reads the native time-zone query and code/data envelope", () => {
    expect(linxiStatusRoute("Asia/Singapore")).toBe(
      "/api/v1/check-in/status?timezone=Asia%2FSingapore",
    )
    expect(parseLinxiStatus(response(status))).toEqual({
      enabled: true,
      checkedInToday: false,
      requiresManualVerification: false,
    })
    expect(
      parseLinxiStatus(response({ ...status, enabled: false })).enabled,
    ).toBe(false)
  })
  it.each([
    { ...status, check_in_date: "2026-11-22" },
    { ...status, check_in_date: "2026-02-31" },
    { ...status, turnstile_required: undefined },
    { ...status, enabled: "false" },
  ])("rejects stale or incomplete status", (data) => {
    expect(() => parseLinxiStatus(response(data))).toThrow()
  })
  it("does not trust the data of a rejected envelope", () => {
    expect(() => parseLinxiStatus(response(status, 400))).toThrow()
  })
  const record = {
    ...status,
    checked_in_today: true,
    already_checked_in: false,
  }
  it("requires today's attendance and an explicit duplicate flag", () => {
    expect(
      parseLinxiClaim(
        response({
          ...record,
          reward_amount: 0,
          today_pool: "free",
          lottery_grant: { enabled: true },
        }),
      ),
    ).toEqual({ kind: "applied", day, pool: "free", amount: 0 })
    expect(
      parseLinxiClaim(response({ ...record, already_checked_in: true })),
    ).toEqual({ kind: "already", day })
    expect(parseLinxiClaim(response(record))).toEqual({ kind: "applied", day })
  })
  it.each([
    { already_checked_in: true },
    { ...record, already_checked_in: undefined },
    { ...record, checked_in_today: false },
    { ...record, already_checked_in: true, check_in_date: "2026-11-22" },
    { lottery_grant: { enabled: true } },
  ])("does not infer a grant or duplicate from ambiguous results", (data) => {
    expect(() => parseLinxiClaim(response(data))).toThrow()
  })
})
