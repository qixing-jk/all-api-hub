import { describe, expect, it } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  isAddAccountPrefill,
  isSponsorAddAccountPrefill,
  normalizeAddAccountPrefill,
} from "~/features/AccountManagement/sponsors/addAccountPrefill"
import { BOOKMARK_IMPORT_ADD_ACCOUNT_PREFILL_SOURCE } from "~/features/AccountManagement/sponsors/types"

describe("add-account prefill validation", () => {
  it("accepts live legacy envelopes and rejects expired envelopes", () => {
    const prefill = {
      source: BOOKMARK_IMPORT_ADD_ACCOUNT_PREFILL_SOURCE,
      siteUrl: "https://prefill.example.invalid",
    }
    expect(
      normalizeAddAccountPrefill({ createdAt: Date.now(), prefill }),
    ).toEqual(prefill)
    expect(
      normalizeAddAccountPrefill({
        createdAt: Date.now() - 5 * 60 * 1000 - 1,
        prefill,
      }),
    ).toBeNull()
  })

  it("rejects malformed sponsor prefill values before opening account setup", () => {
    const prefill = {
      source: "sponsor",
      sponsorId: "supported-provider",
      siteType: SITE_TYPES.NEW_API,
      siteUrl: "https://supported.example.test",
    }

    expect(isSponsorAddAccountPrefill(null)).toBe(false)
    expect(
      isSponsorAddAccountPrefill({
        createdAt: Date.now(),
        prefill,
      }),
    ).toBe(false)
    expect(
      isSponsorAddAccountPrefill({
        source: "bookmark",
        sponsorId: "supported-provider",
        siteType: SITE_TYPES.NEW_API,
        siteUrl: "https://supported.example.test",
      }),
    ).toBe(false)
    expect(
      isSponsorAddAccountPrefill({
        source: "sponsor",
        sponsorId: "supported-provider",
        siteType: SITE_TYPES.UNKNOWN,
        siteUrl: "https://supported.example.test",
      }),
    ).toBe(false)
    expect(
      isSponsorAddAccountPrefill({
        source: "sponsor",
        sponsorId: "supported-provider",
        siteType: SITE_TYPES.NEW_API,
        siteUrl: "https://[invalid",
      }),
    ).toBe(false)
  })

  it("accepts bookmark-import add-account prefill and normalizes URLs to origin", () => {
    const prefill = {
      source: BOOKMARK_IMPORT_ADD_ACCOUNT_PREFILL_SOURCE,
      siteUrl: "https://prefill.example.invalid/path?token=private",
    }

    expect(isAddAccountPrefill(prefill)).toBe(true)
    expect(isSponsorAddAccountPrefill(prefill)).toBe(false)
    expect(normalizeAddAccountPrefill(prefill)).toEqual({
      source: BOOKMARK_IMPORT_ADD_ACCOUNT_PREFILL_SOURCE,
      siteUrl: "https://prefill.example.invalid",
    })
    expect(
      isAddAccountPrefill({
        source: BOOKMARK_IMPORT_ADD_ACCOUNT_PREFILL_SOURCE,
        siteUrl: "javascript:alert(1)",
      }),
    ).toBe(false)
  })

  it("preserves provider defaults and rejects unsupported authentication", () => {
    const prefill = {
      source: "sponsor",
      sponsorId: "provider",
      siteType: SITE_TYPES.ANYROUTER,
      siteUrl: "https://anyrouter.top",
    }
    expect(normalizeAddAccountPrefill(prefill)?.authType).toBe("cookie")
    expect(
      normalizeAddAccountPrefill({ ...prefill, authType: "" })?.authType,
    ).toBe("cookie")
    expect(
      normalizeAddAccountPrefill({ ...prefill, authType: "unsupported" }),
    ).toBeNull()
    expect(
      normalizeAddAccountPrefill({
        source: BOOKMARK_IMPORT_ADD_ACCOUNT_PREFILL_SOURCE,
        siteType: SITE_TYPES.AIHUBMIX,
        siteUrl: "https://aihubmix.com/path",
      })?.siteUrl,
    ).toBe("https://console.aihubmix.com")
  })
})
