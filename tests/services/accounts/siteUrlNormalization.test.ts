import { describe, expect, it } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  isAIHubMixSiteUrl,
  normalizeAccountSiteUrlForManagedChannel,
  normalizeAccountSiteUrlForOriginKey,
  normalizeAccountSiteUrlForStorage,
} from "~/services/accounts/utils/siteUrlNormalization"

describe("siteUrlNormalization", () => {
  it("recognizes supported AIHubMix hostnames", () => {
    expect(isAIHubMixSiteUrl("aihubmix.com")).toBe(true)
    expect(isAIHubMixSiteUrl("https://www.aihubmix.com/statistics")).toBe(true)
    expect(isAIHubMixSiteUrl("https://console.aihubmix.com")).toBe(true)
  })

  it("rejects invalid and unsupported URLs", () => {
    expect(isAIHubMixSiteUrl("https://[invalid-url")).toBe(false)
    expect(isAIHubMixSiteUrl("https://example.com")).toBe(false)
  })

  it("canonicalizes AIHubMix storage and origin keys", () => {
    expect(
      normalizeAccountSiteUrlForStorage({
        siteType: SITE_TYPES.AIHUBMIX,
        url: "https://aihubmix.com/statistics",
      }),
    ).toBe("https://console.aihubmix.com")
    expect(
      normalizeAccountSiteUrlForOriginKey({
        url: "https://aihubmix.com/statistics",
      }),
    ).toBe("https://console.aihubmix.com")
  })

  it("resolves AIHubMix managed-channel upstreams to the API origin", () => {
    expect(
      normalizeAccountSiteUrlForManagedChannel({
        siteType: SITE_TYPES.AIHUBMIX,
        url: "https://console.aihubmix.com",
      }),
    ).toBe("https://aihubmix.com")
    expect(
      normalizeAccountSiteUrlForManagedChannel({
        url: "https://www.aihubmix.com/statistics",
      }),
    ).toBe("https://aihubmix.com")
  })

  it("preserves non-AIHubMix storage URLs and origin keys", () => {
    expect(
      normalizeAccountSiteUrlForStorage({
        siteType: SITE_TYPES.NEW_API,
        url: " https://example.com/path ",
      }),
    ).toBe("https://example.com/path")
    expect(
      normalizeAccountSiteUrlForOriginKey({
        siteType: SITE_TYPES.NEW_API,
        url: "https://example.com/path?tab=1",
      }),
    ).toBe("https://example.com")
    expect(
      normalizeAccountSiteUrlForManagedChannel({
        siteType: SITE_TYPES.NEW_API,
        url: " https://example.com/path ",
      }),
    ).toBe("https://example.com/path")
  })
})
