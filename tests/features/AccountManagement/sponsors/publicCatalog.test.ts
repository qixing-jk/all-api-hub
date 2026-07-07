import { existsSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { bundledSponsorCatalog } from "~/features/AccountManagement/sponsors/bundledCatalog"
import { normalizeSponsorCatalog } from "~/features/AccountManagement/sponsors/catalog"
import {
  SPONSOR_CATALOG_SCHEMA_VERSION,
  SPONSOR_REMOTE_CATALOG_V5_URL,
} from "~/features/AccountManagement/sponsors/constants"
import { SPONSOR_CATALOG_SOURCES } from "~/features/AccountManagement/sponsors/types"
import { AuthTypeEnum } from "~/types"
import legacySponsorCatalog from "~~/public/sponsor-catalog.json"
import publicSponsorCatalogV4 from "~~/public/sponsor-catalog.v4.json"
import publicSponsorCatalogV5 from "~~/public/sponsor-catalog.v5.json"

const now = Date.UTC(2026, 4, 25)

function expectHttpsUrl(value: unknown) {
  expect(typeof value).toBe("string")
  const url = new URL(value as string)
  expect(url.protocol).toBe("https:")
}

describe("public sponsor catalog artifacts", () => {
  it("keeps the V3 public catalog as a legacy artifact for old clients", () => {
    expect(legacySponsorCatalog.schemaVersion).toBe(3)
    expect(legacySponsorCatalog.items.length).toBeGreaterThan(0)
  })

  it("keeps the V4 public catalog as a legacy artifact for old clients", () => {
    expect(publicSponsorCatalogV4.schemaVersion).toBe(4)
    expect(publicSponsorCatalogV4.items.length).toBeGreaterThan(0)
  })

  it("does not publish a runtime manifest artifact for catalog clients", () => {
    expect(
      existsSync(
        resolve(process.cwd(), "public/sponsor-catalog-manifest.json"),
      ),
    ).toBe(false)
  })

  it("uses the V5 public catalog as the runtime source", () => {
    expect(publicSponsorCatalogV5.schemaVersion).toBe(
      SPONSOR_CATALOG_SCHEMA_VERSION,
    )
    expect(new URL(SPONSOR_REMOTE_CATALOG_V5_URL).pathname).toBe(
      "/qixing-jk/all-api-hub/main/public/sponsor-catalog.v5.json",
    )

    const productionResult = normalizeSponsorCatalog(publicSponsorCatalogV5, {
      locale: "zh-CN",
      now,
      source: SPONSOR_CATALOG_SOURCES.Remote,
      currentVersion: "3.52.0",
      browserFamily: "chromium",
    })

    expect(productionResult.errors).toEqual([])
    expect(productionResult.ok).toBe(true)
    expect(productionResult.items.length).toBeGreaterThan(0)
    productionResult.items.forEach((item) => {
      expect(item.schemaVersion).toBe(SPONSOR_CATALOG_SCHEMA_VERSION)
      expect(item.source).toBe(SPONSOR_CATALOG_SOURCES.Remote)
      expect(item.selectedLocale).toBeTruthy()
      expectHttpsUrl(item.links.primary)

      const { addAccount, apiCredentialProfileFallback, bookmarkFallback } =
        item.actions
      if (addAccount) {
        expectHttpsUrl(addAccount.siteUrl)
      }
      if (apiCredentialProfileFallback) {
        expectHttpsUrl(apiCredentialProfileFallback.baseUrl)
        if (apiCredentialProfileFallback.apiKeyCreateUrl) {
          expectHttpsUrl(apiCredentialProfileFallback.apiKeyCreateUrl)
        }
      }
      if (bookmarkFallback) {
        expectHttpsUrl(bookmarkFallback.url)
      }
    })

    expect(bundledSponsorCatalog).toBe(publicSponsorCatalogV5)
  })

  it("validates V5 development examples", () => {
    const examplesResult = normalizeSponsorCatalog(
      {
        schemaVersion: publicSponsorCatalogV5.schemaVersion,
        items: publicSponsorCatalogV5._examples?.devSponsors ?? [],
      },
      {
        locale: "zh-CN",
        now,
        source: SPONSOR_CATALOG_SOURCES.Bundled,
        currentVersion: "3.52.0",
        browserFamily: "chromium",
      },
    )

    expect(examplesResult.errors).toEqual([])
    expect(examplesResult.ok).toBe(true)
    expect(examplesResult.items.map((item) => item.id)).toContain(
      "dev-supported-direct",
    )

    expect(
      examplesResult.items.find((item) => item.id === "dev-supported-direct"),
    ).toMatchObject({
      postClickNote:
        "测试 Cookie 认证预填后的提示，会显示在新建账号 URL 下方。",
      actions: {
        addAccount: {
          siteType: SITE_TYPES.NEW_API,
          siteUrl: "https://dev-supported.example.test",
          authType: AuthTypeEnum.Cookie,
        },
      },
    })

    expect(
      examplesResult.items.find(
        (item) => item.id === "dev-unsupported-all-fallbacks",
      ),
    ).toMatchObject({
      actions: {
        apiCredentialProfileFallback: {
          apiKeyCreateUrl:
            "https://dev-all-fallbacks.example.test/dashboard/api-keys?utm_source=all-api-hub",
          apiKeyCreateHint:
            "测试赞助商提供的活动提示，可同时显示在添加账号和获取 API Key 的引导中。",
        },
        bookmarkFallback: {
          url: "https://dev-all-fallbacks.example.test",
        },
      },
    })
  })
})
