import { describe, expect, it } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  isSameAccountSiteOrigin,
  normalizeAccountSiteProfileUrlForDuplicateCheck,
  normalizeAccountSiteProfileUrlForManagedChannel,
  normalizeAccountSiteProfileUrlForOriginKey,
  normalizeAccountSiteProfileUrlForStorage,
} from "~/services/accounts/accountSiteProfile/urls"
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

  it("canonicalizes AIHubMix storage and origin keys", () => {
    expect(
      normalizeAccountSiteProfileUrlForStorage({
        siteType: SITE_TYPES.AIHUBMIX,
        url: "https://aihubmix.com/statistics",
      }),
    ).toBe("https://console.aihubmix.com")
    expect(
      normalizeAccountSiteProfileUrlForOriginKey({
        url: "https://aihubmix.com/statistics",
      }),
    ).toBe("https://console.aihubmix.com")
  })

  it("resolves AIHubMix managed-channel upstreams to the API origin", () => {
    expect(
      normalizeAccountSiteProfileUrlForManagedChannel({
        siteType: SITE_TYPES.AIHUBMIX,
        url: "https://console.aihubmix.com",
      }),
    ).toBe("https://aihubmix.com")
    expect(
      normalizeAccountSiteProfileUrlForManagedChannel({
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
      normalizeAccountSiteProfileUrlForDuplicateCheck({
        url: "example.com/path",
      }),
    ).toBe("https://example.com")
    expect(
      normalizeAccountSiteProfileUrlForDuplicateCheck({
        url: "not a valid url",
      }),
    ).toBeUndefined()
  })

  it("preserves non-AIHubMix storage URLs and origin keys", () => {
    expect(
      normalizeAccountSiteProfileUrlForStorage({
        siteType: SITE_TYPES.NEW_API,
        url: " https://example.com/path ",
      }),
    ).toBe("https://example.com/path")
    expect(
      normalizeAccountSiteProfileUrlForOriginKey({
        siteType: SITE_TYPES.NEW_API,
        url: "https://example.com/path?tab=1",
      }),
    ).toBe("https://example.com")
    expect(
      normalizeAccountSiteProfileUrlForManagedChannel({
        siteType: SITE_TYPES.NEW_API,
        url: " https://example.com/path ",
      }),
    ).toBe("https://example.com/path")
  })

  it("canonicalizes OpenRouter account origins", () => {
    expect(
      normalizeAccountSiteProfileUrlForStorage({
        siteType: SITE_TYPES.OPENROUTER,
        url: "https://openrouter.ai/settings/management-keys",
      }),
    ).toBe("https://openrouter.ai")
    expect(
      normalizeAccountSiteProfileUrlForOriginKey({
        siteType: SITE_TYPES.OPENROUTER,
        url: "https://openrouter.ai/api/v1/key",
      }),
    ).toBe("https://openrouter.ai")
    expect(
      normalizeAccountSiteProfileUrlForDuplicateCheck({
        siteType: SITE_TYPES.OPENROUTER,
        url: "https://openrouter.ai/settings/management-keys",
      }),
    ).toBe("https://openrouter.ai")
  })
})
