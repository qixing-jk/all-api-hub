import { describe, expect, it } from "vitest"

import {
  normalizeKimiOpenPlatformAuth,
  readJwtExpiry,
  readJwtSubject,
} from "~/services/kimiOpenPlatform/auth"
import { resolveKimiOpenPlatformDeployment } from "~/services/kimiOpenPlatform/deployments"

describe("Kimi auth hints", () => {
  it.each([
    "plain-token",
    "header.not-base64.signature",
    `header.${btoa("null")}.signature`,
    `header.${btoa("[]")}.signature`,
  ])("ignores unreadable claims %s", (token) => {
    expect(readJwtExpiry(token)).toBeUndefined()
    expect(readJwtSubject(token)).toBeUndefined()
  })
  it.each([
    null,
    [],
    {},
    { refreshToken: "refresh", organizationId: 123 },
    { refreshToken: " ", organizationId: "org" },
  ])("drops incomplete persisted auth %j", (auth) => {
    expect(normalizeKimiOpenPlatformAuth(auth)).toBeUndefined()
  })
  it("trims credential fields and drops nonfinite expiry", () => {
    expect(
      normalizeKimiOpenPlatformAuth({
        refreshToken: " refresh ",
        organizationId: " org ",
        tokenExpiresAt: Infinity,
      }),
    ).toEqual({ refreshToken: "refresh", organizationId: "org" })
  })
  it.each(["invalid-url", "https://platform.kimi.ai.attacker.invalid"])(
    "rejects an unknown deployment %s",
    (url) => {
      expect(resolveKimiOpenPlatformDeployment(url)).toBeNull()
    },
  )
})
