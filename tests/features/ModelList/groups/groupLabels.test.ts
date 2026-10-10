import { describe, expect, it } from "vitest"

import {
  formatGroupLabelFromRatios,
  resolveKnownGroupRatio,
} from "~/features/ModelList/groups/groupLabels"

describe("group labels", () => {
  it("looks up the display name while retaining native identity for ratio lookup", () => {
    expect(
      formatGroupLabelFromRatios(
        "13",
        { "13": 1.75 },
        { "13": "max-stable(only for CC)" },
      ),
    ).toBe("max-stable(only for CC) (1.75x)")
    expect(formatGroupLabelFromRatios("13", {}, { "13": "max-stable" })).toBe(
      "max-stable",
    )
  })
  it("leaves a group unformatted when its ratio is unknown", () => {
    expect(resolveKnownGroupRatio("vip", {})).toBeUndefined()
    expect(formatGroupLabelFromRatios("vip", {})).toBe("vip")
  })

  it("preserves a finite zero ratio", () => {
    expect(resolveKnownGroupRatio("free", { free: 0 })).toBe(0)
    expect(formatGroupLabelFromRatios("free", { free: 0 })).toBe("free (0x)")
  })

  it("treats non-finite ratios as unknown", () => {
    expect(resolveKnownGroupRatio("vip", { vip: Number.NaN })).toBeUndefined()
    expect(
      formatGroupLabelFromRatios("vip", { vip: Number.POSITIVE_INFINITY }),
    ).toBe("vip")
  })
})
