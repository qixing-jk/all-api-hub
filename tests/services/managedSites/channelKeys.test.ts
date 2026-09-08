import { describe, expect, it } from "vitest"

import { hasUsableManagedSiteChannelKey } from "~/services/managedSites/utils/channelKeys"

describe("managed channel keys", () => {
  it("detects when a managed-site key is directly usable", () => {
    expect(hasUsableManagedSiteChannelKey("sk-live-secret")).toBe(true)
    expect(hasUsableManagedSiteChannelKey("  sk-live-secret  ")).toBe(true)
    expect(hasUsableManagedSiteChannelKey("sk-mask***")).toBe(false)
    expect(hasUsableManagedSiteChannelKey("   ")).toBe(false)
    expect(hasUsableManagedSiteChannelKey(undefined)).toBe(false)
    expect(hasUsableManagedSiteChannelKey(null)).toBe(false)
  })

  it("reuses shared masked-key detection for managed-site channel keys", () => {
    expect(hasUsableManagedSiteChannelKey("sk-********")).toBe(false)

    expect(hasUsableManagedSiteChannelKey("AIza-real-provider-key")).toBe(true)

    expect(hasUsableManagedSiteChannelKey("")).toBe(false)
  })
})
