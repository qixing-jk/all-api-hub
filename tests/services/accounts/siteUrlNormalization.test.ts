import { describe, expect, it } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  isAIHubMixSiteUrl,
  isSameAccountSiteOrigin,
  normalizeAccountSiteUrlForDuplicateCheck,
  normalizeAccountSiteUrlForManagedChannel,
  normalizeAccountSiteUrlForOriginKey,
  normalizeAccountSiteUrlForStorage,
} from "~/services/accounts/utils/siteUrlNormalization"
import { isCanonicalOpenRouterUrl } from "~/services/accountSiteDefinitions/identifiers"

describe("siteUrlNormalization", () => {
  it.each([
    ["https://openrouter.ai", true],
    [" https://openrouter.ai/settings/management-keys ", true],
    ["https://openrouter.ai:443/settings/management-keys", true],
    ["http://openrouter.ai", false],
    ["https://openrouter.ai:8443", false],
    ["https://www.openrouter.ai", false],
    ["https://api.openrouter.ai", false],
    ["blob:https://openrouter.ai/openrouter-object-placeholder", false],
    ["not a valid url", false],
    ["", false],
    ["   ", false],
  ])("recognizes canonical OpenRouter URL %s", (value, expected) => {
    expect(isCanonicalOpenRouterUrl(value)).toBe(expected)
  })

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

  it("matches AIHubMix account-site origins across main and console hostnames", () => {
    expect(
      isSameAccountSiteOrigin(
        {
          siteType: SITE_TYPES.AIHUBMIX,
          url: "https://console.aihubmix.com/dashboard",
        },
        {
          url: "https://aihubmix.com/statistics?tab=detail",
        },
      ),
    ).toBe(true)
  })

  it("keeps duplicate-check keys scannable and rejects invalid URLs", () => {
    expect(
      normalizeAccountSiteUrlForDuplicateCheck({
        url: "example.com/path",
      }),
    ).toBe("https://example.com")
    expect(
      normalizeAccountSiteUrlForDuplicateCheck({
        url: "not a valid url",
      }),
    ).toBeUndefined()
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

  it("canonicalizes OpenRouter account origins", () => {
    expect(
      normalizeAccountSiteUrlForStorage({
        siteType: SITE_TYPES.OPENROUTER,
        url: "https://openrouter.ai/settings/management-keys",
      }),
    ).toBe("https://openrouter.ai")
    expect(
      normalizeAccountSiteUrlForOriginKey({
        siteType: SITE_TYPES.OPENROUTER,
        url: "https://openrouter.ai/api/v1/key",
      }),
    ).toBe("https://openrouter.ai")
    expect(
      normalizeAccountSiteUrlForDuplicateCheck({
        siteType: SITE_TYPES.OPENROUTER,
        url: "https://openrouter.ai/settings/management-keys",
      }),
    ).toBe("https://openrouter.ai")
  })
})
