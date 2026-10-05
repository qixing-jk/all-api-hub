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
    "https://api.laozhang.ai",
    "https://api2.laozhang.ai",
    "https://api-vip.laozhang.ai",
    "https://api-cf.laozhang.ai",
  ])(
    "compares LaoZhang alias %s while retaining its storage and export origin",
    (url) => {
      expect(
        isSameAccountSiteOrigin(
          { siteType: SITE_TYPES.LAOZHANG, url },
          { url: "https://api.laozhang.ai/account/profile" },
        ),
      ).toBe(true)
      expect(
        normalizeAccountSiteProfileUrlForStorage({
          siteType: SITE_TYPES.LAOZHANG,
          url,
        }),
      ).toBe(url)
      expect(
        normalizeAccountSiteProfileUrlForManagedChannel({
          siteType: SITE_TYPES.LAOZHANG,
          url,
        }),
      ).toBe(url)
      expect(normalizeAccountSiteProfileUrlForOriginKey({ url })).toBe(
        "https://api.laozhang.ai",
      )
    },
  )
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

  // Split-origin deployments serve their API on a different origin than the
  // dashboard, so anything exported for an external caller needs the API origin.
  // See .scratch/ai-router-adaptation/research.md.
  it("resolves split-origin deployments to the API origin for external callers", () => {
    expect(
      normalizeAccountSiteProfileUrlForManagedChannel({
        siteType: SITE_TYPES.SUB2API,
        url: "https://ai-router.dev",
      }),
    ).toBe("https://api.ai-router.dev")
    expect(
      normalizeAccountSiteProfileUrlForManagedChannel({
        siteType: SITE_TYPES.SUB2API,
        url: " https://www.ai-router.dev/dashboard ",
      }),
    ).toBe("https://api.ai-router.dev")
    expect(
      normalizeAccountSiteProfileUrlForManagedChannel({
        url: "https://ai-router.dev/keys",
      }),
    ).toBe("https://api.ai-router.dev")
  })

  it("keeps unregistered Sub2API deployments on the stored URL", () => {
    expect(
      normalizeAccountSiteProfileUrlForManagedChannel({
        siteType: SITE_TYPES.SUB2API,
        url: " https://sub2.example.com/path ",
      }),
    ).toBe("https://sub2.example.com/path")
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
