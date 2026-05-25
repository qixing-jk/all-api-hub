import { describe, expect, it } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { bundledSponsorCatalog } from "~/features/AccountManagement/sponsors/bundledCatalog"
import { normalizeSponsorCatalog } from "~/features/AccountManagement/sponsors/catalog"
import {
  SPONSOR_CATALOG_SCHEMA_VERSION,
  SPONSOR_REMOTE_CATALOG_URL,
} from "~/features/AccountManagement/sponsors/constants"
import {
  SPONSOR_CATALOG_SOURCES,
  type RawSponsorCatalog,
} from "~/features/AccountManagement/sponsors/types"
import { AuthTypeEnum } from "~/types"
import publicSponsorCatalog from "~~/public/sponsor-catalog.json"

const now = Date.UTC(2026, 4, 25)
const catalog = publicSponsorCatalog as RawSponsorCatalog

describe("public sponsor catalog artifact", () => {
  it("validates the public artifact and development examples", () => {
    expect(catalog.schemaVersion).toBe(SPONSOR_CATALOG_SCHEMA_VERSION)
    expect(new URL(SPONSOR_REMOTE_CATALOG_URL).pathname).toBe(
      "/qixing-jk/all-api-hub/main/public/sponsor-catalog.json",
    )

    const productionResult = normalizeSponsorCatalog(catalog, {
      locale: "zh-CN",
      now,
      source: SPONSOR_CATALOG_SOURCES.Remote,
    })

    expect(productionResult.errors).toEqual([])
    expect(productionResult.items.map((item) => item.id)).not.toContain(
      "dev-supported-direct",
    )

    const examplesResult = normalizeSponsorCatalog(
      {
        schemaVersion: catalog.schemaVersion,
        items: catalog._examples?.devSponsors ?? [],
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
      accountPrefill: {
        siteType: SITE_TYPES.NEW_API,
        siteUrl: "https://dev-supported.example.test",
        authType: AuthTypeEnum.Cookie,
      },
    })

    expect(
      examplesResult.items.find(
        (item) => item.id === "dev-supported-access-token",
      ),
    ).toMatchObject({
      apiKeyCreateUrl:
        "https://dev-token.example.test/dashboard/api-keys?utm_source=all-api-hub",
      postClickNote:
        "测试访问令牌认证预填后的提示，会显示在新建账号 URL 下方。",
      accountPrefill: {
        siteType: SITE_TYPES.NEW_API,
        siteUrl: "https://dev-token.example.test",
        authType: AuthTypeEnum.AccessToken,
      },
    })

    expect(
      examplesResult.items.find(
        (item) => item.id === "dev-unsupported-all-fallbacks",
      ),
    ).toMatchObject({
      apiKeyCreateUrl:
        "https://dev-all-fallbacks.example.test/dashboard/api-keys?utm_source=all-api-hub",
      postClickNote:
        "测试赞助商提供的活动提示，可同时显示在添加账号和获取 API Key 的引导中。",
    })

    expect(
      examplesResult.items.find(
        (item) => item.id === "dev-unsupported-api-profile",
      ),
    ).toMatchObject({
      apiKeyCreateUrl:
        "https://dev-api-profile.example.test/dashboard/api-keys?utm_source=all-api-hub",
    })

    expect(catalog._examples?.devSponsors?.map((item) => item.id)).toContain(
      "dev-supported-direct",
    )

    expect(
      catalog._examples?.devSponsors?.map((item) => item.id),
    ).not.toContain("aihubmix")

    expect(catalog._examples?.devSponsors?.map((item) => item.id)).toContain(
      "dev-unsupported-all-fallbacks",
    )

    expect(bundledSponsorCatalog).toBe(publicSponsorCatalog)
  })
})
