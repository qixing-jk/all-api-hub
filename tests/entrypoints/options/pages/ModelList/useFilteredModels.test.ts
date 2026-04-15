import { describe, expect, it } from "vitest"

import { useFilteredModels } from "~/features/ModelList/hooks/useFilteredModels"
import {
  createAccountSource,
  createAllAccountsSource,
  createProfileSource,
} from "~/features/ModelList/modelManagementSources"
import { MODEL_LIST_SORT_MODES } from "~/features/ModelList/sortModes"
import type { PricingResponse } from "~/services/apiService/common/type"
import { API_TYPES } from "~/services/verification/aiApiVerification"
import { AuthTypeEnum, SiteHealthStatus, type DisplaySiteData } from "~/types"
import { renderHook, waitFor } from "~~/tests/test-utils/render"

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

const createPricingModel = (
  overrides: Partial<PricingResponse["data"][number]>,
): PricingResponse["data"][number] => ({
  model_name: "gpt-4o-mini",
  quota_type: 0,
  model_ratio: 0,
  model_price: 0,
  completion_ratio: 1,
  enable_groups: [],
  supported_endpoint_types: [],
  ...overrides,
})

const createPricingResponse = (
  models: Array<string | Partial<PricingResponse["data"][number]>>,
  overrides: Partial<PricingResponse> = {},
): PricingResponse => ({
  data: models.map((model) =>
    typeof model === "string"
      ? createPricingModel({ model_name: model })
      : createPricingModel(model),
  ),
  group_ratio: {},
  success: true,
  usable_group: {},
  ...overrides,
})

function renderUseFilteredModels(
  overrides: Partial<Parameters<typeof useFilteredModels>[0]> = {},
) {
  return renderHook(() =>
    useFilteredModels({
      pricingData: null,
      pricingContexts: [],
      selectedSource: null,
      selectedGroup: "default",
      searchTerm: "",
      selectedProvider: "all",
      sortMode: MODEL_LIST_SORT_MODES.DEFAULT,
      showRealPrice: false,
      ...overrides,
    }),
  )
}

