import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  SPONSOR_CATALOG_SCHEMA_VERSION,
  SPONSOR_REMOTE_CATALOG_URL,
} from "~/features/AccountManagement/sponsors/constants"
import {
  loadSponsorRecommendations,
  refreshSponsorRecommendations,
} from "~/features/AccountManagement/sponsors/loader"
import { sponsorCatalogStorage } from "~/features/AccountManagement/sponsors/storage"
import {
  SPONSOR_CATALOG_SOURCES,
  SPONSOR_SUPPORT_STATUS,
  type RawSponsorCatalog,
} from "~/features/AccountManagement/sponsors/types"
import { AuthTypeEnum } from "~/types"

const sponsorLoaderFixtures = vi.hoisted(() => ({
  developmentSponsors: [
    {
      id: "dev-supported-direct",
      enabled: true,
      rank: 9000,
      supportStatus: "supported",
      urls: {
        primaryAffiliate: "https://dev-supported.example.test/register",
        website: "https://dev-supported.example.test",
      },
      locales: {
        "zh-CN": {
          name: "[DEV] 可直接添加",
          tagline: "测试 Cookie 认证的 accountPrefill 主按钮和添加账号预填。",
          postClickNote:
            "测试 Cookie 认证预填后的提示，会显示在新建账号 URL 下方。",
        },
      },
      accountPrefill: {
        siteType: "new-api",
        siteUrl: "https://dev-supported.example.test",
        authType: "cookie",
      },
    },
    {
      id: "dev-supported-access-token",
      enabled: true,
      rank: 9010,
      supportStatus: "supported",
      urls: {
        primaryAffiliate: "https://dev-token.example.test/register",
        website: "https://dev-token.example.test",
        apiKeyCreate:
          "https://dev-token.example.test/dashboard/api-keys?utm_source=all-api-hub",
      },
      locales: {
        "zh-CN": {
          name: "[DEV] 访问令牌",
          tagline: "测试 access token 认证预填。",
          postClickNote:
            "测试访问令牌认证预填后的提示，会显示在新建账号 URL 下方。",
        },
      },
      accountPrefill: {
        siteType: "new-api",
        siteUrl: "https://dev-token.example.test",
        authType: "access_token",
      },
    },
    {
      id: "dev-unsupported-all-fallbacks",
      enabled: true,
      rank: 9020,
      supportStatus: "unsupported",
      urls: {
        primaryAffiliate: "https://dev-all-fallbacks.example.test/register",
        website: "https://dev-all-fallbacks.example.test",
        apiKeyCreate:
          "https://dev-all-fallbacks.example.test/dashboard/api-keys?utm_source=all-api-hub",
      },
      locales: {
        "zh-CN": {
          name: "[DEV] 全部兜底",
          tagline: "测试全部兜底入口。",
          postClickNote:
            "测试赞助商提供的活动提示，可同时显示在添加账号和获取 API Key 的引导中。",
        },
      },
      fallbackHints: {
        bookmarkManager: true,
        apiCredentialProfiles: true,
      },
    },
  ],
  bundledCatalog: {
    schemaVersion: 3,
    items: [
      {
        id: "bundled-provider",
        enabled: true,
        rank: 10,
        supportStatus: "supported",
        urls: {
          primaryAffiliate: "https://bundled.example.com/affiliate",
          website: "https://bundled.example.com",
        },
        locales: {
          "zh-CN": {
            name: "本地服务",
            tagline: "本地推荐",
          },
          en: {
            name: "Bundled Provider",
            tagline: "Bundled recommendation",
          },
        },
        accountPrefill: {
          siteType: "new-api",
          siteUrl: "https://bundled.example.com",
          authType: "access_token",
        },
      },
    ],
    _examples: {
      devSponsors: [] as RawSponsorCatalog["items"],
    },
  },
}))

sponsorLoaderFixtures.bundledCatalog._examples.devSponsors =
  sponsorLoaderFixtures.developmentSponsors

