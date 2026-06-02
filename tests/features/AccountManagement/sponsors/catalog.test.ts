import { describe, expect, it } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  normalizeSponsorCatalog,
  selectSponsorRecommendations,
} from "~/features/AccountManagement/sponsors/catalog"
import {
  SPONSOR_CATALOG_SCHEMA_VERSION,
  SPONSOR_RECOMMENDATION_SURFACES,
} from "~/features/AccountManagement/sponsors/constants"
import {
  SPONSOR_CATALOG_SOURCES,
  SPONSOR_SUPPORT_STATUS,
  type RawSponsorCatalog,
} from "~/features/AccountManagement/sponsors/types"
import { AuthTypeEnum } from "~/types"

const now = Date.UTC(2026, 4, 25)

describe("sponsor catalog normalization", () => {
  it("keeps enabled HTTP sponsors with fallback locale content and stable ordering", () => {
    const catalog: RawSponsorCatalog = {
      schemaVersion: SPONSOR_CATALOG_SCHEMA_VERSION,
      items: [
        {
          id: "later",
          enabled: true,
          rank: 20,
          supportStatus: SPONSOR_SUPPORT_STATUS.Unsupported,
          urls: {
            primaryAffiliate: "https://example.com/later",
          },
          locales: {
            en: {
              name: "Later",
              tagline: "English fallback sponsor",
            },
          },
          fallbackHints: {
            bookmarkManager: true,
          },
        },
        {
          id: "supported-provider",
          enabled: true,
          rank: 10,
          supportStatus: SPONSOR_SUPPORT_STATUS.Supported,
          urls: {
            primaryAffiliate: "https://supported.example.test/register",
            website: "https://supported.example.test",
          },
          locales: {
            "zh-CN": {
              name: "Supported Provider",
              tagline: "稳定的测试服务",
            },
            en: {
              name: "Supported Provider",
              tagline: "Reliable test service",
            },
          },
          accountPrefill: {
            siteType: SITE_TYPES.NEW_API,
            siteUrl: "https://supported.example.test",
            authType: AuthTypeEnum.Cookie,
          },
        },
      ],
    }

    const result = normalizeSponsorCatalog(catalog, {
      locale: "zh-CN",
      now,
      source: SPONSOR_CATALOG_SOURCES.Bundled,
    })

    expect(result.errors).toEqual([])
    expect(result.ok).toBe(true)
    expect(result.items.map((item) => item.id)).toEqual([
      "supported-provider",
      "later",
    ])
    expect(result.items[0]).toMatchObject({
      id: "supported-provider",
      name: "Supported Provider",
      tagline: "稳定的测试服务",
      supportStatus: SPONSOR_SUPPORT_STATUS.Supported,
      source: SPONSOR_CATALOG_SOURCES.Bundled,
      primaryAffiliateUrl: "https://supported.example.test/register",
      websiteUrl: "https://supported.example.test",
      fallbackHints: {
        bookmarkManager: false,
        apiCredentialProfiles: false,
      },
      accountPrefill: {
        siteType: SITE_TYPES.NEW_API,
        siteUrl: "https://supported.example.test",
        authType: AuthTypeEnum.Cookie,
      },
    })
    expect(result.items[1]).toMatchObject({
      id: "later",
      name: "Later",
      tagline: "English fallback sponsor",
      supportStatus: SPONSOR_SUPPORT_STATUS.Unsupported,
      primaryAffiliateUrl: "https://example.com/later",
      fallbackHints: {
        bookmarkManager: true,
        apiCredentialProfiles: false,
      },
    })
  })

  it("rejects unsafe, disabled, expired, malformed, and unsupported-schema items", () => {
    const invalidCatalog: RawSponsorCatalog = {
      schemaVersion: SPONSOR_CATALOG_SCHEMA_VERSION,
      items: [
        {
          id: "disabled",
          enabled: false,
          supportStatus: SPONSOR_SUPPORT_STATUS.Supported,
          urls: {
            primaryAffiliate: "https://example.com/disabled",
          },
          locales: {
            en: { name: "Disabled", tagline: "Disabled sponsor" },
          },
        },
        {
          id: "ftp-url",
          enabled: true,
          supportStatus: SPONSOR_SUPPORT_STATUS.Supported,
          urls: {
            primaryAffiliate: "ftp://example.com/unsafe",
          },
          locales: {
            en: { name: "FTP", tagline: "Unsafe URL" },
          },
        },
        {
          id: "expired",
          enabled: true,
          supportStatus: SPONSOR_SUPPORT_STATUS.Supported,
          urls: {
            primaryAffiliate: "https://example.com/expired",
          },
          endsAt: "2026-01-01T00:00:00.000Z",
          locales: {
            en: { name: "Expired", tagline: "Expired sponsor" },
          },
        },
        {
          id: "missing-copy",
          enabled: true,
          supportStatus: SPONSOR_SUPPORT_STATUS.Supported,
          urls: {
            primaryAffiliate: "https://example.com/missing-copy",
          },
          locales: {
            fr: { name: "Manquant", tagline: "Copie manquante" },
          },
        },
      ],
    }

    const result = normalizeSponsorCatalog(invalidCatalog, {
      locale: "zh-CN",
      now,
      source: SPONSOR_CATALOG_SOURCES.Remote,
    })

    expect(result.ok).toBe(false)
    expect(result.items).toEqual([])
    expect(result.errors).toEqual([
      "item disabled is disabled",
      "item ftp-url has invalid primaryAffiliate URL",
      "item expired is outside its active date range",
      "item missing-copy has no localized name and tagline",
    ])

    const unsupportedSchema = normalizeSponsorCatalog(
      {
        schemaVersion: 999,
        items: [],
      },
      {
        locale: "zh-CN",
        now,
        source: SPONSOR_CATALOG_SOURCES.Remote,
      },
    )

    expect(unsupportedSchema.ok).toBe(false)
    expect(unsupportedSchema.items).toEqual([])
    expect(unsupportedSchema.errors).toEqual(["unsupported schemaVersion 999"])
  })

  it("rejects structurally malformed remote payloads and items without throwing", () => {
    for (const catalog of [null, undefined]) {
      expect(() =>
        normalizeSponsorCatalog(catalog as unknown as RawSponsorCatalog, {
          locale: "zh-CN",
          now,
          source: SPONSOR_CATALOG_SOURCES.Remote,
        }),
      ).not.toThrow()

      expect(
        normalizeSponsorCatalog(catalog as unknown as RawSponsorCatalog, {
          locale: "zh-CN",
          now,
          source: SPONSOR_CATALOG_SOURCES.Remote,
        }),
      ).toEqual({
        ok: false,
        items: [],
        errors: ["catalog payload must be an object"],
      })
    }

    expect(() =>
      normalizeSponsorCatalog(
        {
          schemaVersion: SPONSOR_CATALOG_SCHEMA_VERSION,
          items: null,
        } as unknown as RawSponsorCatalog,
        {
          locale: "zh-CN",
          now,
          source: SPONSOR_CATALOG_SOURCES.Remote,
        },
      ),
    ).not.toThrow()

    const malformedPayload = normalizeSponsorCatalog(
      {
        schemaVersion: SPONSOR_CATALOG_SCHEMA_VERSION,
        items: null,
      } as unknown as RawSponsorCatalog,
      {
        locale: "zh-CN",
        now,
        source: SPONSOR_CATALOG_SOURCES.Remote,
      },
    )

    expect(malformedPayload).toEqual({
      ok: false,
      items: [],
      errors: ["catalog items must be an array"],
    })

    expect(() =>
      normalizeSponsorCatalog(
        {
          schemaVersion: SPONSOR_CATALOG_SCHEMA_VERSION,
          items: [
            {
              id: "missing-urls",
              enabled: true,
              supportStatus: SPONSOR_SUPPORT_STATUS.Supported,
              locales: {
                en: { name: "Missing URLs", tagline: "No URLs object" },
              },
            },
            {
              id: "null-urls",
              enabled: true,
              supportStatus: SPONSOR_SUPPORT_STATUS.Supported,
              urls: null,
              locales: {
                en: { name: "Null URLs", tagline: "Null URLs object" },
              },
            },
            {
              id: "missing-locales",
              enabled: true,
              supportStatus: SPONSOR_SUPPORT_STATUS.Supported,
              urls: {
                primaryAffiliate: "https://example.com/missing-locales",
              },
            },
            {
              id: "null-copy",
              enabled: true,
              supportStatus: SPONSOR_SUPPORT_STATUS.Supported,
              urls: {
                primaryAffiliate: "https://example.com/null-copy",
              },
              locales: {
                en: null,
              },
            },
          ],
        } as unknown as RawSponsorCatalog,
        {
          locale: "en",
          now,
          source: SPONSOR_CATALOG_SOURCES.Remote,
        },
      ),
    ).not.toThrow()

    const malformedItems = normalizeSponsorCatalog(
      {
        schemaVersion: SPONSOR_CATALOG_SCHEMA_VERSION,
        items: [
          {
            id: "missing-urls",
            enabled: true,
            supportStatus: SPONSOR_SUPPORT_STATUS.Supported,
            locales: {
              en: { name: "Missing URLs", tagline: "No URLs object" },
            },
          },
          {
            id: "null-urls",
            enabled: true,
            supportStatus: SPONSOR_SUPPORT_STATUS.Supported,
            urls: null,
            locales: {
              en: { name: "Null URLs", tagline: "Null URLs object" },
            },
          },
          {
            id: "missing-locales",
            enabled: true,
            supportStatus: SPONSOR_SUPPORT_STATUS.Supported,
            urls: {
              primaryAffiliate: "https://example.com/missing-locales",
            },
          },
          {
            id: "null-copy",
            enabled: true,
            supportStatus: SPONSOR_SUPPORT_STATUS.Supported,
            urls: {
              primaryAffiliate: "https://example.com/null-copy",
            },
            locales: {
              en: null,
            },
          },
        ],
      } as unknown as RawSponsorCatalog,
      {
        locale: "en",
        now,
        source: SPONSOR_CATALOG_SOURCES.Remote,
      },
    )

    expect(malformedItems.ok).toBe(false)
    expect(malformedItems.items).toEqual([])
    expect(malformedItems.errors).toEqual([
      "item missing-urls has invalid urls",
      "item null-urls has invalid urls",
      "item missing-locales has invalid locales",
      "item null-copy has no localized name and tagline",
    ])
  })

  it("trims normalized URLs, display copy, and account prefill fields", () => {
    const catalog: RawSponsorCatalog = {
      schemaVersion: SPONSOR_CATALOG_SCHEMA_VERSION,
      items: [
        {
          id: "trimmed",
          enabled: true,
          rank: 1,
          supportStatus: SPONSOR_SUPPORT_STATUS.Supported,
          urls: {
            primaryAffiliate: "  https://example.com/affiliate  ",
            website: "  https://example.com  ",
            apiKeyCreate: "  https://example.com/dashboard/keys?aff=aah  ",
          },
          locales: {
            en: {
              name: "  Trimmed Sponsor  ",
              tagline: "  Trimmed tagline  ",
              postClickNote: "  Use promo code APIHUB after registration.  ",
            },
          },
          accountPrefill: {
            siteType: SITE_TYPES.NEW_API,
            siteUrl: "  https://supported.example.test  ",
            authType: AuthTypeEnum.Cookie,
          },
        },
      ],
    }

    const result = normalizeSponsorCatalog(catalog, {
      locale: "en",
      now,
      source: SPONSOR_CATALOG_SOURCES.Remote,
    })

    expect(result.errors).toEqual([])
    expect(result.items[0]).toMatchObject({
      primaryAffiliateUrl: "https://example.com/affiliate",
      websiteUrl: "https://example.com",
      apiKeyCreateUrl: "https://example.com/dashboard/keys?aff=aah",
      name: "Trimmed Sponsor",
      tagline: "Trimmed tagline",
      postClickNote: "Use promo code APIHUB after registration.",
      accountPrefill: {
        siteType: SITE_TYPES.NEW_API,
        siteUrl: "https://supported.example.test",
        authType: AuthTypeEnum.Cookie,
      },
    })
  })

  it("treats blank account prefill auth types as omitted", () => {
    const catalog: RawSponsorCatalog = {
      schemaVersion: SPONSOR_CATALOG_SCHEMA_VERSION,
      items: [
        {
          id: "blank-auth-type",
          enabled: true,
          supportStatus: SPONSOR_SUPPORT_STATUS.Supported,
          urls: {
            primaryAffiliate: "https://example.com/blank-auth-type",
          },
          locales: {
            en: {
              name: "Blank Auth Type",
              tagline: "Blank auth type is omitted.",
            },
          },
          accountPrefill: {
            siteType: SITE_TYPES.NEW_API,
            siteUrl: "https://blank-auth-type.example.com",
            authType: "",
          },
        },
      ],
    }

    const result = normalizeSponsorCatalog(catalog, {
      locale: "en",
      now,
      source: SPONSOR_CATALOG_SOURCES.Remote,
    })

    expect(result.errors).toEqual([])
    expect(result.items[0]).toMatchObject({
      accountPrefill: {
        siteType: SITE_TYPES.NEW_API,
        siteUrl: "https://blank-auth-type.example.com",
      },
    })
    expect(result.items[0]?.accountPrefill).not.toHaveProperty("authType")
  })

  it("rejects unsafe sponsor API key creation URLs", () => {
    const result = normalizeSponsorCatalog(
      {
        schemaVersion: SPONSOR_CATALOG_SCHEMA_VERSION,
        items: [
          {
            id: "unsafe-key-url",
            enabled: true,
            supportStatus: SPONSOR_SUPPORT_STATUS.Unsupported,
            urls: {
              primaryAffiliate: "https://example.com/register",
              apiKeyCreate: "javascript:alert(1)",
            },
            locales: {
              en: {
                name: "Unsafe key URL",
                tagline: "Invalid key creation URL.",
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
    expect(result.errors).toEqual([
      "item unsafe-key-url has invalid apiKeyCreate URL",
    ])
  })

  it("rejects malformed non-boolean enabled flags without changing disabled wording", () => {
    const catalog: RawSponsorCatalog = {
      schemaVersion: SPONSOR_CATALOG_SCHEMA_VERSION,
      items: [
        {
          id: "bad-enabled",
          enabled: "yes" as unknown as boolean,
          supportStatus: SPONSOR_SUPPORT_STATUS.Supported,
          urls: {
            primaryAffiliate: "https://example.com/bad-enabled",
          },
          locales: {
            en: { name: "Bad enabled", tagline: "Malformed enabled flag" },
          },
        },
        {
          id: "disabled",
          enabled: false,
          supportStatus: SPONSOR_SUPPORT_STATUS.Supported,
          urls: {
            primaryAffiliate: "https://example.com/disabled",
          },
          locales: {
            en: { name: "Disabled", tagline: "Disabled sponsor" },
          },
        },
      ],
    }

    expect(() =>
      normalizeSponsorCatalog(catalog, {
        locale: "en",
        now,
        source: SPONSOR_CATALOG_SOURCES.Remote,
      }),
    ).not.toThrow()

    const result = normalizeSponsorCatalog(catalog, {
      locale: "en",
      now,
      source: SPONSOR_CATALOG_SOURCES.Remote,
    })

    expect(result.ok).toBe(false)
    expect(result.items).toEqual([])
    expect(result.errors).toEqual([
      "item bad-enabled has invalid enabled flag",
      "item disabled is disabled",
    ])
  })

  it("rejects malformed item shape, id, status, date range, website, and URL parser failures", () => {
    const catalog: RawSponsorCatalog = {
      schemaVersion: SPONSOR_CATALOG_SCHEMA_VERSION,
      items: [
        null as unknown as RawSponsorCatalog["items"][number],
        {
          id: "Bad ID",
          enabled: true,
          supportStatus: SPONSOR_SUPPORT_STATUS.Supported,
          urls: {
            primaryAffiliate: "https://example.com/bad-id",
          },
          locales: {
            en: { name: "Bad ID", tagline: "Invalid id" },
          },
        },
        {
          id: "bad-status",
          enabled: true,
          supportStatus: "maybe" as typeof SPONSOR_SUPPORT_STATUS.Supported,
          urls: {
            primaryAffiliate: "https://example.com/bad-status",
          },
          locales: {
            en: { name: "Bad Status", tagline: "Invalid status" },
          },
        },
        {
          id: "bad-date",
          enabled: true,
          startsAt: "not a date",
          supportStatus: SPONSOR_SUPPORT_STATUS.Supported,
          urls: {
            primaryAffiliate: "https://example.com/bad-date",
          },
          locales: {
            en: { name: "Bad Date", tagline: "Invalid date" },
          },
        },
        {
          id: "bad-website",
          enabled: true,
          supportStatus: SPONSOR_SUPPORT_STATUS.Supported,
          urls: {
            primaryAffiliate: "https://example.com/bad-website",
            website: "javascript:alert(1)",
          },
          locales: {
            en: { name: "Bad Website", tagline: "Invalid website" },
          },
        },
        {
          id: "bad-url",
          enabled: true,
          supportStatus: SPONSOR_SUPPORT_STATUS.Supported,
          urls: {
            primaryAffiliate: "https://[invalid",
          },
          locales: {
            en: { name: "Bad URL", tagline: "Invalid URL" },
          },
        },
      ],
    }

    const result = normalizeSponsorCatalog(catalog, {
      locale: "en",
      now,
      source: SPONSOR_CATALOG_SOURCES.Remote,
    })

    expect(result.ok).toBe(false)
    expect(result.items).toEqual([])
    expect(result.errors).toEqual([
      "item unknown has invalid shape",
      "item Bad ID has invalid id",
      "item bad-status has invalid supportStatus",
      "item bad-date is outside its active date range",
      "item bad-website has invalid website URL",
      "item bad-url has invalid primaryAffiliate URL",
    ])
  })

  it("rejects unknown account prefill site types without throwing", () => {
    const catalog: RawSponsorCatalog = {
      schemaVersion: SPONSOR_CATALOG_SCHEMA_VERSION,
      items: [
        {
          id: "unknown-supported",
          enabled: true,
          supportStatus: SPONSOR_SUPPORT_STATUS.Supported,
          urls: {
            primaryAffiliate: "https://example.com/unknown-supported",
          },
          locales: {
            en: { name: "Unknown", tagline: "Unknown account type" },
          },
          accountPrefill: {
            siteType: SITE_TYPES.UNKNOWN,
            siteUrl: "https://unknown.example.com",
          },
        },
      ],
    }

    expect(() =>
      normalizeSponsorCatalog(catalog, {
        locale: "en",
        now,
        source: SPONSOR_CATALOG_SOURCES.Remote,
      }),
    ).not.toThrow()

    const result = normalizeSponsorCatalog(catalog, {
      locale: "en",
      now,
      source: SPONSOR_CATALOG_SOURCES.Remote,
    })

    expect(result.ok).toBe(false)
    expect(result.items).toEqual([])
    expect(result.errors).toEqual([
      "item unknown-supported has invalid accountPrefill",
    ])
  })

  it("rejects malformed sponsor account prefill auth types without throwing", () => {
    const catalog: RawSponsorCatalog = {
      schemaVersion: SPONSOR_CATALOG_SCHEMA_VERSION,
      items: [
        {
          id: "bad-auth-type",
          enabled: true,
          supportStatus: SPONSOR_SUPPORT_STATUS.Supported,
          urls: {
            primaryAffiliate: "https://example.com/bad-auth-type",
          },
          locales: {
            en: { name: "Bad Auth Type", tagline: "Malformed auth type" },
          },
          accountPrefill: {
            siteType: SITE_TYPES.NEW_API,
            siteUrl: "https://bad-auth-type.example.com",
            authType: "session-header",
          },
        },
      ],
    }

    expect(() =>
      normalizeSponsorCatalog(catalog, {
        locale: "en",
        now,
        source: SPONSOR_CATALOG_SOURCES.Remote,
      }),
    ).not.toThrow()

    const result = normalizeSponsorCatalog(catalog, {
      locale: "en",
      now,
      source: SPONSOR_CATALOG_SOURCES.Remote,
    })

    expect(result.ok).toBe(false)
    expect(result.items).toEqual([])
    expect(result.errors).toEqual([
      "item bad-auth-type has invalid accountPrefill",
    ])
  })

  it("trims sponsor ids before validation, sorting, and output", () => {
    const catalog: RawSponsorCatalog = {
      schemaVersion: SPONSOR_CATALOG_SCHEMA_VERSION,
      items: [
        {
          id: "z",
          enabled: true,
          rank: 1,
          supportStatus: SPONSOR_SUPPORT_STATUS.Supported,
          urls: {
            primaryAffiliate: "https://example.com/z",
          },
          locales: {
            en: { name: "Z", tagline: "Sponsor Z" },
          },
        },
        {
          id: "  padded-id  ",
          enabled: true,
          rank: 1,
          supportStatus: SPONSOR_SUPPORT_STATUS.Supported,
          urls: {
            primaryAffiliate: "https://example.com/padded-id",
          },
          locales: {
            en: { name: "Padded", tagline: "Sponsor with padded id" },
          },
        },
      ],
    }

    const result = normalizeSponsorCatalog(catalog, {
      locale: "en",
      now,
      source: SPONSOR_CATALOG_SOURCES.Remote,
    })

    expect(result.errors).toEqual([])
    expect(result.items.map((item) => item.id)).toEqual(["padded-id", "z"])
  })

  it("returns all recommendations for each surface while preserving ordering", () => {
    const catalog: RawSponsorCatalog = {
      schemaVersion: SPONSOR_CATALOG_SCHEMA_VERSION,
      items: [
        {
          id: "c",
          enabled: true,
          rank: 3,
          supportStatus: SPONSOR_SUPPORT_STATUS.Unsupported,
          urls: {
            primaryAffiliate: "https://example.com/c",
          },
          locales: {
            en: { name: "C", tagline: "Sponsor C" },
          },
        },
        {
          id: "a",
          enabled: true,
          rank: 1,
          supportStatus: SPONSOR_SUPPORT_STATUS.Supported,
          urls: {
            primaryAffiliate: "https://example.com/a",
          },
          locales: {
            en: { name: "A", tagline: "Sponsor A" },
          },
        },
        {
          id: "b",
          enabled: true,
          rank: 2,
          supportStatus: SPONSOR_SUPPORT_STATUS.Unsupported,
          urls: {
            primaryAffiliate: "https://example.com/b",
          },
          locales: {
            en: { name: "B", tagline: "Sponsor B" },
          },
        },
      ],
    }

    const result = normalizeSponsorCatalog(catalog, {
      locale: "en",
      now,
      source: SPONSOR_CATALOG_SOURCES.Bundled,
    })

    expect(
      selectSponsorRecommendations(
        result.items,
        SPONSOR_RECOMMENDATION_SURFACES.Newcomer,
      ).map((item) => item.id),
    ).toEqual(["a", "b", "c"])
    expect(
      selectSponsorRecommendations(
        result.items,
        SPONSOR_RECOMMENDATION_SURFACES.AddAccountDialog,
      ).map((item) => item.id),
    ).toEqual(["a", "b", "c"])
  })
})
