import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  SPONSOR_CATALOG_SCHEMA_VERSION,
  SPONSOR_REMOTE_CATALOG_V4_URL,
} from "~/features/AccountManagement/sponsors/constants"
import {
  loadSponsorRecommendations,
  refreshSponsorRecommendations,
} from "~/features/AccountManagement/sponsors/loader"
import { sponsorCatalogStorage } from "~/features/AccountManagement/sponsors/storage"
import {
  SPONSOR_CATALOG_SOURCES,
  SPONSOR_SUPPORT_STATUS,
} from "~/features/AccountManagement/sponsors/types"
import { AuthTypeEnum } from "~/types"

const sponsorLoaderFixtures = vi.hoisted(() => ({
  bundledCatalog: {
    schemaVersion: 4,
    items: [
      {
        id: "bundled-provider",
        locales: {
          "zh-CN": {
            enabled: true,
            rank: 10,
            supportStatus: "supported",
            name: "本地服务",
            tagline: "本地推荐",
            links: {
              primary: "https://bundled.example.invalid/affiliate",
            },
            actions: {
              addAccount: {
                siteType: "new-api",
                siteUrl: "https://bundled.example.invalid",
                authType: "access_token",
              },
            },
          },
          en: {
            enabled: true,
            rank: 10,
            supportStatus: "supported",
            name: "Bundled Provider",
            tagline: "Bundled recommendation",
            links: {
              primary: "https://bundled.example.invalid/affiliate",
            },
            actions: {
              addAccount: {
                siteType: "new-api",
                siteUrl: "https://bundled.example.invalid",
                authType: "access_token",
              },
            },
          },
        },
      },
    ],
    _examples: {
      devSponsors: [
        {
          id: "dev-supported-direct",
          locales: {
            "zh-CN": {
              enabled: true,
              rank: 9000,
              supportStatus: "supported",
              name: "[DEV] 可直接添加",
              tagline:
                "测试 Cookie 认证的 accountPrefill 主按钮和添加账号预填。",
              postClickNote:
                "测试 Cookie 认证预填后的提示，会显示在新建账号 URL 下方。",
              links: {
                primary:
                  "https://dev-supported.example.test/register?utm_source=all-api-hub",
              },
              actions: {
                addAccount: {
                  siteType: "new-api",
                  siteUrl: "https://dev-supported.example.test",
                  authType: "cookie",
                },
              },
            },
          },
        },
        {
          id: "dev-unsupported-all-fallbacks",
          locales: {
            "zh-CN": {
              enabled: true,
              rank: 9010,
              supportStatus: "unsupported",
              name: "[DEV] 全部兜底",
              tagline: "测试全部兜底入口。",
              postClickNote:
                "测试赞助商提供的活动提示，可同时显示在添加账号和获取 API Key 的引导中。",
              links: {
                primary: "https://dev-all-fallbacks.example.test/register",
              },
              actions: {
                bookmarkFallback: {
                  url: "https://dev-all-fallbacks.example.test",
                },
                apiCredentialProfileFallback: {
                  baseUrl: "https://dev-all-fallbacks.example.test",
                  apiKeyCreateUrl:
                    "https://dev-all-fallbacks.example.test/dashboard/api-keys?utm_source=all-api-hub",
                  apiKeyCreateHint:
                    "测试赞助商提供的活动提示，可同时显示在添加账号和获取 API Key 的引导中。",
                },
              },
            },
          },
        },
      ],
    },
  },
}))

vi.mock("~~/public/sponsor-catalog.v4.json", () => ({
  default: sponsorLoaderFixtures.bundledCatalog,
}))

vi.mock("~/features/AccountManagement/sponsors/storage", () => ({
  sponsorCatalogStorage: {
    getCachedVersionedCatalog: vi.fn(),
    setCachedVersionedCatalog: vi.fn(),
  },
}))

const now = Date.UTC(2026, 4, 25)

function createV4Catalog(
  id: string,
  primary = `https://${id}.example.invalid`,
) {
  return {
    schemaVersion: SPONSOR_CATALOG_SCHEMA_VERSION,
    items: [
      {
        id,
        locales: {
          en: {
            enabled: true,
            rank: 1,
            supportStatus: SPONSOR_SUPPORT_STATUS.Unsupported,
            name: `${id} Provider`,
            tagline: `${id} campaign.`,
            links: {
              primary,
            },
            actions: {
              apiCredentialProfileFallback: {
                baseUrl: `https://api.${id}.example.invalid/v1`,
              },
            },
          },
        },
      },
    ],
  }
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
      actions: {
        addAccount: {
          authType: AuthTypeEnum.AccessToken,
          siteType: SITE_TYPES.NEW_API,
          siteUrl: "https://bundled.example.invalid",
        },
      },
    }),
  ])
}

