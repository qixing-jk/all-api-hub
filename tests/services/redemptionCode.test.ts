import { describe, expect, it } from "vitest"

import {
  extractRedemptionCodesFromText,
  isPossibleRedemptionCode,
  REDEMPTION_CODE_LENGTH,
} from "~/services/redemption/utils/redemptionCode"

describe("redemptionCode", () => {
  it("does not reinterpret the tail of a malformed PMRC code as a generic code", () => {
    const generic = "b".repeat(32)
    expect(
      extractRedemptionCodesFromText(`PMRC-${"a".repeat(32)} ${generic}`, {
        relaxedCharset: true,
      }),
    ).toEqual([generic])
  })
  it("deduplicates mixed-case reset cards in relaxed clipboard detection without extracting partial cards", () => {
    const code = "PMRC-ABCD-EFGH-JKMN-PQRS"
    const generic = "a".repeat(32)
    expect(
      extractRedemptionCodesFromText(
        `${code.toLowerCase()} (${code}) ${generic}`,
        { relaxedCharset: true },
      ),
    ).toEqual([code, generic])
    for (const invalid of [
      code + "X",
      "X" + code,
      code.replace("ABCD", "0O1I"),
      "PMRC-ABCD-EFGH",
      "PMRC-" + "a".repeat(27),
    ]) {
      expect(isPossibleRedemptionCode(invalid, { relaxedCharset: true })).toBe(
        false,
      )
      expect(
        extractRedemptionCodesFromText(invalid, { relaxedCharset: true }),
      ).toEqual([])
    }
    expect(
      extractRedemptionCodesFromText('"PMRC-' + "A".repeat(25) + '"', {
        relaxedCharset: true,
      }),
    ).toEqual([])
  })

  it("recognizes and normalizes native PM-Plan reset codes independently of generic relaxed validation", () => {
    const code = "PMRC-ABCD-EFGH-JKMN-PQRS"
    expect(isPossibleRedemptionCode(code)).toBe(true)
    expect(isPossibleRedemptionCode(code.toLowerCase())).toBe(true)
    expect(
      extractRedemptionCodesFromText(`兑换码：${code.toLowerCase()}，${code}`),
    ).toEqual([code])
  })

  it("rejects missing, wrong-length, and whitespace-containing codes", () => {
    expect(isPossibleRedemptionCode(undefined)).toBe(false)
    expect(isPossibleRedemptionCode(null)).toBe(false)
    expect(isPossibleRedemptionCode("")).toBe(false)
    expect(
      isPossibleRedemptionCode("a".repeat(REDEMPTION_CODE_LENGTH - 1)),
    ).toBe(false)
    expect(
      isPossibleRedemptionCode(
        `abcd ${"e".repeat(REDEMPTION_CODE_LENGTH - 5)}`,
      ),
    ).toBe(false)
  })

  it("accepts relaxed 32-character tokens while strict mode remains hex-only", () => {
    const relaxedOnly = "z".repeat(REDEMPTION_CODE_LENGTH)

    expect(isPossibleRedemptionCode(relaxedOnly)).toBe(false)
    expect(
      isPossibleRedemptionCode(relaxedOnly, { relaxedCharset: true }),
    ).toBe(true)
    expect(
      isPossibleRedemptionCode("a".repeat(REDEMPTION_CODE_LENGTH), {
        relaxedCharset: true,
      }),
    ).toBe(true)
  })

  it("extracts unique strict hex codes and ignores invalid matches", () => {
    const valid = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6"
    const text = [
      valid,
      valid.toUpperCase(),
      "g1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6",
      "too-short",
    ].join("\n")

    expect(extractRedemptionCodesFromText(text)).toEqual([
      valid,
      valid.toUpperCase(),
    ])
  })

  it("returns an empty list for blank input", () => {
    expect(extractRedemptionCodesFromText("")).toEqual([])
  })

  it("extracts relaxed codes from wrapped tokens and preserves strict matches", () => {
    const strict = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6"
    const relaxed = "z".repeat(REDEMPTION_CODE_LENGTH)
    const text = [
      `("${relaxed}")`,
      relaxed,
      `<${"y".repeat(REDEMPTION_CODE_LENGTH)}>`,
      strict,
      `invalid-${"x".repeat(REDEMPTION_CODE_LENGTH - 9)}`,
    ].join(" ")

    expect(
      extractRedemptionCodesFromText(text, { relaxedCharset: true }),
    ).toEqual([strict, relaxed, "y".repeat(REDEMPTION_CODE_LENGTH)])
  })
})
