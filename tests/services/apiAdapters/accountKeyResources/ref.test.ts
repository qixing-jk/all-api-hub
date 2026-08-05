import { describe, expect, it } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  isAccountKeyResourceRef,
  isAccountKeyResourceRefFor,
  type AccountKeyResourceRef,
} from "~/services/apiAdapters/accountKeyResources/ref"

const REF: AccountKeyResourceRef = {
  accountId: "account-example",
  siteType: SITE_TYPES.OPENROUTER,
  scopeKey: "workspace-example",
  resourceId: "opaque-key-example",
}

describe("account key resource refs", () => {
  it("accepts a ref correlated to its saved account scope", () => {
    expect(
      isAccountKeyResourceRefFor(REF, {
        accountId: "account-example",
        siteType: SITE_TYPES.OPENROUTER,
        scopeKey: "workspace-example",
      }),
    ).toBe(true)
  })

  it("rejects malformed, whitespace-only, or cross-account refs", () => {
    expect(
      isAccountKeyResourceRefFor({ ...REF, accountId: "other-account" }, REF),
    ).toBe(false)
    expect(
      isAccountKeyResourceRefFor({ ...REF, scopeKey: "other-scope" }, REF),
    ).toBe(false)
    expect(isAccountKeyResourceRefFor({ ...REF, resourceId: "" }, REF)).toBe(
      false,
    )
    for (const field of [
      "accountId",
      "siteType",
      "scopeKey",
      "resourceId",
    ] as const) {
      expect(isAccountKeyResourceRef({ ...REF, [field]: "   " })).toBe(false)
    }
    expect(
      isAccountKeyResourceRefFor({ ...REF, siteType: SITE_TYPES.NEW_API }, REF),
    ).toBe(false)
    expect(isAccountKeyResourceRefFor([REF], REF)).toBe(false)
  })

  it("enforces every ref segment boundary without normalizing opaque values", () => {
    for (const [field, maximum] of [
      ["accountId", 512],
      ["siteType", 128],
      ["scopeKey", 2048],
      ["resourceId", 512],
    ] as const) {
      expect(
        isAccountKeyResourceRef({ ...REF, [field]: "x".repeat(maximum) }),
      ).toBe(true)
      expect(
        isAccountKeyResourceRef({
          ...REF,
          [field]: "x".repeat(maximum + 1),
        }),
      ).toBe(false)
    }

    const paddedOpaqueId = { ...REF, resourceId: " opaque-id " }
    expect(isAccountKeyResourceRef(paddedOpaqueId)).toBe(true)
    expect(paddedOpaqueId.resourceId).toBe(" opaque-id ")
  })
})
