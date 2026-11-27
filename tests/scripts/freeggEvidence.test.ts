import { describe, expect, it } from "vitest"

import {
  assertPreparationWindow,
  currentResultStatus,
  findAllowance,
  planReset,
} from "~~/scripts/suites/freegg/evidence.mjs"

describe("FreeGG live acceptance evidence", () => {
  it("pins the upcoming UTC+8 reset before preparing an account", () => {
    const start = Date.parse("2026-11-24T15:40:00Z")
    const reset = planReset(start)
    expect(reset).toBe(Date.parse("2026-11-24T16:00:00Z"))
    expect(() => assertPreparationWindow(reset, start)).not.toThrow()
    expect(() => assertPreparationWindow(reset, reset - 60_000)).toThrow()
    expect(() => assertPreparationWindow(reset, reset + 1)).toThrow()
    expect(() => planReset(Date.parse("2026-11-24T12:00:00Z"))).toThrow()
  })
  it("requires an account-matched USD 20 allowance in the independent claim window", () => {
    const matching = {
      user_id: 17,
      type: 1,
      created_at: 120,
      other: JSON.stringify({
        content_parts: [
          {
            key: "Daily allowance {{quota}}",
            params: { quota: "＄20.000000" },
          },
        ],
      }),
    }
    const window = { userId: "17", from: 110, to: 130 }
    expect(findAllowance([matching], window)).toBe(matching)
    for (const extra of [
      { user_id: 18 },
      { type: 4 },
      { created_at: 109 },
      { created_at: 131 },
      { other: "{broken" },
      {
        other: {
          content_parts: [{ key: "Other income", params: { quota: "$20" } }],
        },
      },
      {
        other: {
          content_parts: [
            { key: "Daily allowance {{quota}}", params: { quota: "￥20" } },
          ],
        },
      },
    ])
      expect(findAllowance([{ ...matching, ...extra }], window)).toBeUndefined()
  })
  it("ignores a previous scheduled result when checking the explicit run", () => {
    expect(
      currentResultStatus({ timestamp: 99, status: "skipped" }, 100),
    ).toBeUndefined()
    expect(currentResultStatus(undefined, 100)).toBeUndefined()
    expect(
      currentResultStatus({ timestamp: 101, status: "skipped" }, 100),
    ).toBe("skipped")
  })
})
