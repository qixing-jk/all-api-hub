import { describe, expect, it } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  coerceAccountIdentity,
  normalizeAccountIdentity,
  resolveStoredAccountUserIdentity,
} from "~/services/accounts/accountIdentity"

describe("accountIdentity", () => {
  it("normalizes string and numeric identities to non-empty strings", () => {
    expect(normalizeAccountIdentity(" user-name ")).toBe("user-name")
    expect(normalizeAccountIdentity("new-api-user-123")).toBe(
      "new-api-user-123",
    )
    expect(normalizeAccountIdentity(42)).toBe("42")
  })

  it("rejects empty, non-finite, and unsupported identity values", () => {
    expect(normalizeAccountIdentity("   ")).toBeNull()
    expect(normalizeAccountIdentity(Number.NaN)).toBeNull()
    expect(normalizeAccountIdentity(Number.POSITIVE_INFINITY)).toBeNull()
    expect(normalizeAccountIdentity({ id: 1 })).toBeNull()
    expect(coerceAccountIdentity(null, "")).toBe("")
  })

  it("resolves stored user identities from the site-specific identity field", () => {
    expect(
      resolveStoredAccountUserIdentity(
        { id: 42, username: "new-api-user" },
        SITE_TYPES.NEW_API,
      ),
    ).toEqual({
      userId: "42",
      user: { id: 42, username: "new-api-user" },
    })

    expect(
      resolveStoredAccountUserIdentity(
        { username: "aihubmix-user", display_name: "AIHubMix User" },
        SITE_TYPES.AIHUBMIX,
      ),
    ).toEqual({
      userId: "aihubmix-user",
      user: { username: "aihubmix-user", display_name: "AIHubMix User" },
    })
  })

  it("rejects stored user payloads without the site-specific identity field", () => {
    expect(
      resolveStoredAccountUserIdentity(
        { username: "new-api-user" },
        SITE_TYPES.NEW_API,
      ),
    ).toBeNull()
    expect(
      resolveStoredAccountUserIdentity({ id: 42 }, SITE_TYPES.AIHUBMIX),
    ).toBeNull()
    expect(resolveStoredAccountUserIdentity([], SITE_TYPES.NEW_API)).toBeNull()
  })
})
