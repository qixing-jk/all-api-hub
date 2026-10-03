import { describe, expect, it } from "vitest"

import { md5HexUtf8 } from "~/services/apiService/grsai/md5"
import { computeGrsaiSignature } from "~/services/apiService/grsai/signature"

import {
  GRSAI_SIGNATURE_MATERIAL,
  GRSAI_SIGNATURE_VECTORS,
} from "./signatureFixture"

describe("grsai request signature", () => {
  describe("md5", () => {
    it.each([
      ["", "d41d8cd98f00b204e9800998ecf8427e"],
      ["abc", "900150983cd24fb0d6963f7d28e17f72"],
      [
        "The quick brown fox jumps over the lazy dog",
        "9e107d9d372bb6826bd81d3542a419d6",
      ],
      // Longer than one 64-byte block, and multi-byte, to cover padding and
      // UTF-8 encoding rather than only the ASCII fast path.
      [
        "The quick brown fox jumps over the lazy dog.".repeat(4),
        "a1299363b9188a40cf9524e7490ff1eb",
      ],
      ["中文", "a7bac2239fcdcb3a067903d8077c4a07"],
    ])("hashes %j", (input, expected) => {
      expect(md5HexUtf8(input)).toBe(expected)
    })
  })

  describe("computeGrsaiSignature", () => {
    it("reproduces the xtx the console itself computed", async () => {
      for (const vector of GRSAI_SIGNATURE_VECTORS) {
        await expect(
          computeGrsaiSignature(GRSAI_SIGNATURE_MATERIAL, vector.body),
        ).resolves.toBe(vector.xtx)
      }
    })

    it("signs an empty body with the empty payload string", async () => {
      await expect(
        computeGrsaiSignature(GRSAI_SIGNATURE_MATERIAL, {}),
      ).resolves.toBe("f265ddded48ff8ee3876ba5105a8bac4")
    })

    it("is independent of property insertion order", async () => {
      const ordered = await computeGrsaiSignature(GRSAI_SIGNATURE_MATERIAL, {
        page: 1,
        size: 10,
      })
      const reversed = await computeGrsaiSignature(GRSAI_SIGNATURE_MATERIAL, {
        size: 10,
        page: 1,
      })

      expect(reversed).toBe(ordered)
    })

    it("distinguishes values that only differ by JSON type", async () => {
      const asNumber = await computeGrsaiSignature(GRSAI_SIGNATURE_MATERIAL, {
        page: 1,
      })
      const asString = await computeGrsaiSignature(GRSAI_SIGNATURE_MATERIAL, {
        page: "1",
      })

      expect(asString).not.toBe(asNumber)
    })

    it("skips undefined properties, matching JSON.stringify", async () => {
      const withUndefined = await computeGrsaiSignature(
        GRSAI_SIGNATURE_MATERIAL,
        { page: 1, size: 10, apiKey: undefined },
      )

      expect(withUndefined).toBe("dcfbcf00f4ab44131ec633d3fd585fa6")
    })

    it("rejects material that cannot be decoded", async () => {
      await expect(
        computeGrsaiSignature(
          { ...GRSAI_SIGNATURE_MATERIAL, ra1: "not-base64!!!" },
          { page: 1 },
        ),
      ).rejects.toThrowError()
    })
  })
})
