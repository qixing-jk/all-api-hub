import { describe, expect, it } from "vitest"

import { QUOTA_PER_USD } from "~/constants/money"
import { SITE_TYPES } from "~/services/accountSiteDefinitions/identifiers"
import {
  isMaskedKimiSecret,
  kimiAmountToQuota,
  parseKimiCreatedKey,
  parseKimiRefresh,
} from "~/services/apiService/kimiOpenPlatform/parsing"
import {
  KIMI_OPEN_PLATFORM_DEPLOYMENTS,
  resolveKimiOpenPlatformDeployment,
} from "~/services/kimiOpenPlatform/deployments"

describe("kimi open platform deployments", () => {
  it("keeps the two consoles on one family and separate origins", () => {
    expect(
      resolveKimiOpenPlatformDeployment(
        "https://platform.kimi.com/console/api-keys",
      ),
    ).toMatchObject({
      siteType: SITE_TYPES.KIMI,
      currency: "CNY",
      inferenceOrigin: "https://api.moonshot.cn",
    })
    expect(
      resolveKimiOpenPlatformDeployment(
        "https://platform.kimi.ai/console/account",
      ),
    ).toMatchObject({
      siteType: SITE_TYPES.KIMI_GLOBAL,
      currency: "USD",
      openaiBaseUrl: "https://api.moonshot.ai/v1",
      anthropicBaseUrl: "https://api.moonshot.ai/anthropic",
    })
    expect(KIMI_OPEN_PLATFORM_DEPLOYMENTS.cn.siteType).not.toBe(
      KIMI_OPEN_PLATFORM_DEPLOYMENTS.global.siteType,
    )
  })
})

describe("kimi open platform parsing", () => {
  it.each(["", "   "])("rejects an empty create-response secret %j", (auth) => {
    expect(() =>
      parseKimiCreatedKey({
        code: 0,
        data: {
          key: "ak-example",
          auth,
          name: "probe",
          project_id: "proj-example",
        },
      }),
    ).toThrow("invalid_kimi_created_key")
  })
  it("converts USD directly and CNY through the account exchange rate", () => {
    expect(kimiAmountToQuota(2, "USD")).toBe(2 * QUOTA_PER_USD)
    expect(kimiAmountToQuota(7.2, "CNY", 7.2)).toBe(QUOTA_PER_USD)
  })

  it("accepts a create-response secret and rejects a masked list value", () => {
    expect(isMaskedKimiSecret("sk-a0...Hmtbu")).toBe(true)
    expect(
      parseKimiCreatedKey({
        code: 0,
        data: {
          key: "ak-example",
          auth: "sk-" + "a".repeat(48),
          name: "probe",
          project_id: "proj-example",
        },
      }).auth.startsWith("sk-"),
    ).toBe(true)
    expect(() =>
      parseKimiCreatedKey({
        code: 0,
        data: {
          key: "ak-example",
          auth: "sk-a0...Hmtbu",
          name: "probe",
          project_id: "proj-example",
        },
      }),
    ).toThrow("invalid_kimi_created_key")
  })

  it("requires both rotated tokens", () => {
    expect(
      parseKimiRefresh({
        code: 0,
        data: { access_token: "next-access", refresh_token: "next-refresh" },
      }),
    ).toEqual({ accessToken: "next-access", refreshToken: "next-refresh" })
    expect(() =>
      parseKimiRefresh({ code: 0, data: { access_token: "only" } }),
    ).toThrow("invalid_kimi_refresh")
  })
})
