import { describe, expect, it } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  findDeclaredInferenceRoots,
  resolveAccountSiteAddresses,
} from "~/services/accounts/accountSiteProfile/addresses"

describe("account site address roles", () => {
  it("separates Kimi browser, management, and two inference protocols", () => {
    expect(
      resolveAccountSiteAddresses({
        siteType: SITE_TYPES.KIMI_GLOBAL,
        siteUrl: "https://platform.kimi.ai",
      }),
    ).toEqual({
      browserBaseUrl: "https://platform.kimi.ai",
      managementApiBaseUrl: "https://platform.kimi.ai",
      inferenceApi: {
        openAiCompatible: {
          root: "https://api.moonshot.ai",
          mount: "https://api.moonshot.ai/v1",
        },
        anthropic: {
          root: "https://api.moonshot.ai/anthropic",
          mount: "https://api.moonshot.ai/anthropic/v1",
        },
      },
    })
  })

  it("keeps a split-origin dashboard separate from its management API", () => {
    expect(
      resolveAccountSiteAddresses({
        siteType: SITE_TYPES.SUB2API,
        siteUrl: "https://ai-router.dev",
      }),
    ).toMatchObject({
      browserBaseUrl: "https://ai-router.dev",
      managementApiBaseUrl: "https://api.ai-router.dev",
      inferenceApi: {
        openAiCompatible: {
          root: "https://api.ai-router.dev",
          mount: "https://api.ai-router.dev/v1",
        },
      },
    })
  })

  it("preserves a generic site subpath in both protocol roles", () => {
    expect(
      resolveAccountSiteAddresses({
        siteType: SITE_TYPES.NEW_API,
        siteUrl: "https://new-api.example.invalid/tenant",
      }),
    ).toMatchObject({
      browserBaseUrl: "https://new-api.example.invalid/tenant",
      managementApiBaseUrl: "https://new-api.example.invalid/tenant",
      inferenceApi: {
        openAiCompatible: {
          root: "https://new-api.example.invalid/tenant",
          mount: "https://new-api.example.invalid/tenant/v1",
        },
      },
    })
  })

  it("resolves multi-protocol inference endpoints for Volcengine Ark", () => {
    const arkRoots = {
      openAiCompatible: "https://ark.cn-beijing.volces.com/api/v3",
      anthropic: "https://ark.cn-beijing.volces.com/api/compatible",
    }
    expect(
      findDeclaredInferenceRoots("https://ark.cn-beijing.volces.com/api/v3"),
    ).toEqual(arkRoots)
    expect(
      findDeclaredInferenceRoots(
        "https://ark.cn-beijing.volces.com/api/coding/v3",
      ),
    ).toEqual({
      openAiCompatible: "https://ark.cn-beijing.volces.com/api/coding/v3",
      anthropic: "https://ark.cn-beijing.volces.com/api/coding",
    })
    expect(
      resolveAccountSiteAddresses({
        siteType: SITE_TYPES.UNKNOWN,
        siteUrl: "https://ark.cn-beijing.volces.com/api/v3",
      }).inferenceApi,
    ).toEqual({
      openAiCompatible: {
        root: "https://ark.cn-beijing.volces.com/api/v3",
        mount: "https://ark.cn-beijing.volces.com/api/v3",
      },
      anthropic: {
        root: "https://ark.cn-beijing.volces.com/api/compatible",
        mount: "https://ark.cn-beijing.volces.com/api/compatible/v1",
      },
    })
    expect(
      resolveAccountSiteAddresses({
        siteType: SITE_TYPES.UNKNOWN,
        siteUrl: "https://ark.cn-beijing.volces.com/api/coding/v3",
      }).inferenceApi,
    ).toEqual({
      openAiCompatible: {
        root: "https://ark.cn-beijing.volces.com/api/coding/v3",
        mount: "https://ark.cn-beijing.volces.com/api/coding/v3",
      },
      anthropic: {
        root: "https://ark.cn-beijing.volces.com/api/coding",
        mount: "https://ark.cn-beijing.volces.com/api/coding/v1",
      },
    })
  })

  it("keeps an unusable stored URL instead of failing the caller", () => {
    expect(
      resolveAccountSiteAddresses({
        siteType: SITE_TYPES.NEW_API,
        siteUrl: "not a url",
      }),
    ).toEqual({
      browserBaseUrl: "not a url",
      managementApiBaseUrl: "not a url",
      inferenceApi: {
        openAiCompatible: { root: "not a url", mount: "not a url" },
      },
    })
  })
})
