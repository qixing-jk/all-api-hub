import { describe, expect, it } from "vitest"

import { deriveGroupAvailability } from "~/features/ModelList/groupAvailability"

describe("deriveGroupAvailability", () => {
  it("keeps token and runtime-key scopes isolated while unioning account groups in encounter order", () => {
    const result = deriveGroupAvailability([
      {
        accountId: "account",
        sourceId: "token:1",
        usableGroups: ["vip", "default"],
        groupRatios: { vip: 2, default: 1 },
      },
      {
        accountId: "account",
        sourceId: "runtime-key:1",
        usableGroups: ["free", "default"],
        groupRatios: { free: 0, default: 1 },
      },
      {
        accountId: "other",
        sourceId: "token:2",
        usableGroups: ["private"],
        groupRatios: { private: 3 },
      },
    ])

    expect(result.availableGroupsBySourceId).toEqual({
      "token:1": ["vip", "default"],
      "runtime-key:1": ["free", "default"],
      "token:2": ["private"],
    })
    expect(result.availableAccountGroupsByAccountId.account).toEqual([
      "vip",
      "default",
      "free",
    ])
    expect(result.availableAccountGroupsByAccountId.other).toEqual(["private"])
    expect(result.availableAccountGroupOptionsByAccountId.account).toEqual([
      { name: "vip", ratio: 2 },
      { name: "default", ratio: 1 },
      { name: "free", ratio: 0 },
    ])
  })

  it("normalizes duplicate names without changing first encounter order", () => {
    const result = deriveGroupAvailability([
      {
        accountId: "a",
        sourceId: "s",
        usableGroups: [" vip ", "", "default", "vip"],
        groupRatios: { vip: 2, default: 1 },
      },
      {
        accountId: "a",
        sourceId: "s",
        usableGroups: ["default ", "free", "  "],
        groupRatios: { default: 1, free: 0 },
      },
    ])
    expect(result.availableGroupsBySourceId.s).toEqual([
      "vip",
      "default",
      "free",
    ])
    expect(result.availableAccountGroupOptionsByAccountId.a).toEqual([
      { name: "vip", ratio: 2 },
      { name: "default", ratio: 1 },
      { name: "free", ratio: 0 },
    ])
  })

  it.each([
    [2, 3, 2],
    [undefined, 2, 2],
    [2, undefined, 2],
    [NaN, 2, 2],
    [2, Infinity, 2],
    [-Infinity, 2, 2],
  ])(
    "keeps conflicting or unavailable ratios unknown: %s, %s, %s",
    (...ratios) => {
      const result = deriveGroupAvailability(
        ratios.map((ratio, index) => {
          const groupRatios: Record<string, number> =
            ratio === undefined ? {} : { vip: ratio }
          return {
            accountId: "a",
            sourceId: `s:${index}`,
            usableGroups: ["vip"],
            groupRatios,
          }
        }),
      )
      expect(result.availableAccountGroupOptionsByAccountId.a).toEqual([
        { name: "vip" },
      ])
    },
  )

  it("retains empty scopes and does not promote priced-only groups into access", () => {
    const result = deriveGroupAvailability([
      {
        accountId: "a",
        sourceId: "s",
        usableGroups: [],
        groupRatios: { vip: 1 },
      },
    ])
    expect(result.availableGroupsBySourceId.s).toEqual([])
    expect(result.availableAccountGroupsByAccountId.a).toEqual([])
    expect(result.availableAccountGroupOptionsByAccountId.a).toEqual([])
  })

  it("preserves prototype-like account, source, and group names", () => {
    const result = deriveGroupAvailability([
      {
        accountId: "__proto__",
        sourceId: "constructor",
        usableGroups: ["__proto__"],
        groupRatios: { ["__proto__"]: 0 },
      },
    ])
    expect(result.availableGroupsBySourceId.constructor).toEqual(["__proto__"])
    expect(result.availableAccountGroupOptionsByAccountId["__proto__"]).toEqual(
      [{ name: "__proto__", ratio: 0 }],
    )
  })
})
