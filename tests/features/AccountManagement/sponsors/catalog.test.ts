import { describe, expect, it } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  normalizeSponsorCatalog,
  selectSponsorRecommendations,
} from "~/features/AccountManagement/sponsors/catalog"
import { SPONSOR_RECOMMENDATION_SURFACES } from "~/features/AccountManagement/sponsors/constants"
import {
  SPONSOR_CATALOG_SOURCES,
  SPONSOR_SUPPORT_STATUS,
  type SponsorRecommendation,
} from "~/features/AccountManagement/sponsors/types"
import { AuthTypeEnum } from "~/types"
import { atIndex } from "~~/tests/test-utils/indexedAccess"

const now = Date.parse("2026-06-11T00:00:00.000Z")

describe("sponsor catalog v5 normalization", () => {
  it("rejects legacy V4 payloads in the current runtime parser", () => {
    const result = normalizeSponsorCatalog(
      {
        schemaVersion: 4,
        items: [],
      },
      {
        locale: "en",
        now,
        source: SPONSOR_CATALOG_SOURCES.Remote,
      },
    )

    expect(result.ok).toBe(false)
    expect(result.items).toEqual([])
    expect(result.errors).toEqual(["unsupported schemaVersion 4"])
  })

  it("filters V5 campaigns by extension version and excluded browser families", () => {
    const result = normalizeSponsorCatalog(
      {
        schemaVersion: 5,
        items: [
          {
            id: "visible-version-campaign",
            locales: {
              en: {
                enabled: true,
                rank: 10,
                supportStatus: SPONSOR_SUPPORT_STATUS.Unsupported,
                name: "Visible Version Campaign",
                tagline: "Visible for the current extension version.",
                visibility: {
                  extensionVersions: ">=3.52.0 <3.53.0",
                },
                links: {
                  primary: "https://visible.example.invalid/signup",
                },
              },
            },
          },
          {
            id: "future-version-campaign",
            locales: {
              en: {
                enabled: true,
                rank: 20,
                supportStatus: SPONSOR_SUPPORT_STATUS.Unsupported,
                name: "Future Version Campaign",
                tagline: "Hidden until a later extension version.",
                visibility: {
                  extensionVersions: ">=3.53.0",
                },
                links: {
                  primary: "https://future.example.invalid/signup",
                },
              },
            },
          },
          {
            id: "excluded-browser-campaign",
            locales: {
              en: {
                enabled: true,
                rank: 30,
                supportStatus: SPONSOR_SUPPORT_STATUS.Unsupported,
                name: "Excluded Browser Campaign",
                tagline: "Hidden for the current browser family.",
                visibility: {
                  excludedBrowserFamilies: ["firefox"],
                },
                links: {
                  primary: "https://browser.example.invalid/signup",
                },
              },
            },
          },
        ],
      },
      {
        locale: "en",
        now,
        source: SPONSOR_CATALOG_SOURCES.Remote,
        currentVersion: "3.52.1",
        browserFamily: "firefox",
      },
    )

    expect(result.ok).toBe(true)
    expect(result.items.map((item) => item.id)).toEqual([
      "visible-version-campaign",
    ])
  })

  it("rejects malformed V5 visibility constraints", () => {
    const result = normalizeSponsorCatalog(
      {
        schemaVersion: 5,
        items: [
          {
            id: "invalid-visibility-campaign",
            locales: {
              en: {
                enabled: true,
                rank: 10,
                supportStatus: SPONSOR_SUPPORT_STATUS.Unsupported,
                name: "Invalid Visibility Campaign",
                tagline: "Visibility has an unsupported browser family.",
                visibility: {
                  excludedBrowserFamilies: ["brave"],
                },
                links: {
                  primary: "https://invalid-visibility.example.invalid/signup",
                },
              },
            },
          },
        ],
      },
      {
        locale: "en",
        now,
        source: SPONSOR_CATALOG_SOURCES.Remote,
        currentVersion: "3.52.1",
        browserFamily: "chromium",
      },
    )

    expect(result.ok).toBe(false)
    expect(result.items).toEqual([])
    expect(result.errors.join("\n")).toContain(
      "locale en has invalid visibility",
    )
  })

  it("selects one whole valid locale campaign", () => {
    const result = normalizeSponsorCatalog(
      {
        schemaVersion: 5,
        items: [
          {
            id: "locale-campaign",
            locales: {
              en: {
                enabled: true,
                rank: 10,
                supportStatus: SPONSOR_SUPPORT_STATUS.Unsupported,
                name: "English Campaign",
                tagline: "English synthetic campaign.",
                links: {
                  primary: "https://en.example.invalid/signup",
                },
                actions: {
                  bookmarkFallback: {
                    url: "https://en.example.invalid",
                  },
                },
              },
              "zh-CN": {
                enabled: true,
                rank: 20,
                supportStatus: SPONSOR_SUPPORT_STATUS.Unsupported,
                name: "Chinese Campaign",
                tagline: "Chinese synthetic campaign.",
                links: {
                  primary: "https://zh.example.invalid/signup",
                },
                actions: {
                  bookmarkFallback: {
                    url: "https://zh.example.invalid",
                  },
                  apiCredentialProfileFallback: {
                    baseUrl: "https://zh-api.example.invalid",
                  },
                },
              },
            },
          },
        ],
      },
      {
        locale: "en-US",
        now,
        source: SPONSOR_CATALOG_SOURCES.Bundled,
      },
    )

    expect(result.errors).toEqual([])
    expect(result.ok).toBe(true)
    expect(result.items).toHaveLength(1)
    expect(result.items[0]).toMatchObject({
      selectedLocale: "en",
      schemaVersion: 5,
      links: {
        primary: "https://en.example.invalid/signup",
      },
      actions: {
        bookmarkFallback: {
          url: "https://en.example.invalid",
        },
      },
    })
    expect(atIndex(result.items, 0).actions).not.toHaveProperty(
      "apiCredentialProfileFallback",
    )
  })

  it("falls back when the candidate locale campaign is disabled", () => {
    const result = normalizeSponsorCatalog(
      {
        schemaVersion: 5,
        items: [
          {
            id: "fallback-campaign",
            locales: {
              en: {
                enabled: false,
                rank: 10,
                supportStatus: SPONSOR_SUPPORT_STATUS.Unsupported,
                name: "Disabled Campaign",
                tagline: "Disabled locale campaign.",
                links: {
                  primary: "https://en.example.invalid/signup",
                },
              },
              "zh-CN": {
                enabled: true,
                rank: 20,
                supportStatus: SPONSOR_SUPPORT_STATUS.Unsupported,
                name: "Fallback Campaign",
                tagline: "Valid fallback campaign.",
                links: {
                  primary: "https://zh.example.invalid/signup",
                },
              },
            },
          },
        ],
      },
      {
        locale: "en",
        now,
        source: SPONSOR_CATALOG_SOURCES.Remote,
      },
    )

    expect(result.ok).toBe(true)
    expect(result.items[0]).toMatchObject({
      selectedLocale: "zh-CN",
      links: {
        primary: "https://zh.example.invalid/signup",
      },
    })
  })

  it("does not fall back to arbitrary unrelated locale campaigns", () => {
    const result = normalizeSponsorCatalog(
      {
        schemaVersion: 5,
        items: [
          {
            id: "unrelated-locale-campaign",
            locales: {
              fr: {
                enabled: true,
                rank: 10,
                supportStatus: SPONSOR_SUPPORT_STATUS.Unsupported,
                name: "French Campaign",
                tagline: "Unrelated synthetic campaign.",
                links: {
                  primary: "https://fr.example.invalid/signup",
                },
              },
            },
          },
        ],
      },
      {
        locale: "de-DE",
        now,
        source: SPONSOR_CATALOG_SOURCES.Remote,
      },
    )

    expect(result.ok).toBe(false)
    expect(result.items).toEqual([])
    expect(result.errors.join("\n")).toContain(
      "item unrelated-locale-campaign has no valid localized campaign for de-DE",
    )
  })

  it("normalizes every supported action payload", () => {
    const result = normalizeSponsorCatalog(
      {
        schemaVersion: 5,
        items: [
          {
            id: "action-campaign",
            locales: {
              en: {
                enabled: true,
                rank: 10,
                supportStatus: SPONSOR_SUPPORT_STATUS.Supported,
                name: "Action Campaign",
                tagline: "Synthetic action campaign.",
                links: {
                  primary: "https://campaign.example.invalid/signup",
                },
                actions: {
                  addAccount: {
                    siteType: SITE_TYPES.NEW_API,
                    siteUrl: "https://api.example.invalid",
                    authType: AuthTypeEnum.AccessToken,
                  },
                  bookmarkFallback: {
                    url: "https://bookmark.example.invalid",
                  },
                  apiCredentialProfileFallback: {
                    baseUrl: "https://api-base.example.invalid",
                    apiKeyCreateUrl: "https://console.example.invalid/api-keys",
                    apiKeyCreateHint: "Create an example API key.",
                  },
                },
              },
            },
          },
        ],
      },
      {
        locale: "en",
        now,
        source: SPONSOR_CATALOG_SOURCES.Remote,
      },
    )

    expect(result.errors).toEqual([])
    expect(result.ok).toBe(true)
    expect(atIndex(result.items, 0).actions).toEqual({
      addAccount: {
        siteType: SITE_TYPES.NEW_API,
        siteUrl: "https://api.example.invalid",
        authType: AuthTypeEnum.AccessToken,
      },
      bookmarkFallback: {
        url: "https://bookmark.example.invalid",
      },
      apiCredentialProfileFallback: {
        baseUrl: "https://api-base.example.invalid",
        apiKeyCreateUrl: "https://console.example.invalid/api-keys",
        apiKeyCreateHint: "Create an example API key.",
      },
    })
  })

  it("keeps API key creation data on the explicit action", () => {
    const result = normalizeSponsorCatalog(
      {
        schemaVersion: 5,
        items: [
          {
            id: "api-key-bridge-campaign",
            locales: {
              en: {
                enabled: true,
                rank: 10,
                supportStatus: SPONSOR_SUPPORT_STATUS.Unsupported,
                name: "API Key Bridge Campaign",
                tagline: "Synthetic API key bridge campaign.",
                links: {
                  primary: "https://campaign.example.invalid/signup",
                },
                actions: {
                  apiCredentialProfileFallback: {
                    baseUrl: "https://api-base.example.invalid",
                    apiKeyCreateUrl: "https://console.example.invalid/api-keys",
                  },
                },
              },
            },
          },
        ],
      },
      {
        locale: "en",
        now,
        source: SPONSOR_CATALOG_SOURCES.Remote,
      },
    )

    expect(result.errors).toEqual([])
    expect(result.ok).toBe(true)
    expect(atIndex(result.items, 0).actions).toMatchObject({
      apiCredentialProfileFallback: {
        baseUrl: "https://api-base.example.invalid",
        apiKeyCreateUrl: "https://console.example.invalid/api-keys",
      },
    })
  })

  it("rejects malformed unselected locale campaigns", () => {
    const result = normalizeSponsorCatalog(
      {
        schemaVersion: 5,
        items: [
          {
            id: "unselected-malformed-campaign",
            locales: {
              en: {
                enabled: true,
                rank: 10,
                supportStatus: SPONSOR_SUPPORT_STATUS.Unsupported,
                name: "Selected Campaign",
                tagline: "Selected campaign is otherwise valid.",
                links: {
                  primary: "https://en.example.invalid/signup",
                },
              },
              "zh-CN": {
                enabled: true,
                rank: 20,
                supportStatus: SPONSOR_SUPPORT_STATUS.Unsupported,
                name: "Malformed Campaign",
                tagline: "Unselected campaign has invalid action.",
                links: {
                  primary: "https://zh.example.invalid/signup",
                },
                actions: {
                  addAccount: {
                    siteType: "invalid-site-type",
                    siteUrl: "https://zh.example.invalid",
                  },
                },
              },
            },
          },
        ],
      },
      {
        locale: "en",
        now,
        source: SPONSOR_CATALOG_SOURCES.Remote,
      },
    )

    expect(result.ok).toBe(false)
    expect(result.items).toEqual([])
    expect(result.errors.join("\n")).toContain(
      "locale zh-CN has invalid actions",
    )
  })

  it("rejects unsafe links in unselected locale campaigns", () => {
    const result = normalizeSponsorCatalog(
      {
        schemaVersion: 5,
        items: [
          {
            id: "unselected-unsafe-link-campaign",
            locales: {
              en: {
                enabled: true,
                rank: 10,
                supportStatus: SPONSOR_SUPPORT_STATUS.Unsupported,
                name: "Selected Campaign",
                tagline: "Selected campaign is otherwise valid.",
                links: {
                  primary: "https://en.example.invalid/signup",
                },
              },
              "zh-CN": {
                enabled: true,
                rank: 20,
                supportStatus: SPONSOR_SUPPORT_STATUS.Unsupported,
                name: "Unsafe Link Campaign",
                tagline: "Unselected campaign has unsafe link.",
                links: {
                  primary: "javascript:alert(1)",
                },
              },
            },
          },
        ],
      },
      {
        locale: "en",
        now,
        source: SPONSOR_CATALOG_SOURCES.Remote,
      },
    )

    expect(result.ok).toBe(false)
    expect(result.items).toEqual([])
    expect(result.errors.join("\n")).toContain("locale zh-CN has invalid links")
  })

  it("rejects invalid nested actions in unselected locale campaigns", () => {
    const result = normalizeSponsorCatalog(
      {
        schemaVersion: 5,
        items: [
          {
            id: "unselected-invalid-action-campaign",
            locales: {
              en: {
                enabled: true,
                rank: 10,
                supportStatus: SPONSOR_SUPPORT_STATUS.Unsupported,
                name: "Selected Campaign",
                tagline: "Selected campaign is otherwise valid.",
                links: {
                  primary: "https://en.example.invalid/signup",
                },
              },
              "zh-CN": {
                enabled: true,
                rank: 20,
                supportStatus: SPONSOR_SUPPORT_STATUS.Unsupported,
                name: "Invalid Action Campaign",
                tagline: "Unselected campaign has invalid action payload.",
                links: {
                  primary: "https://zh.example.invalid/signup",
                },
                actions: {
                  addAccount: {
                    siteType: SITE_TYPES.UNKNOWN,
                    siteUrl: "https://api.example.invalid",
                    authType: AuthTypeEnum.AccessToken,
                  },
                },
              },
            },
          },
        ],
      },
      {
        locale: "en",
        now,
        source: SPONSOR_CATALOG_SOURCES.Remote,
      },
    )

    expect(result.ok).toBe(false)
    expect(result.items).toEqual([])
    expect(result.errors.join("\n")).toContain(
      "locale zh-CN has invalid actions",
    )
  })

  it("rejects invalid rank and date values in unselected locale campaigns", () => {
    const result = normalizeSponsorCatalog(
      {
        schemaVersion: 5,
        items: [
          {
            id: "unselected-invalid-values-campaign",
            locales: {
              en: {
                enabled: true,
                rank: 10,
                supportStatus: SPONSOR_SUPPORT_STATUS.Unsupported,
                name: "Selected Campaign",
                tagline: "Selected campaign is otherwise valid.",
                links: {
                  primary: "https://en.example.invalid/signup",
                },
              },
              "zh-CN": {
                enabled: true,
                rank: Number.NaN,
                startsAt: "not a date",
                supportStatus: SPONSOR_SUPPORT_STATUS.Unsupported,
                name: "Invalid Values Campaign",
                tagline: "Unselected campaign has invalid rank and date.",
                links: {
                  primary: "https://zh.example.invalid/signup",
                },
              },
            },
          },
        ],
      },
      {
        locale: "en",
        now,
        source: SPONSOR_CATALOG_SOURCES.Remote,
      },
    )

    expect(result.ok).toBe(false)
    expect(result.items).toEqual([])
    expect(result.errors.join("\n")).toContain("locale zh-CN has invalid rank")
  })

  it("tolerates unknown top-level and locale fields for forward compatibility", () => {
    const result = normalizeSponsorCatalog(
      {
        schemaVersion: 5,
        items: [
          {
            id: "forward-compatible-campaign",
            rank: 10, // unknown top-level field
            futureItemMeta: "ignored", // future top-level field
            locales: {
              en: {
                enabled: true,
                rank: 10,
                supportStatus: SPONSOR_SUPPORT_STATUS.Unsupported,
                name: "Forward Compatible Campaign",
                tagline: "Synthetic forward compatible campaign.",
                website: "https://website.example.invalid", // unknown locale field
                futureLocaleBadge: "HOT", // future locale field
                links: {
                  primary: "https://campaign.example.invalid/signup",
                },
              },
            },
          },
        ],
      },
      {
        locale: "en",
        now,
        source: SPONSOR_CATALOG_SOURCES.Remote,
      },
    )

    expect(result.ok).toBe(true)
    expect(result.errors).toEqual([])
    expect(result.items).toHaveLength(1)
    expect(result.items[0]?.name).toBe("Forward Compatible Campaign")
    expect(result.items[0]?.tagline).toBe(
      "Synthetic forward compatible campaign.",
    )
    expect(result.items[0]?.links.primary).toBe(
      "https://campaign.example.invalid/signup",
    )
  })

  it("rejects malformed locale and action containers before semantic selection", () => {
    const result = normalizeSponsorCatalog(
      {
        schemaVersion: 5,
        items: [
          {
            id: "invalid-locales-campaign",
            locales: "en",
          },
          {
            id: "invalid-locale-shape-campaign",
            locales: {
              en: null,
            },
          },
          {
            id: "invalid-actions-container-campaign",
            locales: {
              en: {
                enabled: true,
                rank: 10,
                supportStatus: SPONSOR_SUPPORT_STATUS.Unsupported,
                name: "Invalid Actions Campaign",
                tagline: "Synthetic invalid actions campaign.",
                links: {
                  primary: "https://campaign.example.invalid/signup",
                },
                actions: [],
              },
            },
          },
        ],
      },
      {
        locale: "en",
        now,
        source: SPONSOR_CATALOG_SOURCES.Remote,
      },
    )

    expect(result.ok).toBe(false)
    expect(result.items).toEqual([])
    expect(result.errors.join("\n")).toContain(
      "item invalid-locales-campaign has invalid locales",
    )
    expect(result.errors.join("\n")).toContain(
      "item invalid-locale-shape-campaign locale en has invalid shape",
    )
    expect(result.errors.join("\n")).toContain(
      "item invalid-actions-container-campaign locale en has invalid actions",
    )
  })

  it("rejects selected locale campaigns with invalid semantic fields", () => {
    const result = normalizeSponsorCatalog(
      {
        schemaVersion: 5,
        items: [
          {
            id: "invalid-shape-selected-campaign",
            locales: {
              en: null,
            },
          },
          {
            id: "invalid-support-status-campaign",
            locales: {
              en: {
                enabled: true,
                rank: 10,
                supportStatus: "pending",
                name: "Invalid Status Campaign",
                tagline: "Synthetic invalid status campaign.",
                links: {
                  primary: "https://campaign.example.invalid/signup",
                },
              },
            },
          },
          {
            id: "expired-campaign",
            locales: {
              en: {
                enabled: true,
                rank: 20,
                supportStatus: SPONSOR_SUPPORT_STATUS.Unsupported,
                startsAt: "2026-07-01T00:00:00.000Z",
                name: "Expired Campaign",
                tagline: "Synthetic expired campaign.",
                links: {
                  primary: "https://expired.example.invalid/signup",
                },
              },
            },
          },
          {
            id: "missing-name-campaign",
            locales: {
              en: {
                enabled: true,
                rank: 30,
                supportStatus: SPONSOR_SUPPORT_STATUS.Unsupported,
                name: "",
                tagline: "Synthetic missing name campaign.",
                links: {
                  primary: "https://missing-name.example.invalid/signup",
                },
              },
            },
          },
          {
            id: "invalid-date-campaign",
            locales: {
              en: {
                enabled: true,
                rank: 40,
                supportStatus: SPONSOR_SUPPORT_STATUS.Unsupported,
                endsAt: "not a date",
                name: "Invalid Date Campaign",
                tagline: "Synthetic invalid date campaign.",
                links: {
                  primary: "https://invalid-date.example.invalid/signup",
                },
              },
            },
          },
        ],
      },
      {
        locale: "en",
        now,
        source: SPONSOR_CATALOG_SOURCES.Remote,
      },
    )

    expect(result.ok).toBe(false)
    expect(result.items).toEqual([])
    expect(result.errors.join("\n")).toContain(
      "item invalid-shape-selected-campaign locale en has invalid shape",
    )
    expect(result.errors.join("\n")).toContain(
      "item invalid-support-status-campaign locale en has invalid supportStatus",
    )
    expect(result.errors.join("\n")).toContain(
      "item expired-campaign locale en is outside its active date range",
    )
    expect(result.errors.join("\n")).toContain(
      "item missing-name-campaign locale en has invalid name or tagline",
    )
    expect(result.errors.join("\n")).toContain(
      "item invalid-date-campaign locale en is outside its active date range",
    )
  })

  it("rejects invalid fallback action URLs and malformed action payloads", () => {
    const result = normalizeSponsorCatalog(
      {
        schemaVersion: 5,
        items: [
          {
            id: "invalid-api-key-url-campaign",
            locales: {
              en: {
                enabled: true,
                rank: 10,
                supportStatus: SPONSOR_SUPPORT_STATUS.Unsupported,
                name: "Invalid API Key URL Campaign",
                tagline: "Synthetic invalid API key URL campaign.",
                links: {
                  primary: "https://campaign.example.invalid/signup",
                },
                actions: {
                  apiCredentialProfileFallback: {
                    baseUrl: "https://api.example.invalid",
                    apiKeyCreateUrl: "not a url",
                  },
                },
              },
            },
          },
          {
            id: "invalid-bookmark-shape-campaign",
            locales: {
              en: {
                enabled: true,
                rank: 20,
                supportStatus: SPONSOR_SUPPORT_STATUS.Unsupported,
                name: "Invalid Bookmark Shape Campaign",
                tagline: "Synthetic invalid bookmark shape campaign.",
                links: {
                  primary: "https://campaign.example.invalid/signup",
                },
                actions: {
                  bookmarkFallback: "https://bookmark.example.invalid",
                },
              },
            },
          },
        ],
      },
      {
        locale: "en",
        now,
        source: SPONSOR_CATALOG_SOURCES.Remote,
      },
    )

    expect(result.ok).toBe(false)
    expect(result.items).toEqual([])
    expect(result.errors.join("\n")).toContain(
      "item invalid-api-key-url-campaign locale en has invalid actions",
    )
    expect(result.errors.join("\n")).toContain(
      "item invalid-bookmark-shape-campaign locale en has invalid bookmarkFallback action",
    )
  })

  it("tolerates unknown nested link and action fields while extracting known payloads", () => {
    const result = normalizeSponsorCatalog(
      {
        schemaVersion: 5,
        items: [
          {
            id: "lenient-link-field-campaign",
            locales: {
              en: {
                enabled: true,
                rank: 10,
                supportStatus: SPONSOR_SUPPORT_STATUS.Unsupported,
                name: "Lenient Link Field Campaign",
                tagline: "Synthetic lenient link field campaign.",
                links: {
                  primary: "https://campaign.example.invalid/signup",
                  extra: "https://extra.example.invalid", // unknown link property
                },
              },
            },
          },
          {
            id: "lenient-action-field-campaign",
            locales: {
              en: {
                enabled: true,
                rank: 20,
                supportStatus: SPONSOR_SUPPORT_STATUS.Unsupported,
                name: "Lenient Action Field Campaign",
                tagline: "Synthetic lenient action field campaign.",
                links: {
                  primary: "https://action.example.invalid/signup",
                },
                actions: {
                  addAccount: {
                    siteType: SITE_TYPES.NEW_API,
                    siteUrl: "https://api.example.invalid",
                    authType: AuthTypeEnum.AccessToken,
                    extra: "ignored", // unknown action sub-property
                  },
                  futureActionType: {
                    url: "https://future.example.invalid", // unknown action key
                  },
                },
              },
            },
          },
        ],
      },
      {
        locale: "en",
        now,
        source: SPONSOR_CATALOG_SOURCES.Remote,
      },
    )

    expect(result.ok).toBe(true)
    expect(result.errors).toEqual([])
    expect(result.items).toHaveLength(2)
    expect(result.items[0]?.links.primary).toBe(
      "https://campaign.example.invalid/signup",
    )
    expect(result.items[1]?.actions.addAccount?.siteUrl).toBe(
      "https://api.example.invalid",
    )
  })

  it("normalizes explicit iconUrl in locale campaign and item level", () => {
    const result = normalizeSponsorCatalog(
      {
        schemaVersion: 5,
        items: [
          {
            id: "campaign-icon-sponsor",
            locales: {
              en: {
                enabled: true,
                rank: 1,
                supportStatus: SPONSOR_SUPPORT_STATUS.Supported,
                name: "Campaign Icon Sponsor",
                tagline: "Has iconUrl in campaign",
                iconUrl: "https://cdn.example.com/campaign-logo.png",
                links: { primary: "https://example.com" },
              },
            },
          },
          {
            id: "item-icon-sponsor",
            iconUrl: "https://cdn.example.com/item-logo.png",
            locales: {
              en: {
                enabled: true,
                rank: 2,
                supportStatus: SPONSOR_SUPPORT_STATUS.Supported,
                name: "Item Icon Sponsor",
                tagline: "Has iconUrl on item level",
                links: { primary: "https://example.com" },
              },
            },
          },
          {
            id: "override-icon-sponsor",
            iconUrl: "https://cdn.example.com/item-fallback.png",
            locales: {
              en: {
                enabled: true,
                rank: 3,
                supportStatus: SPONSOR_SUPPORT_STATUS.Supported,
                name: "Override Icon Sponsor",
                tagline: "Campaign iconUrl overrides item iconUrl",
                iconUrl: "https://cdn.example.com/campaign-override.png",
                links: { primary: "https://example.com" },
              },
            },
          },
        ],
      },
      {
        locale: "en",
        now,
        source: SPONSOR_CATALOG_SOURCES.Remote,
      },
    )

    expect(result.ok).toBe(true)
    expect(result.errors).toEqual([])
    expect(result.items[0]?.iconUrl).toBe(
      "https://cdn.example.com/campaign-logo.png",
    )
    expect(result.items[1]?.iconUrl).toBe(
      "https://cdn.example.com/item-logo.png",
    )
    expect(result.items[2]?.iconUrl).toBe(
      "https://cdn.example.com/campaign-override.png",
    )
  })

  it("rejects invalid iconUrl with semantic error", () => {
    const result = normalizeSponsorCatalog(
      {
        schemaVersion: 5,
        items: [
          {
            id: "invalid-icon-sponsor",
            locales: {
              en: {
                enabled: true,
                rank: 1,
                supportStatus: SPONSOR_SUPPORT_STATUS.Supported,
                name: "Invalid Icon Sponsor",
                tagline: "Has malformed iconUrl",
                iconUrl: "javascript:alert(1)",
                links: { primary: "https://example.com" },
              },
            },
          },
        ],
      },
      {
        locale: "en",
        now,
        source: SPONSOR_CATALOG_SOURCES.Remote,
      },
    )

    expect(result.ok).toBe(false)
    expect(result.items).toHaveLength(0)
    expect(result.errors.join("\n")).toContain("has invalid iconUrl")
  })

  it("rejects invalid top-level item iconUrl with semantic error", () => {
    const result = normalizeSponsorCatalog(
      {
        schemaVersion: 5,
        items: [
          {
            id: "invalid-item-icon-sponsor",
            iconUrl: "not-a-url",
            locales: {
              en: {
                enabled: true,
                rank: 1,
                supportStatus: SPONSOR_SUPPORT_STATUS.Supported,
                name: "Invalid Item Icon Sponsor",
                tagline: "Has malformed item iconUrl",
                links: { primary: "https://example.com" },
              },
            },
          },
        ],
      },
      {
        locale: "en",
        now,
        source: SPONSOR_CATALOG_SOURCES.Remote,
      },
    )

    expect(result.ok).toBe(false)
    expect(result.items).toHaveLength(0)
    expect(result.errors.join("\n")).toContain(
      "item invalid-item-icon-sponsor has invalid iconUrl",
    )
  })

  it("rejects campaigns with non-record links", () => {
    const result = normalizeSponsorCatalog(
      {
        schemaVersion: 5,
        items: [
          {
            id: "invalid-links-sponsor",
            locales: {
              en: {
                enabled: true,
                rank: 1,
                supportStatus: SPONSOR_SUPPORT_STATUS.Supported,
                name: "Invalid Links Sponsor",
                tagline: "Has non-record links",
                links: "invalid" as unknown as { primary: string },
              },
            },
          },
        ],
      },
      {
        locale: "en",
        now,
        source: SPONSOR_CATALOG_SOURCES.Remote,
      },
    )

    expect(result.ok).toBe(false)
    expect(result.items).toHaveLength(0)
    expect(result.errors.join("\n")).toContain(
      "item invalid-links-sponsor locale en has invalid links",
    )
  })

  it("rejects campaigns with non-record addAccount action", () => {
    const result = normalizeSponsorCatalog(
      {
        schemaVersion: 5,
        items: [
          {
            id: "invalid-add-account-action-sponsor",
            locales: {
              en: {
                enabled: true,
                rank: 1,
                supportStatus: SPONSOR_SUPPORT_STATUS.Supported,
                name: "Invalid Action Sponsor",
                tagline: "Has non-record addAccount",
                links: { primary: "https://example.com" },
                actions: {
                  addAccount: "invalid" as unknown as Record<string, unknown>,
                },
              },
            },
          },
        ],
      },
      {
        locale: "en",
        now,
        source: SPONSOR_CATALOG_SOURCES.Remote,
      },
    )

    expect(result.ok).toBe(false)
    expect(result.items).toHaveLength(0)
    expect(result.errors.join("\n")).toContain(
      "item invalid-add-account-action-sponsor locale en has invalid addAccount action",
    )
  })

  it("rejects campaigns with non-record apiCredentialProfileFallback action", () => {
    const result = normalizeSponsorCatalog(
      {
        schemaVersion: 5,
        items: [
          {
            id: "invalid-api-cred-action-sponsor",
            locales: {
              en: {
                enabled: true,
                rank: 1,
                supportStatus: SPONSOR_SUPPORT_STATUS.Supported,
                name: "Invalid Action Sponsor",
                tagline: "Has non-record apiCredentialProfileFallback",
                links: { primary: "https://example.com" },
                actions: {
                  apiCredentialProfileFallback: "invalid" as unknown as Record<
                    string,
                    unknown
                  >,
                },
              },
            },
          },
        ],
      },
      {
        locale: "en",
        now,
        source: SPONSOR_CATALOG_SOURCES.Remote,
      },
    )

    expect(result.ok).toBe(false)
    expect(result.items).toHaveLength(0)
    expect(result.errors.join("\n")).toContain(
      "item invalid-api-cred-action-sponsor locale en has invalid apiCredentialProfileFallback action",
    )
  })
})

