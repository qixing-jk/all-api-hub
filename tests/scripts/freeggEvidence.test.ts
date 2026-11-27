import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { runInNewContext } from "node:vm"
import { describe, expect, it, vi } from "vitest"

import {
  assertPreparationWindow,
  currentResultStatus,
  findAllowance,
  findNewAllowance,
  planReset,
} from "~~/scripts/suites/freegg/evidence.mjs"

describe("FreeGG live acceptance evidence", () => {
  it("reserves the reset run when the preparation ledger read finishes after midnight", async () => {
    const source = readFileSync(
      "scripts/test-freegg-checkin-e2e-live.mjs",
      "utf8",
    )
    const start = source.indexOf("        const before = await ledger()")
    const end = source.indexOf(
      "        // Optional actual mutation coverage:",
      start,
    )
    assert(start >= 0 && end > start, "Locate the real preparation branch")
    const resetAt = Date.parse("2026-11-24T16:00:00Z")
    let clock = resetAt - 1000
    const click = vi.fn(async () => {
      throw new Error("pre-reset run clicked")
    })
    const ledger = async () => {
      const serverTime = clock
      clock = resetAt + 1000
      return {
        serverTime,
        items: [
          {
            user_id: 17,
            type: 1,
            created_at: serverTime / 1000,
            other: {
              content_parts: [
                { key: "Daily allowance {{quota}}", params: { quota: "$20" } },
              ],
            },
          },
        ],
      }
    }
    const run = (target: number | undefined) =>
      runInNewContext(`(async () => { ${source.slice(start, end)} })()`, {
        assert,
        ledger,
        findAllowance,
        expectedUserId: "17",
        resetAt: target,
        requests: [],
        Date: { now: () => clock },
        checkin: { getByTestId: () => ({ click }) },
      })
    await run(resetAt)
    expect(clock).toBeGreaterThan(resetAt)
    expect(click).not.toHaveBeenCalled()
    // The ordinary run still exercises its explicit already-claimed action.
    clock = resetAt - 1000
    await expect(run(undefined)).rejects.toThrow("pre-reset run clicked")
    expect(click).toHaveBeenCalledOnce()
  })
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
  it("records same-second native credit only when the baseline has no allowance that day", () => {
    const item = {
      user_id: 17,
      type: 1,
      created_at: 120,
      other: {
        content_parts: [
          { key: "Daily allowance {{quota}}", params: { quota: "$20" } },
        ],
      },
    }
    const before = { items: [], serverTime: 120000 }
    const after = { items: [item], serverTime: 120000 }
    const scope = { userId: "17", dayStart: 100 }
    expect(findNewAllowance(before, after, scope)).toBe(item)
    expect(
      findNewAllowance(
        { ...before, items: [{ ...item, created_at: 110 }] },
        after,
        scope,
      ),
    ).toBeUndefined()
  })
})
