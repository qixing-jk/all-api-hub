import { describe, expect, it } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  createManagedUpstreamResourceRef,
  getManagedUpstreamResourceRefKey,
  normalizeManagedUpstreamResourceScopeKey,
} from "~/types/managedUpstreamResource"

describe("managed upstream resource contracts", () => {
  it("builds deterministic composite keys from non-secret ref fields", () => {
    const ref = createManagedUpstreamResourceRef({
      managedSiteType: SITE_TYPES.AXON_HUB,
      scopeKey: "https://admin.example.invalid",
      resourceId: "provider/native-id",
    })

    expect(getManagedUpstreamResourceRefKey(ref)).toBe(
      "axonhub:https%3A%2F%2Fadmin.example.invalid:provider%2Fnative-id",
    )
    expect(getManagedUpstreamResourceRefKey(ref)).toBe(
      getManagedUpstreamResourceRefKey({ ...ref }),
    )
    expect(getManagedUpstreamResourceRefKey(ref)).not.toContain("sk-")
  })

  it("normalizes numeric-like ids to stable string resource ids at ref creation", () => {
    const ref = createManagedUpstreamResourceRef({
      managedSiteType: SITE_TYPES.NEW_API,
      scopeKey: "https://admin.example.invalid",
      resourceId: 123,
    })

    expect(ref.resourceId).toBe("123")
  })

  it("normalizes scope keys at the shared resource-ref boundary", () => {
    expect(
      normalizeManagedUpstreamResourceScopeKey(
        " https://admin.example.invalid/path?token=private ",
      ),
    ).toBe("https://admin.example.invalid")
    expect(normalizeManagedUpstreamResourceScopeKey(" custom-scope/// ")).toBe(
      "custom-scope",
    )

    const ref = createManagedUpstreamResourceRef({
      managedSiteType: SITE_TYPES.NEW_API,
      scopeKey: " https://admin.example.invalid/path ",
      resourceId: 123,
    })

    expect(ref.scopeKey).toBe("https://admin.example.invalid")
  })
})