vi.mock("~~/public/sponsor-catalog.json", () => ({
  default: sponsorLoaderFixtures.bundledCatalog,
}))

vi.mock("~/features/AccountManagement/sponsors/storage", () => ({
  sponsorCatalogStorage: {
    getCachedRemoteCatalog: vi.fn(),
    setCachedRemoteCatalog: vi.fn(),
  },
}))

const now = Date.UTC(2026, 4, 25)

const validRemoteCatalog: RawSponsorCatalog = {
  schemaVersion: SPONSOR_CATALOG_SCHEMA_VERSION,
  items: [
    {
      id: "remote-provider",
      enabled: true,
      rank: 1,
      supportStatus: SPONSOR_SUPPORT_STATUS.Supported,
      urls: {
        primaryAffiliate: "https://remote.example.com/affiliate",
        website: "https://remote.example.com",
      },
      locales: {
        "zh-CN": {
          name: "远程服务",
          tagline: "远程推荐",
        },
        en: {
          name: "Remote Provider",
          tagline: "Remote recommendation",
        },
      },
      accountPrefill: {
        siteType: SITE_TYPES.NEW_API,
        siteUrl: "https://remote.example.com",
      },
      fallbackHints: {
        apiCredentialProfiles: true,
      },
    },
  ],
}

const invalidCachedCatalog: RawSponsorCatalog = {
  schemaVersion: SPONSOR_CATALOG_SCHEMA_VERSION,
  items: [],
}

function mockFetchJson(payload: unknown, ok = true) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 500,
    json: vi.fn().mockResolvedValue(payload),
  })
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

function expectBundledSponsorFallback(
  result: Awaited<ReturnType<typeof loadSponsorRecommendations>>,
) {
  expect(result.source).toBe(SPONSOR_CATALOG_SOURCES.Bundled)
  expect(result.items).toEqual([
    expect.objectContaining({
      id: "bundled-provider",
      name: "本地服务",
      source: SPONSOR_CATALOG_SOURCES.Bundled,
      accountPrefill: expect.objectContaining({
        authType: AuthTypeEnum.AccessToken,
        siteType: SITE_TYPES.NEW_API,
        siteUrl: "https://bundled.example.com",
      }),
    }),
  ])
}