describe("sponsor recommendation loader", () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    vi.mocked(sponsorCatalogStorage.getCachedVersionedCatalog).mockReset()
    vi.mocked(sponsorCatalogStorage.setCachedVersionedCatalog).mockReset()
  })

  it("returns cached V4 recommendations without waiting for remote refresh", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    vi.mocked(
      sponsorCatalogStorage.getCachedVersionedCatalog,
    ).mockResolvedValue({
      schemaVersion: 4,
      sourceUrl: SPONSOR_REMOTE_CATALOG_V4_URL,
      fetchedAt: now,
      payload: createV4Catalog("cached-v4"),
    })

    const result = await loadSponsorRecommendations({ locale: "en", now })

    expect(result.items.map((item) => item.id)).toEqual(["cached-v4"])
    expect(result.source).toBe(SPONSOR_CATALOG_SOURCES.Cached)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(
      sponsorCatalogStorage.getCachedVersionedCatalog,
    ).toHaveBeenCalledWith({
      schemaVersion: SPONSOR_CATALOG_SCHEMA_VERSION,
      sourceUrl: SPONSOR_REMOTE_CATALOG_V4_URL,
    })
  })

  it("merges development examples with cached recommendations in development", async () => {
    vi.stubEnv("MODE", "development")
    vi.stubGlobal("fetch", vi.fn())
    vi.mocked(
      sponsorCatalogStorage.getCachedVersionedCatalog,
    ).mockResolvedValue({
      schemaVersion: 4,
      sourceUrl: SPONSOR_REMOTE_CATALOG_V4_URL,
      fetchedAt: now,
      payload: createV4Catalog("cached-v4"),
    })

    const result = await loadSponsorRecommendations({ locale: "zh-CN", now })

    expect(result.source).toBe(SPONSOR_CATALOG_SOURCES.Cached)
    expect(result.items.map((item) => item.id)).toEqual([
      "cached-v4",
      "dev-supported-direct",
      "dev-unsupported-all-fallbacks",
    ])
    expect(
      result.items.find((item) => item.id === "dev-supported-direct"),
    ).toMatchObject({
      source: SPONSOR_CATALOG_SOURCES.Bundled,
      actions: {
        addAccount: {
          authType: AuthTypeEnum.Cookie,
        },
      },
    })
  })

  it("refreshes and caches valid remote V4 recommendations", async () => {
    const remoteCatalog = createV4Catalog("remote-v4")
    const fetchMock = mockFetchJson(remoteCatalog)

    const result = await refreshSponsorRecommendations({ locale: "en", now })

    expect(result?.items.map((item) => item.id)).toEqual(["remote-v4"])
    expect(result?.source).toBe(SPONSOR_CATALOG_SOURCES.Remote)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(SPONSOR_REMOTE_CATALOG_V4_URL, {
      cache: "no-store",
    })
    expect(
      sponsorCatalogStorage.setCachedVersionedCatalog,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        schemaVersion: SPONSOR_CATALOG_SCHEMA_VERSION,
        sourceUrl: SPONSOR_REMOTE_CATALOG_V4_URL,
        payload: remoteCatalog,
      }),
    )
  })

  it("falls back to bundled recommendations when cache is invalid", async () => {
    vi.stubGlobal("fetch", vi.fn())
    vi.mocked(
      sponsorCatalogStorage.getCachedVersionedCatalog,
    ).mockResolvedValue({
      schemaVersion: 4,
      sourceUrl: SPONSOR_REMOTE_CATALOG_V4_URL,
      fetchedAt: now,
      payload: {
        schemaVersion: 4,
        items: [],
      },
    })

    const result = await loadSponsorRecommendations({ locale: "zh-CN", now })

    expectBundledSponsorFallback(result)
  })

  it("ignores legacy V3 cache and falls back to bundled V4 recommendations", async () => {
    vi.stubGlobal("fetch", vi.fn())
    vi.mocked(
      sponsorCatalogStorage.getCachedVersionedCatalog,
    ).mockResolvedValue(null)

    const result = await loadSponsorRecommendations({ locale: "zh-CN", now })

    expectBundledSponsorFallback(result)
  })

  it("does not let cache read failures block bundled recommendations", async () => {
    vi.stubGlobal("fetch", vi.fn())
    vi.mocked(
      sponsorCatalogStorage.getCachedVersionedCatalog,
    ).mockRejectedValue(new Error("storage unavailable"))

    const result = await loadSponsorRecommendations({ locale: "zh-CN", now })

    expectBundledSponsorFallback(result)
  })

  it("rejects invalid remote payloads without replacing cache", async () => {
    mockFetchJson({
      ...createV4Catalog("invalid-v4"),
      schemaVersion: 999,
    })

    const result = await refreshSponsorRecommendations({ locale: "en", now })

    expect(result).toBeNull()
    expect(
      sponsorCatalogStorage.setCachedVersionedCatalog,
    ).not.toHaveBeenCalled()
  })

  it("returns null when the remote catalog resource is unavailable", async () => {
    const fetchMock = mockFetchJson(
      {
        success: false,
      },
      false,
    )

    await expect(
      refreshSponsorRecommendations({ locale: "en", now }),
    ).resolves.toBeNull()

    expect(fetchMock).toHaveBeenCalledWith(SPONSOR_REMOTE_CATALOG_V4_URL, {
      cache: "no-store",
    })
    expect(
      sponsorCatalogStorage.setCachedVersionedCatalog,
    ).not.toHaveBeenCalled()
  })

  it("returns refreshed recommendations when cache persistence fails", async () => {
    const remoteCatalog = createV4Catalog("remote-v4")
    mockFetchJson(remoteCatalog)
    vi.mocked(
      sponsorCatalogStorage.setCachedVersionedCatalog,
    ).mockRejectedValue(new Error("storage unavailable"))

    const result = await refreshSponsorRecommendations({ locale: "en", now })

    expect(result?.items.map((item) => item.id)).toEqual(["remote-v4"])
    expect(result?.source).toBe(SPONSOR_CATALOG_SOURCES.Remote)
  })

  it("returns null when remote refresh fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")))

    await expect(
      refreshSponsorRecommendations({ locale: "zh-CN", now }),
    ).resolves.toBeNull()
  })
})
