import { describe, expect, it } from "vitest"

import {
  extractRedemptionCodesFromText,
  isPossibleRedemptionCode,
  REDEMPTION_CODE_LENGTH,
} from "~/utils/redemptionAssist"

describe("redemptionAssist (relaxed validation)", () => {
  it("accepts any 32-char non-whitespace token when relaxedCharset is enabled", () => {
    const code = `${"G".repeat(30)}_-`
    expect(code).toHaveLength(REDEMPTION_CODE_LENGTH)
    expect(isPossibleRedemptionCode(code)).toBe(false)
    expect(isPossibleRedemptionCode(code, { relaxedCharset: true })).toBe(true)
  })

  it("extracts a relaxed code token from text", () => {
    const code = `${"G".repeat(30)}_-`
    const input = `Your code: "${code}", please redeem.`
    expect(
      extractRedemptionCodesFromText(input, { relaxedCharset: true }),
    ).toEqual([code])
  })
})