describe("selectSponsorRecommendations", () => {
  const dummyItems: SponsorRecommendation[] = [
    {
      id: "account-only",
      rank: 1,
      name: "Account Only",
      tagline: "Account only provider",
      selectedLocale: "en",
      schemaVersion: 5,
      supportStatus: SPONSOR_SUPPORT_STATUS.Supported,
      links: { primary: "https://example.invalid/1" },
      actions: {
        addAccount: {
          siteType: SITE_TYPES.NEW_API,
          siteUrl: "https://api.example.invalid/1",
        },
      },
      source: SPONSOR_CATALOG_SOURCES.Bundled,
    },
    {
      id: "api-profile-enabled",
      rank: 2,
      name: "API Profile Enabled",
      tagline: "API profile provider",
      selectedLocale: "en",
      schemaVersion: 5,
      supportStatus: SPONSOR_SUPPORT_STATUS.Unsupported,
      links: { primary: "https://example.invalid/2" },
      actions: {
        apiCredentialProfileFallback: {
          baseUrl: "https://api.example.invalid/v1",
        },
      },
      source: SPONSOR_CATALOG_SOURCES.Bundled,
    },
  ]

  it("filters recommendations for PopupApiCredentialProfiles to only those with apiCredentialProfileFallback", () => {
    const selected = selectSponsorRecommendations(
      dummyItems,
      SPONSOR_RECOMMENDATION_SURFACES.PopupApiCredentialProfiles,
    )
    expect(selected.map((item) => item.id)).toEqual(["api-profile-enabled"])
  })

  it("returns all recommendations for Newcomer and PopupBookmarks surfaces", () => {
    const newcomer = selectSponsorRecommendations(
      dummyItems,
      SPONSOR_RECOMMENDATION_SURFACES.Newcomer,
    )
    expect(newcomer).toHaveLength(2)

    const bookmarks = selectSponsorRecommendations(
      dummyItems,
      SPONSOR_RECOMMENDATION_SURFACES.PopupBookmarks,
    )
    expect(bookmarks).toHaveLength(2)
  })
})
