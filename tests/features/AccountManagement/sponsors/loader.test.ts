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

describe("sponsor recommendation loader", () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
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

  it("falls back to bundled recommendations when cache is invalid", async () => {
    const fetchMock = mockFetchJson(validRemoteCatalog)
    vi.mocked(sponsorCatalogStorage.getCachedRemoteCatalog).mockResolvedValue(
      invalidCachedCatalog,
    )

    const result = await loadSponsorRecommendations({ locale: "zh-CN", now })

    expect(result.items).toEqual([])
    expect(result.source).toBe(SPONSOR_CATALOG_SOURCES.Bundled)
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

    expect(result.items).toEqual([])
    expect(result.source).toBe(SPONSOR_CATALOG_SOURCES.Bundled)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("falls back to bundled recommendations when cache reads fail", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    vi.mocked(sponsorCatalogStorage.getCachedRemoteCatalog).mockRejectedValue(
      new Error("storage unavailable"),
    )

    const result = await loadSponsorRecommendations({ locale: "zh-CN", now })

    expect(result.items).toEqual([])
    expect(result.source).toBe(SPONSOR_CATALOG_SOURCES.Bundled)
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

  it("returns null when remote refresh fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")))

    await expect(
      refreshSponsorRecommendations({ locale: "zh-CN", now }),
    ).resolves.toBeNull()
  })
})
