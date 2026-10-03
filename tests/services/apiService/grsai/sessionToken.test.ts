import { describe, expect, it } from "vitest"

import {
  isGrsaiSessionTokenExpired,
  looksLikeGrsaiOpenApiToken,
  readGrsaiSessionTokenExpiry,
} from "~/services/apiService/grsai/sessionToken"

/** Builds a JWT-shaped string; the signature is never inspected locally. */
const jwt = (payload: unknown, signature = "signature"): string =>
  [
    Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
      "base64url",
    ),
    Buffer.from(JSON.stringify(payload)).toString("base64url"),
    signature,
  ].join(".")

describe("grsai session token", () => {
  describe("readGrsaiSessionTokenExpiry", () => {
    it("reads the expiry the console stamps into the token", () => {
      const expiresAtSeconds = 1_793_215_731

      expect(readGrsaiSessionTokenExpiry(jwt({ exp: expiresAtSeconds }))).toBe(
        expiresAtSeconds * 1000,
      )
    })

    it("decodes base64url payloads with url-safe characters", () => {
      // A payload long enough to make the encoder emit `-` or `_`.
      const payload = { exp: 1_793_215_731, iss: "????>>>>", value: { v: 1 } }

      expect(readGrsaiSessionTokenExpiry(jwt(payload))).toBe(1_793_215_731_000)
    })

    it.each([
      ["a plain token", "b59cb510dc1c4171898fc733bbb2d174"],
      ["an empty string", ""],
      ["a two-part value", "header.payload"],
      [
        "a payload that is not JSON",
        ["aGVhZGVy", Buffer.from("not json").toString("base64url"), "sig"].join(
          ".",
        ),
      ],
      ["a payload without exp", jwt({ iss: "x" })],
      ["a non-numeric exp", jwt({ exp: "soon" })],
    ])("reports no expiry for %s", (_label, token) => {
      expect(readGrsaiSessionTokenExpiry(token)).toBeUndefined()
    })

    it("never throws on a malformed payload", () => {
      expect(() => readGrsaiSessionTokenExpiry("!!!.???.###")).not.toThrow()
    })
  })

  describe("isGrsaiSessionTokenExpired", () => {
    it("compares the stamped expiry against the supplied clock", () => {
      const token = jwt({ exp: 1000 })

      expect(isGrsaiSessionTokenExpired(token, 999_000)).toBe(false)
      expect(isGrsaiSessionTokenExpired(token, 1_001_000)).toBe(true)
    })

    it("treats an unreadable expiry as not expired", () => {
      // A token we cannot read must not be declared dead: the console is the
      // only authority on whether it still authenticates.
      expect(isGrsaiSessionTokenExpired("opaque", Date.now())).toBe(false)
    })
  })

  describe("looksLikeGrsaiOpenApiToken", () => {
    it("recognizes the 32-character token the user-info page displays", () => {
      expect(
        looksLikeGrsaiOpenApiToken("b59cb510dc1c4171898fc733bbb2d174"),
      ).toBe(true)
    })

    it.each([
      ["a session JWT", jwt({ exp: 1000 })],
      ["a shorter hex string", "b59cb510dc1c4171"],
      ["a 32-character non-hex value", "z".repeat(32)],
      ["an empty string", ""],
    ])("does not claim %s", (_label, value) => {
      expect(looksLikeGrsaiOpenApiToken(value)).toBe(false)
    })
  })
})
