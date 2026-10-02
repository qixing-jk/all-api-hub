import { describe, expect, it } from "vitest"

import { QUOTA_PER_USD } from "~/constants/money"
import { SITE_TYPES } from "~/services/accountSiteDefinitions/identifiers"
import {
  isMaskedKimiSecret,
  kimiAmountToQuota,
  parseKimiAccountInfo,
  parseKimiCreatedKey,
  parseKimiInferenceBalance,
  parseKimiKeys,
  parseKimiOpenGatewayModels,
  parseKimiProjects,
  parseKimiRefresh,
  parseKimiUserInfo,
} from "~/services/apiService/kimiOpenPlatform/parsing"
import {
  KIMI_OPEN_PLATFORM_DEPLOYMENTS,
  resolveKimiOpenPlatformDeployment,
} from "~/services/kimiOpenPlatform/deployments"

describe("inference balance envelope", () => {
  it("reads the documented API-key balance independently of console sessions", () => {
    expect(
      parseKimiInferenceBalance({
        code: 0,
        status: true,
        scode: "0x0",
        data: {
          available_balance: -1.5,
          cash_balance: -1.5,
          voucher_balance: 0,
        },
      }),
    ).toBe(-1.5)
  })
  it.each([false, undefined, "true"])(
    "rejects unsuccessful or missing request status %s",
    (status) => {
      expect(() =>
        parseKimiInferenceBalance({
          code: 0,
          status,
          data: { available_balance: 100 },
        }),
      ).toThrow("invalid_kimi_balance")
    },
  )
  it.each([NaN, Infinity])(
    "rejects nonfinite balances %s",
    (available_balance) => {
      expect(() =>
        parseKimiInferenceBalance({
          code: 0,
          status: true,
          data: { available_balance },
        }),
      ).toThrow("invalid_kimi_balance")
    },
  )
})

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
  it.each([null, [], {}, { code: 401, data: {} }, { code: 0 }])(
    "rejects malformed or unsuccessful envelopes %j",
    (payload) => {
      expect(() => parseKimiUserInfo(payload)).toThrow("invalid_kimi_envelope")
    },
  )
  it.each([null, [], {}, { uid: " " }])(
    "rejects missing user identity %j",
    (data) => {
      expect(() => parseKimiUserInfo({ code: 0, data })).toThrow(
        "invalid_kimi_user_info",
      )
    },
  )
  it("normalizes user identity and discards malformed organizations", () => {
    expect(
      parseKimiUserInfo({
        code: 0,
        data: {
          uid: " user ",
          name: " User ",
          organizations: [
            null,
            {},
            { organization: {} },
            { organization: { id: " " } },
            { organization: { id: " org " }, role: "owner" },
          ],
        },
      }),
    ).toEqual({
      uid: "user",
      name: "User",
      organizations: [{ organization: { id: "org" }, role: "owner" }],
    })
    expect(parseKimiUserInfo({ code: 0, data: { uid: "user" } })).toEqual({
      uid: "user",
      name: "",
      organizations: [],
    })
  })
  it("preserves project defaults and key metadata while dropping malformed rows", () => {
    expect(
      parseKimiProjects({
        code: 0,
        data: [
          null,
          {},
          { id: "p", name: "Project", is_default: true },
          { id: "other", name: "Other" },
        ],
      }),
    ).toEqual([
      { id: "p", name: "Project", is_default: true },
      { id: "other", name: "Other" },
    ])
    const key = {
      key: "ak",
      auth: "sk-masked…",
      name: "Key",
      project_id: "p",
      project_name: "Project",
      created_at: "2026-01-01",
    }
    expect(parseKimiKeys({ code: 0, data: [null, {}, key] })).toEqual([key])
  })
  it("rejects malformed inventory, account and model payloads", () => {
    expect(() => parseKimiProjects({ code: 0, data: {} })).toThrow(
      "invalid_kimi_projects",
    )
    expect(() => parseKimiKeys({ code: 0, data: {} })).toThrow(
      "invalid_kimi_keys",
    )
    expect(() =>
      parseKimiAccountInfo({ code: 0, data: { cur: "1", today_consume: 0 } }),
    ).toThrow("invalid_kimi_account_info")
    expect(() => parseKimiOpenGatewayModels({ code: 0, data: [] })).toThrow(
      "invalid_kimi_model_catalog",
    )
    expect(
      parseKimiOpenGatewayModels({
        code: 0,
        data: { data: [null, {}, { id: " " }, { id: " kimi-k2 " }] },
      }),
    ).toEqual([{ id: "kimi-k2" }])
  })
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
