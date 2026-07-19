import { describe, expect, it } from "vitest"

import {
  repairAllAccountGroupExclusions,
  repairSelectedGroups,
} from "~/features/ModelList/groupSelectionState"

describe("repairSelectedGroups", () => {
  it("keeps only selected groups that remain available", () => {
    expect(repairSelectedGroups(["default", "vip"], ["default"])).toEqual([
      "default",
    ])
    expect(repairSelectedGroups(["vip"], ["default"])).toEqual([])
  })

  it("normalizes group names while preserving selection order", () => {
    expect(
      repairSelectedGroups(
        [" vip ", "", "default", "vip", "  "],
        ["default", " vip ", "default"],
      ),
    ).toEqual(["vip", "default"])
  })

  it("returns the current selection when no logical change is needed", () => {
    const current = ["vip", "default"]

    expect(repairSelectedGroups(current, [" default ", "vip", "vip"])).toBe(
      current,
    )
  })

  it("does not mutate caller-owned arrays", () => {
    const current = ["vip", "default"]
    const available = ["default"]

    repairSelectedGroups(current, available)

    expect(current).toEqual(["vip", "default"])
    expect(available).toEqual(["default"])
  })
})

describe("repairAllAccountGroupExclusions", () => {
  it("repairs only settled accounts and preserves unresolved entries", () => {
    const unresolvedGroups = ["legacy", "  ", "legacy"]
    const current = {
      settled: ["vip", "default"],
      unresolved: unresolvedGroups,
    }

    const repaired = repairAllAccountGroupExclusions({
      current,
      availableByAccountId: {
        settled: ["default"],
        unresolved: [],
      },
      settledAccountIds: new Set(["settled"]),
    })

    expect(repaired).toEqual({
      settled: ["default"],
      unresolved: ["legacy", "  ", "legacy"],
    })
    expect(repaired.unresolved).toBe(unresolvedGroups)
  })

  it("removes empty exclusion entries for settled accounts", () => {
    expect(
      repairAllAccountGroupExclusions({
        current: {
          stale: ["vip"],
          absent: ["legacy"],
          unresolved: ["vip"],
        },
        availableByAccountId: {
          stale: ["default"],
        },
        settledAccountIds: new Set(["stale", "absent"]),
      }),
    ).toEqual({ unresolved: ["vip"] })
  })

  it("removes already-empty entries once their account is settled", () => {
    expect(
      repairAllAccountGroupExclusions({
        current: { settled: [] },
        availableByAccountId: { settled: ["default"] },
        settledAccountIds: new Set(["settled"]),
      }),
    ).toEqual({})
  })

  it("normalizes settled exclusions without mutating caller state", () => {
    const settledGroups = [" vip ", "", "default", "vip"]
    const current = { settled: settledGroups }
    const availableByAccountId = {
      settled: ["default", " vip ", "default"],
    }

    const repaired = repairAllAccountGroupExclusions({
      current,
      availableByAccountId,
      settledAccountIds: new Set(["settled"]),
    })

    expect(repaired).toEqual({ settled: ["vip", "default"] })
    expect(current.settled).toBe(settledGroups)
    expect(settledGroups).toEqual([" vip ", "", "default", "vip"])
    expect(availableByAccountId.settled).toEqual([
      "default",
      " vip ",
      "default",
    ])
  })

  it("returns the current map when settled exclusions need no repair", () => {
    const settledGroups = ["vip", "default"]
    const unresolvedGroups = ["legacy"]
    const current = {
      settled: settledGroups,
      unresolved: unresolvedGroups,
    }

    const repaired = repairAllAccountGroupExclusions({
      current,
      availableByAccountId: {
        settled: [" default ", "vip", "vip"],
      },
      settledAccountIds: new Set(["settled"]),
    })

    expect(repaired).toBe(current)
    expect(repaired.settled).toBe(settledGroups)
    expect(repaired.unresolved).toBe(unresolvedGroups)
  })
})
