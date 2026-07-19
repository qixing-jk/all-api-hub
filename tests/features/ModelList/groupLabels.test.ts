import { describe, expect, it } from "vitest"

import {
  formatGroupLabelFromRatios,
  resolveKnownGroupRatio,
} from "~/features/ModelList/groupLabels"

describe("group labels", () => {
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