describe("sponsor recommendation loader", () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    sponsorLoaderFixtures.bundledCatalog._examples.devSponsors =
      sponsorLoaderFixtures.developmentSponsors
    vi.mocked(sponsorCatalogStorage.getCachedRemoteCatalog).mockReset()
    vi.mocked(sponsorCatalogStorage.setCachedRemoteCatalog).mockReset()
  })

  it("returns cached valid recommendations without waiting for remote refresh", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    vi.mocked(sponsorCatalogStorage.getCachedRemoteCatalog).mockResolvedValue(
      validRemoteCatalog,
    )

    const result = await loadSponsorRecommendations({ locale: "zh-CN", now })

    expect(result.items.map((item) => item.id)).toEqual(["remote-provider"])
    expect(result.source).toBe(SPONSOR_CATALOG_SOURCES.Cached)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("merges development examples with cached recommendations in development", async () => {
    vi.stubEnv("MODE", "development")
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    vi.mocked(sponsorCatalogStorage.getCachedRemoteCatalog).mockResolvedValue(
      validRemoteCatalog,
    )

    const result = await loadSponsorRecommendations({ locale: "zh-CN", now })

    expect(result.source).toBe(SPONSOR_CATALOG_SOURCES.Cached)
    expect(result.items.map((item) => item.id)).toEqual([
      "remote-provider",
      "dev-supported-direct",
      "dev-supported-access-token",
      "dev-unsupported-all-fallbacks",
    ])
    expect(
      result.items.find((item) => item.id === "remote-provider"),
    ).toMatchObject({
      source: SPONSOR_CATALOG_SOURCES.Cached,
    })
    expect(
      result.items.find((item) => item.id === "dev-supported-direct"),
    ).toMatchObject({
      source: SPONSOR_CATALOG_SOURCES.Bundled,
      accountPrefill: {
        authType: AuthTypeEnum.Cookie,
      },
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("preserves rank ordering when development examples merge with cached recommendations", async () => {
    vi.stubEnv("MODE", "development")
    sponsorLoaderFixtures.bundledCatalog._examples.devSponsors = [
      {
        ...sponsorLoaderFixtures.developmentSponsors[0],
        id: "dev-first",
        rank: 0,
      },
      {
        ...sponsorLoaderFixtures.developmentSponsors[1],
        id: "dev-later",
        rank: 20,
      },
    ]
    vi.mocked(sponsorCatalogStorage.getCachedRemoteCatalog).mockResolvedValue(
      validRemoteCatalog,
    )

    const result = await loadSponsorRecommendations({ locale: "zh-CN", now })

    expect(result.items.map((item) => item.id)).toEqual([
      "dev-first",
      "remote-provider",
      "dev-later",
    ])
  })

  it("keeps cached recommendations when development examples are invalid", async () => {
    vi.stubEnv("MODE", "development")
    sponsorLoaderFixtures.bundledCatalog._examples.devSponsors = [
      {
        ...sponsorLoaderFixtures.developmentSponsors[0],
        enabled: "yes",
      } as unknown as RawSponsorCatalog["items"][number],
    ]
    vi.mocked(sponsorCatalogStorage.getCachedRemoteCatalog).mockResolvedValue(
      validRemoteCatalog,
    )

    const result = await loadSponsorRecommendations({ locale: "zh-CN", now })

    expect(result.source).toBe(SPONSOR_CATALOG_SOURCES.Cached)
    expect(result.items.map((item) => item.id)).toEqual(["remote-provider"])
  })

  it("refreshes and caches valid remote recommendations separately", async () => {
    const fetchMock = mockFetchJson(validRemoteCatalog)

    const result = await refreshSponsorRecommendations({
      locale: "zh-CN",
      now,
    })

    expect(result?.items.map((item) => item.id)).toEqual(["remote-provider"])
    expect(result?.source).toBe(SPONSOR_CATALOG_SOURCES.Remote)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(SPONSOR_REMOTE_CATALOG_URL, {
      cache: "no-store",
    })
    expect(sponsorCatalogStorage.setCachedRemoteCatalog).toHaveBeenCalledWith(
      validRemoteCatalog,
    )
  })

  it("merges development examples with refreshed remote recommendations in development", async () => {
    vi.stubEnv("MODE", "development")
    mockFetchJson(validRemoteCatalog)

    const result = await refreshSponsorRecommendations({
      locale: "zh-CN",
      now,
    })

    expect(result?.source).toBe(SPONSOR_CATALOG_SOURCES.Remote)
    expect(result?.items.map((item) => item.id)).toEqual([
      "remote-provider",
      "dev-supported-direct",
      "dev-supported-access-token",
      "dev-unsupported-all-fallbacks",
    ])
    expect(
      result?.items.find((item) => item.id === "remote-provider"),
    ).toMatchObject({
      source: SPONSOR_CATALOG_SOURCES.Remote,
    })
    expect(
      result?.items.find((item) => item.id === "dev-supported-direct"),
    ).toMatchObject({
      source: SPONSOR_CATALOG_SOURCES.Bundled,
      accountPrefill: {
        authType: AuthTypeEnum.Cookie,
      },
    })
    expect(sponsorCatalogStorage.setCachedRemoteCatalog).toHaveBeenCalledWith(
      validRemoteCatalog,
    )
  })

  it("falls back to bundled recommendations when cache is invalid", async () => {
    const fetchMock = mockFetchJson(validRemoteCatalog)
    vi.mocked(sponsorCatalogStorage.getCachedRemoteCatalog).mockResolvedValue(
      invalidCachedCatalog,
    )

    const result = await loadSponsorRecommendations({ locale: "zh-CN", now })

    expectBundledSponsorFallback(result)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("rejects invalid remote payloads without replacing cache", async () => {
    mockFetchJson({
      ...validRemoteCatalog,
      schemaVersion: 999,
    })

    const result = await refreshSponsorRecommendations({
      locale: "zh-CN",
      now,
    })

    expect(result).toBeNull()
    expect(sponsorCatalogStorage.setCachedRemoteCatalog).not.toHaveBeenCalled()
  })

  it("does not let missing cache block bundled recommendations", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    vi.mocked(sponsorCatalogStorage.getCachedRemoteCatalog).mockResolvedValue(
      null,
    )

    const result = await loadSponsorRecommendations({ locale: "zh-CN", now })

    expectBundledSponsorFallback(result)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("falls back to bundled recommendations when cache reads fail", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    vi.mocked(sponsorCatalogStorage.getCachedRemoteCatalog).mockRejectedValue(
      new Error("storage unavailable"),
    )

    const result = await loadSponsorRecommendations({ locale: "zh-CN", now })

    expectBundledSponsorFallback(result)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("injects public catalog examples into bundled recommendations only in development", async () => {
    vi.stubEnv("MODE", "development")
    vi.mocked(sponsorCatalogStorage.getCachedRemoteCatalog).mockResolvedValue(
      null,
    )

    const result = await loadSponsorRecommendations({ locale: "zh-CN", now })

    expect(result.source).toBe(SPONSOR_CATALOG_SOURCES.Bundled)
    expect(result.items.map((item) => item.id)).toContain(
      "dev-supported-direct",
    )
    expect(result.items.map((item) => item.id)).toContain(
      "dev-supported-access-token",
    )
    expect(result.items.map((item) => item.id)).toContain(
      "dev-unsupported-all-fallbacks",
    )
    expect(
      result.items.find((item) => item.id === "dev-supported-direct"),
    ).toMatchObject({
      postClickNote:
        "测试 Cookie 认证预填后的提示，会显示在新建账号 URL 下方。",
      accountPrefill: {
        authType: AuthTypeEnum.Cookie,
      },
    })
    expect(
      result.items.find((item) => item.id === "dev-supported-access-token"),
    ).toMatchObject({
      apiKeyCreateUrl:
        "https://dev-token.example.test/dashboard/api-keys?utm_source=all-api-hub",
      postClickNote:
        "测试访问令牌认证预填后的提示，会显示在新建账号 URL 下方。",
      accountPrefill: {
        authType: AuthTypeEnum.AccessToken,
      },
    })
    expect(
      result.items.find((item) => item.id === "dev-unsupported-all-fallbacks"),
    ).toMatchObject({
      apiKeyCreateUrl:
        "https://dev-all-fallbacks.example.test/dashboard/api-keys?utm_source=all-api-hub",
      postClickNote:
        "测试赞助商提供的活动提示，可同时显示在添加账号和获取 API Key 的引导中。",
      fallbackHints: {
        bookmarkManager: true,
        apiCredentialProfiles: true,
      },
    })
  })

  it("does not inject public catalog examples outside development", async () => {
    vi.stubEnv("MODE", "production")
    vi.mocked(sponsorCatalogStorage.getCachedRemoteCatalog).mockResolvedValue(
      null,
    )

    const result = await loadSponsorRecommendations({ locale: "zh-CN", now })

    expect(result.source).toBe(SPONSOR_CATALOG_SOURCES.Bundled)
    expect(result.items.map((item) => item.id)).not.toContain(
      "dev-supported-direct",
    )
  })

  it("does not inject development examples when none are configured", async () => {
    vi.stubEnv("MODE", "development")
    sponsorLoaderFixtures.bundledCatalog._examples.devSponsors = []
    vi.mocked(sponsorCatalogStorage.getCachedRemoteCatalog).mockResolvedValue(
      null,
    )

    const result = await loadSponsorRecommendations({ locale: "zh-CN", now })

    expectBundledSponsorFallback(result)
  })

  it("returns null when remote refresh fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")))

    await expect(
      refreshSponsorRecommendations({ locale: "zh-CN", now }),
    ).resolves.toBeNull()
  })
})