describe("useFilteredModels", () => {
  it("preserves profile-backed items when an account filter is active", async () => {
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

    const { result } = renderUseFilteredModels({
      pricingData: createPricingResponse(["gpt-4o-mini"]),
      selectedSource: profileSource,
      accountFilterAccountId: "account-1",
    })

    await waitFor(() => expect(result.current).not.toBeNull())

    expect(result.current.filteredModels).toHaveLength(1)
    expect(result.current.filteredModels[0]?.source.kind).toBe("profile")
  })

  it("computes provider counts from the account-filtered model set", async () => {
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

    const { result } = renderUseFilteredModels({
      pricingContexts: [
        {
          account: accountA,
          pricing: createPricingResponse(["gpt-4o-mini", "claude-3-5-sonnet"]),
        },
        {
          account: accountB,
          pricing: createPricingResponse(["gemini-1.5-pro"]),
        },
      ],
      selectedSource: createAllAccountsSource(),
      accountFilterAccountId: "account-a",
    })

    await waitFor(() => expect(result.current).not.toBeNull())

    expect(result.current.filteredModels).toHaveLength(2)
    expect(result.current.allProvidersFilteredCount).toBe(2)
    expect(result.current.getProviderFilteredCount("OpenAI")).toBe(1)
    expect(result.current.getProviderFilteredCount("Claude")).toBe(1)
    expect(result.current.getProviderFilteredCount("Gemini")).toBe(0)
  })

  it("applies single-account group pricing and exposes available account groups", async () => {
    const account = createDisplayAccount({
      id: "account-pricing",
      balance: { USD: 10, CNY: 70 },
    })

    const source = createAccountSource(account)

    const { result } = renderUseFilteredModels({
      pricingData: createPricingResponse(
        [
          {
            model_name: "gpt-4o-mini",
            model_ratio: 1,
            completion_ratio: 1,
            enable_groups: ["vip"],
          },
          {
            model_name: "claude-3-5-sonnet",
            model_ratio: 2,
            completion_ratio: 1,
            enable_groups: ["default"],
          },
        ],
        {
          group_ratio: { vip: 2, "": 5 },
        },
      ),
      selectedSource: source,
      selectedGroup: "vip",
    })

    await waitFor(() => expect(result.current.availableGroups).toEqual(["vip"]))

    expect(result.current.baseFilteredModels).toHaveLength(1)
    expect(result.current.filteredModels).toHaveLength(1)
    const pricedSource = result.current.filteredModels[0]?.source
    expect(pricedSource?.kind).toBe("account")
    if (!pricedSource || pricedSource.kind !== "account") {
      throw new Error("Expected an account-backed filtered model")
    }
    expect(pricedSource.account.id).toBe("account-pricing")
    expect(result.current.filteredModels[0]?.calculatedPrice).toMatchObject({
      inputUSD: 4,
      outputUSD: 4,
      inputCNY: 28,
      outputCNY: 28,
    })
  })

  it("searches model descriptions before applying provider filters", async () => {
    const account = createDisplayAccount({
      id: "account-search",
      balance: { USD: 5, CNY: 35 },
    })

    const { result } = renderUseFilteredModels({
      pricingData: createPricingResponse([
        {
          model_name: "claude-3-5-sonnet",
          model_description: "Batch summarizer",
          enable_groups: ["default"],
        },
        {
          model_name: "gemini-1.5-pro",
          model_description: "Batch multimodal pipeline",
          enable_groups: ["default"],
        },
        {
          model_name: "gpt-4o-mini",
          enable_groups: ["default"],
        },
      ]),
      selectedSource: createAccountSource(account),
      selectedGroup: "all",
      searchTerm: "batch",
      selectedProvider: "Claude",
    })

    await waitFor(() =>
      expect(result.current.baseFilteredModels).toHaveLength(2),
    )

    expect(
      result.current.baseFilteredModels.map((item) => item.model.model_name),
    ).toEqual(["claude-3-5-sonnet", "gemini-1.5-pro"])
    expect(
      result.current.filteredModels.map((item) => item.model.model_name),
    ).toEqual(["claude-3-5-sonnet"])
    expect(result.current.getProviderFilteredCount("Claude")).toBe(1)
    expect(result.current.getProviderFilteredCount("Gemini")).toBe(1)
  })

  it("skips malformed account pricing payloads while keeping valid account models and groups", async () => {
    const accountA = createDisplayAccount({
      id: "account-valid",
      name: "Valid Account",
      balance: { USD: 2, CNY: 14 },
    })
    const accountB = createDisplayAccount({
      id: "account-invalid",
      name: "Invalid Account",
      balance: { USD: 0, CNY: 0 },
    })

    const { result } = renderUseFilteredModels({
      pricingContexts: [
        {
          account: accountA,
          pricing: createPricingResponse([
            {
              model_name: "gemini-1.5-pro",
              enable_groups: ["default"],
            },
          ]),
        },
        {
          account: accountB,
          pricing: {
            data: null,
            success: true,
            usable_group: {},
          } as any,
        },
      ],
      selectedSource: createAllAccountsSource(),
      selectedGroup: "all",
      selectedProvider: "Gemini",
    })

    await waitFor(() => {
      expect(
        result.current.filteredModels.map((item) => item.model.model_name),
      ).toEqual(["gemini-1.5-pro"])
    })

    expect(result.current.availableGroups).toEqual([])
    const filteredSource = result.current.filteredModels[0]?.source
    expect(filteredSource?.kind).toBe("account")
    if (!filteredSource || filteredSource.kind !== "account") {
      throw new Error("Expected a valid account-backed filtered model")
    }
    expect(filteredSource.account.id).toBe("account-valid")
    expect(result.current.getProviderFilteredCount("Gemini")).toBe(1)
  })

  it("sorts priced rows ascending and descending within each billing mode", async () => {
    const account = createDisplayAccount({
      id: "account-prices",
      balance: { USD: 10, CNY: 70 },
    })

    const pricingData = createPricingResponse([
      {
        model_name: "gpt-expensive",
        quota_type: 0,
        model_ratio: 3,
        completion_ratio: 1,
        enable_groups: ["default"],
      },
      {
        model_name: "gpt-cheap",
        quota_type: 0,
        model_ratio: 1,
        completion_ratio: 1,
        enable_groups: ["default"],
      },
      {
        model_name: "image-cheap",
        quota_type: 1,
        model_price: 0.01,
        enable_groups: ["default"],
      },
      {
        model_name: "image-expensive",
        quota_type: 1,
        model_price: 0.04,
        enable_groups: ["default"],
      },
    ])

    const asc = renderUseFilteredModels({
      pricingData,
      selectedSource: createAccountSource(account),
      sortMode: MODEL_LIST_SORT_MODES.PRICE_ASC,
    })

    await waitFor(() => {
      expect(
        asc.result.current.filteredModels.map((item) => item.model.model_name),
      ).toEqual([
        "gpt-cheap",
        "gpt-expensive",
        "image-cheap",
        "image-expensive",
      ])
    })

    const desc = renderUseFilteredModels({
      pricingData,
      selectedSource: createAccountSource(account),
      sortMode: MODEL_LIST_SORT_MODES.PRICE_DESC,
    })

    await waitFor(() => {
      expect(
        desc.result.current.filteredModels.map((item) => item.model.model_name),
      ).toEqual([
        "gpt-expensive",
        "gpt-cheap",
        "image-expensive",
        "image-cheap",
      ])
    })
  })

  it("groups same-model rows and puts the cheapest account first in all-accounts mode", async () => {
    const cheaperAccount = createDisplayAccount({
      id: "account-cheaper",
      name: "Cheaper Account",
      balance: { USD: 10, CNY: 65 },
    })
    const expensiveAccount = createDisplayAccount({
      id: "account-expensive",
      name: "Expensive Account",
      balance: { USD: 10, CNY: 70 },
    })

    const { result } = renderUseFilteredModels({
      pricingContexts: [
        {
          account: expensiveAccount,
          pricing: createPricingResponse([
            {
              model_name: "shared-model",
              quota_type: 0,
              model_ratio: 2,
              completion_ratio: 1,
              enable_groups: ["default"],
            },
            {
              model_name: "other-model",
              quota_type: 0,
              model_ratio: 1,
              completion_ratio: 1,
              enable_groups: ["default"],
            },
          ]),
        },
        {
          account: cheaperAccount,
          pricing: createPricingResponse([
            {
              model_name: "shared-model",
              quota_type: 0,
              model_ratio: 1,
              completion_ratio: 1,
              enable_groups: ["default"],
            },
          ]),
        },
      ],
      selectedSource: createAllAccountsSource(),
      sortMode: MODEL_LIST_SORT_MODES.MODEL_CHEAPEST_FIRST,
    })

    await waitFor(() => {
      expect(
        result.current.filteredModels.map((item) => [
          item.model.model_name,
          item.source.kind === "account" ? item.source.account.id : "profile",
        ]),
      ).toEqual([
        ["other-model", "account-expensive"],
        ["shared-model", "account-cheaper"],
        ["shared-model", "account-expensive"],
      ])
    })

    expect(
      result.current.filteredModels
        .filter((item) => item.model.model_name === "shared-model")
        .map((item) => item.isLowestPrice),
    ).toEqual([true, false])
  })

  it("recomputes cheapest order and badges using real recharge amounts when enabled", async () => {
    const lowUsdHighCny = createDisplayAccount({
      id: "account-low-usd",
      name: "Low USD",
      balance: { USD: 10, CNY: 90 },
    })
    const highUsdLowCny = createDisplayAccount({
      id: "account-high-usd",
      name: "High USD",
      balance: { USD: 10, CNY: 60 },
    })

    const pricingContexts = [
      {
        account: lowUsdHighCny,
        pricing: createPricingResponse([
          {
            model_name: "shared-model",
            quota_type: 0,
            model_ratio: 1,
            completion_ratio: 1,
            enable_groups: ["default"],
          },
        ]),
      },
      {
        account: highUsdLowCny,
        pricing: createPricingResponse([
          {
            model_name: "shared-model",
            quota_type: 0,
            model_ratio: 1.2,
            completion_ratio: 1,
            enable_groups: ["default"],
          },
        ]),
      },
    ]

    const usdResult = renderUseFilteredModels({
      pricingContexts,
      selectedSource: createAllAccountsSource(),
      sortMode: MODEL_LIST_SORT_MODES.MODEL_CHEAPEST_FIRST,
      showRealPrice: false,
    })

    await waitFor(() => {
      expect(
        usdResult.result.current.filteredModels.map((item) => [
          item.source.kind === "account" ? item.source.account.id : "profile",
          item.isLowestPrice,
        ]),
      ).toEqual([
        ["account-low-usd", true],
        ["account-high-usd", false],
      ])
    })

    const realPriceResult = renderUseFilteredModels({
      pricingContexts,
      selectedSource: createAllAccountsSource(),
      sortMode: MODEL_LIST_SORT_MODES.MODEL_CHEAPEST_FIRST,
      showRealPrice: true,
    })

    await waitFor(() => {
      expect(
        realPriceResult.result.current.filteredModels.map((item) => [
          item.source.kind === "account" ? item.source.account.id : "profile",
          item.isLowestPrice,
        ]),
      ).toEqual([
        ["account-high-usd", true],
        ["account-low-usd", false],
      ])
    })
  })

  it("keeps token-based and per-call models in separate price-sorting groups", async () => {
    const account = createDisplayAccount({
      id: "account-mixed",
      balance: { USD: 10, CNY: 70 },
    })

    const { result } = renderUseFilteredModels({
      pricingData: createPricingResponse([
        {
          model_name: "token-model",
          quota_type: 0,
          model_ratio: 2,
          completion_ratio: 1,
          enable_groups: ["default"],
        },
        {
          model_name: "per-call-model",
          quota_type: 1,
          model_price: 0.0001,
          enable_groups: ["default"],
        },
      ]),
      selectedSource: createAccountSource(account),
      sortMode: MODEL_LIST_SORT_MODES.PRICE_ASC,
    })

    await waitFor(() => {
      expect(
        result.current.filteredModels.map((item) => item.model.model_name),
      ).toEqual(["token-model", "per-call-model"])
    })
  })

  it("sorts per-call object pricing by input then output values", async () => {
    const account = createDisplayAccount({
      id: "account-per-call",
      balance: { USD: 10, CNY: 70 },
    })

    const { result } = renderUseFilteredModels({
      pricingData: createPricingResponse([
        {
          model_name: "per-call-b",
          quota_type: 1,
          model_price: { input: 20, output: 30 },
          enable_groups: ["default"],
        },
        {
          model_name: "per-call-a",
          quota_type: 1,
          model_price: { input: 10, output: 50 },
          enable_groups: ["default"],
        },
      ]),
      selectedSource: createAccountSource(account),
      sortMode: MODEL_LIST_SORT_MODES.PRICE_ASC,
    })

    await waitFor(() => {
      expect(
        result.current.filteredModels.map((item) => item.model.model_name),
      ).toEqual(["per-call-a", "per-call-b"])
    })
  })
})
