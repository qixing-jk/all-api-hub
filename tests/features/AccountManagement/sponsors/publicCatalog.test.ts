import { existsSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { bundledSponsorCatalog } from "~/features/AccountManagement/sponsors/bundledCatalog"
import { normalizeSponsorCatalog } from "~/features/AccountManagement/sponsors/catalog"
import {
  SPONSOR_CATALOG_SCHEMA_VERSION,
  SPONSOR_REMOTE_CATALOG_V4_URL,
} from "~/features/AccountManagement/sponsors/constants"
import { SPONSOR_CATALOG_SOURCES } from "~/features/AccountManagement/sponsors/types"
import { AuthTypeEnum } from "~/types"
import legacySponsorCatalog from "~~/public/sponsor-catalog.json"
import publicSponsorCatalogV4 from "~~/public/sponsor-catalog.v4.json"

const now = Date.UTC(2026, 4, 25)

describe("public sponsor catalog artifacts", () => {
  it("keeps the V3 public catalog as a legacy artifact for old clients", () => {
    expect(legacySponsorCatalog.schemaVersion).toBe(3)
    expect(legacySponsorCatalog.items.map((item) => item.id)).toEqual([
      "volcengine-coding-plan",
      "xingchen-ai",
      "packycode",
      "runapi",
    ])
  })

  it("does not publish a runtime manifest artifact for V4-only clients", () => {
    expect(
      existsSync(
        resolve(process.cwd(), "public/sponsor-catalog-manifest.json"),
      ),
    ).toBe(false)
  })

  it("uses the V4 public catalog as the runtime source", () => {
    expect(publicSponsorCatalogV4.schemaVersion).toBe(
      SPONSOR_CATALOG_SCHEMA_VERSION,
    )
    expect(new URL(SPONSOR_REMOTE_CATALOG_V4_URL).pathname).toBe(
      "/qixing-jk/all-api-hub/main/public/sponsor-catalog.v4.json",
    )

    const productionResult = normalizeSponsorCatalog(publicSponsorCatalogV4, {
      locale: "zh-CN",
      now,
      source: SPONSOR_CATALOG_SOURCES.Remote,
    })

    expect(productionResult.errors).toEqual([])
    expect(productionResult.items.map((item) => item.id)).toEqual([
      "volcengine-coding-plan",
      "xingchen-ai",
      "packycode",
      "runapi",
    ])
    expect(productionResult.items[0]).toMatchObject({
      actions: {
        apiCredentialProfileFallback: {
          baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
          apiKeyCreateUrl:
            "https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey",
        },
      },
      links: {
        primary:
          "https://www.volcengine.com/activity/codingplan?utm_campaign=hw&utm_content=hw&utm_medium=devrel_tool_web&utm_source=OWO&utm_term=all-api-hub",
      },
    })

    expect(bundledSponsorCatalog).toBe(publicSponsorCatalogV4)
  })

  it("validates V4 development examples", () => {
    const examplesResult = normalizeSponsorCatalog(
      {
        schemaVersion: publicSponsorCatalogV4.schemaVersion,
        items: publicSponsorCatalogV4._examples?.devSponsors ?? [],
      },
      {
        locale: "zh-CN",
        now,
        source: SPONSOR_CATALOG_SOURCES.Bundled,
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
