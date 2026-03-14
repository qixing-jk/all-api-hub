import { describe, expect, it } from "vitest"
import { renderHook } from "@testing-library/react"

import { API_TYPES } from "~/services/verification/aiApiVerification"
import { AuthTypeEnum, SiteHealthStatus, type DisplaySiteData } from "~/types"
import {
  createAllAccountsSource,
  createProfileSource,
} from "~/features/ModelList/modelManagementSources"
import { useFilteredModels } from "~/features/ModelList/hooks/useFilteredModels"
import type { PricingResponse } from "~/services/apiService/common/type"

const createDisplayAccount = (
  overrides: Partial<DisplaySiteData>,
): DisplaySiteData => ({
  id: "account",
  name: "Account",
  username: "user",
  balance: { USD: 0, CNY: 0 },
  todayConsumption: { USD: 0, CNY: 0 },
  todayIncome: { USD: 0, CNY: 0 },
  todayTokens: { upload: 0, download: 0 },
  health: { status: SiteHealthStatus.Healthy },
  siteType: "default",
  baseUrl: "https://example.com",
  token: "token",
  userId: 1,
  authType: AuthTypeEnum.AccessToken,
  checkIn: { enableDetection: false },
  ...overrides,
})

const createPricingResponse = (modelNames: string[]): PricingResponse => ({
  data: modelNames.map((model_name) => ({
    model_name,
    quota_type: 0,
    model_ratio: 0,
    model_price: 0,
    completion_ratio: 1,
    enable_groups: [],
    supported_endpoint_types: [],
  })),
  group_ratio: {},
  success: true,
  usable_group: {},
})

describe("useFilteredModels", () => {
  it("preserves profile-backed items when an account filter is active", () => {
    const profileSource = createProfileSource({
      id: "profile-1",
      name: "Reusable Key",
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      baseUrl: "https://profile.example.com/v1",
      apiKey: "sk-secret",
      tagIds: [],
      notes: "",
      createdAt: 1,
      updatedAt: 1,
    })

    const { result } = renderHook(() =>
      useFilteredModels({
        pricingData: createPricingResponse(["gpt-4o-mini"]),
        pricingContexts: [],
        selectedSource: profileSource,
        selectedGroup: "default",
        searchTerm: "",
        selectedProvider: "all",
        accountFilterAccountId: "account-1",
      }),
    )

    expect(result.current.filteredModels).toHaveLength(1)
    expect(result.current.filteredModels[0]?.source.kind).toBe("profile")
  })

  it("computes provider counts from the account-filtered model set", () => {
    const accountA = createDisplayAccount({
      id: "account-a",
      name: "Account A",
      baseUrl: "https://a.example.com",
      userId: 1,
    })
    const accountB = createDisplayAccount({
      id: "account-b",
      name: "Account B",
      baseUrl: "https://b.example.com",
      userId: 2,
    })

    const { result } = renderHook(() =>
      useFilteredModels({
        pricingData: null,
        pricingContexts: [
          {
            account: accountA,
            pricing: createPricingResponse([
              "gpt-4o-mini",
              "claude-3-5-sonnet",
            ]),
          },
          {
            account: accountB,
            pricing: createPricingResponse(["gemini-1.5-pro"]),
          },
        ],
        selectedSource: createAllAccountsSource(),
        selectedGroup: "default",
        searchTerm: "",
        selectedProvider: "all",
        accountFilterAccountId: "account-a",
      }),
    )

    expect(result.current.filteredModels).toHaveLength(2)
    expect(result.current.getProviderFilteredCount("OpenAI")).toBe(1)
    expect(result.current.getProviderFilteredCount("Claude")).toBe(1)
    expect(result.current.getProviderFilteredCount("Gemini")).toBe(0)
  })
})
