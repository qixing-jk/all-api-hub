import { createHash } from "node:crypto"
import { afterEach, describe, expect, it, vi } from "vitest"

import { solveSha256PrefixBase36LeadingZeros } from "~/services/securityVerification/pow/sha256PrefixBase36LeadingZeros"

describe("SHA-256 UTF-8 prefix plus base36 nonce with leading zero bits", () => {
  afterEach(() => vi.restoreAllMocks())

  it("honors cancellation before spending work", async () => {
    const controller = new AbortController()
    const reason = new Error("caller cancelled")
    controller.abort(reason)
    const hashing = vi.spyOn(crypto.subtle, "digest")
    await expect(
      solveSha256PrefixBase36LeadingZeros({
        prefix: "fixture:",
        leadingZeroBits: 16,
        deadline: Date.now() + 1000,
        abortSignal: controller.signal,
      }),
    ).rejects.toBe(reason)
    expect(hashing).not.toHaveBeenCalled()
  })

  it("rejects an already expired challenge before hashing", async () => {
    const hashing = vi.spyOn(crypto.subtle, "digest")
    await expect(
      solveSha256PrefixBase36LeadingZeros({
        prefix: "fixture:",
        leadingZeroBits: 16,
        deadline: Date.now() - 1,
      }),
    ).rejects.toMatchObject({ name: "TimeoutError" })
    expect(hashing).not.toHaveBeenCalled()
  })

  it.each(["cancelled", "expired"])(
    "does not return a solution that became %s during hashing",
    async (outcome) => {
      const controller = new AbortController()
      const reason = new Error("caller cancelled during hashing")
      const deadline = Date.now() + 1000
      vi.spyOn(crypto.subtle, "digest").mockImplementation(async () => {
        if (outcome === "cancelled") controller.abort(reason)
        else vi.spyOn(Date, "now").mockReturnValue(deadline)
        return new ArrayBuffer(32)
      })
      const pending = solveSha256PrefixBase36LeadingZeros({
        prefix: "fixture:",
        leadingZeroBits: 16,
        deadline,
        abortSignal: controller.signal,
      })
      if (outcome === "cancelled") await expect(pending).rejects.toBe(reason)
      else await expect(pending).rejects.toMatchObject({ name: "TimeoutError" })
    },
  )

  it("yields execution so the caller can cancel unsolved work", async () => {
    const controller = new AbortController()
    vi.spyOn(crypto.subtle, "digest").mockResolvedValue(
      new Uint8Array(32).fill(255).buffer,
    )
    const reason = new Error("cancelled from another task")
    const timer = setTimeout(() => controller.abort(reason), 0)
    try {
      await expect(
        solveSha256PrefixBase36LeadingZeros({
          prefix: "fixture:",
          leadingZeroBits: 16,
          deadline: Date.now() + 1000,
          abortSignal: controller.signal,
        }),
      ).rejects.toBe(reason)
    } finally {
      clearTimeout(timer)
    }
  })

  it("preserves hashing failures for the calling adapter to classify", async () => {
    const failure = new Error("crypto unavailable")
    vi.spyOn(crypto.subtle, "digest").mockRejectedValue(failure)
    await expect(
      solveSha256PrefixBase36LeadingZeros({
        prefix: "fixture:",
        leadingZeroBits: 16,
        deadline: Date.now() + 1000,
      }),
    ).rejects.toBe(failure)
  })

  it.each([0, 1, 15, 17, 24, NaN])(
    "rejects unsupported %s-bit work before hashing",
    async (bits) => {
      const hashing = vi
        .spyOn(crypto.subtle, "digest")
        .mockResolvedValue(new ArrayBuffer(32))
      await expect(
        solveSha256PrefixBase36LeadingZeros({
          prefix: "fixture:",
          deadline: Date.now() + 1000,
          // @ts-expect-error JavaScript callers and runtime input still need validation.
          leadingZeroBits: bits,
        }),
      ).rejects.toBeInstanceOf(RangeError)
      expect(hashing).not.toHaveBeenCalled()
    },
  )

  it.each([
    { prefix: "" },
    { prefix: "x".repeat(257) },
    { deadline: NaN },
    { deadline: Infinity },
  ])("rejects unbounded or malformed solver inputs: %j", async (invalid) => {
    const hashing = vi
      .spyOn(crypto.subtle, "digest")
      .mockResolvedValue(new ArrayBuffer(32))
    await expect(
      solveSha256PrefixBase36LeadingZeros({
        prefix: "fixture:",
        leadingZeroBits: 16,
        deadline: Date.now() + 1000,
        ...invalid,
      }),
    ).rejects.toBeInstanceOf(RangeError)
    expect(hashing).not.toHaveBeenCalled()
  })
  it.each([
    [
      "sha256-base36-0:",
      "nei",
      "0000a9c5c97f8acf013cdd6051bae646553e7667cc4c92dad5e85c00e4cc37da",
    ],
    [
      "\u9a8c\u8bc1\u524d\u7f00:",
      "ibe",
      "0000f143b0af04f812af7d3b1f006ad7bd2b67be3d02ffc8ccc7078966d66a0c",
    ],
  ])(
    "solves the independently computed vector for %s",
    async (prefix, expectedNonce, expectedDigest) => {
      // Fixed vectors computed with Python hashlib, independent of Web Crypto.
      const nonce = await solveSha256PrefixBase36LeadingZeros({
        prefix,
        leadingZeroBits: 16,
        deadline: Date.now() + 45_000,
      })
      expect(nonce).toBe(expectedNonce)
      expect(
        createHash("sha256")
          .update(prefix + nonce)
          .digest("hex"),
      ).toBe(expectedDigest)
    },
  )
})
