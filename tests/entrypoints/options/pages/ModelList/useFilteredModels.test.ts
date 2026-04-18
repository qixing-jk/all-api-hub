import { describe, expect, it } from "vitest"

import { UI_CONSTANTS } from "~/constants/ui"
import { MODEL_LIST_BILLING_MODES } from "~/features/ModelList/billingModes"
import { useFilteredModels } from "~/features/ModelList/hooks/useFilteredModels"
import {
  createAccountSource,
  createAllAccountsSource,
  createProfileSource,
} from "~/features/ModelList/modelManagementSources"
import { MODEL_LIST_SORT_MODES } from "~/features/ModelList/sortModes"
import type { PricingResponse } from "~/services/apiService/common/type"
import { DEFAULT_MODEL_GROUP } from "~/services/models/constants"
import { MODEL_PROVIDER_FILTER_VALUES } from "~/services/models/utils/modelProviders"
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
  enable_groups: [DEFAULT_MODEL_GROUP],
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
  initialOverrides: Partial<Parameters<typeof useFilteredModels>[0]> = {},
) {
  return renderHook(
    (overrides: Partial<Parameters<typeof useFilteredModels>[0]>) =>
      useFilteredModels({
        pricingData: null,
        pricingContexts: [],
        selectedSource: null,
        selectedBillingMode: MODEL_LIST_BILLING_MODES.ALL,
        selectedGroups: [],
        searchTerm: "",
        selectedProvider: MODEL_PROVIDER_FILTER_VALUES.ALL,
        sortMode: MODEL_LIST_SORT_MODES.DEFAULT,
        showRealPrice: false,
        ...overrides,
      }),
    {
      initialProps: initialOverrides,
    },
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
      accountFilterAccountIds: ["account-1"],
    })

    await waitFor(() => expect(result.current).not.toBeNull())

    expect(result.current.filteredModels).toHaveLength(1)
    expect(result.current.filteredModels[0]?.source.kind).toBe("profile")
  })

  it("ignores stale account filters outside the all-accounts source", async () => {
    const account = createDisplayAccount({
      id: "account-single",
      name: "Single Account",
      baseUrl: "https://single.example.com",
      userId: 1,
    })

    const { result } = renderUseFilteredModels({
      pricingData: createPricingResponse(["gpt-4o-mini", "claude-3-5-sonnet"]),
      selectedSource: createAccountSource(account),
      accountFilterAccountIds: ["different-account"],
    })

    await waitFor(() => expect(result.current.filteredModels).toHaveLength(2))

    expect(
      result.current.filteredModels.map((item) => item.model.model_name),
    ).toEqual(["gpt-4o-mini", "claude-3-5-sonnet"])
    expect(result.current.accountSummaryCountsByAccountId.size).toBe(0)
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
      accountFilterAccountIds: ["account-a"],
    })

    await waitFor(() => expect(result.current).not.toBeNull())

    expect(result.current.filteredModels).toHaveLength(2)
    expect(result.current.allProvidersFilteredCount).toBe(2)
    expect(result.current.getProviderFilteredCount("OpenAI")).toBe(1)
    expect(result.current.getProviderFilteredCount("Claude")).toBe(1)
    expect(result.current.getProviderFilteredCount("Gemini")).toBe(0)
  })

  it("keeps rows from every selected account when multiple account filters are active", async () => {
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
    const accountC = createDisplayAccount({
      id: "account-c",
      name: "Account C",
      baseUrl: "https://c.example.com",
      userId: 3,
    })

    const { result } = renderUseFilteredModels({
      pricingContexts: [
        {
          account: accountA,
          pricing: createPricingResponse(["gpt-4o-mini"]),
        },
        {
          account: accountB,
          pricing: createPricingResponse(["claude-3-5-sonnet"]),
        },
        {
          account: accountC,
          pricing: createPricingResponse(["gemini-1.5-pro"]),
        },
      ],
      selectedSource: createAllAccountsSource(),
      accountFilterAccountIds: ["account-a", "account-c"],
    })

    await waitFor(() => expect(result.current.filteredModels).toHaveLength(2))

    expect(
      result.current.filteredModels.map((item) =>
        item.source.kind === "account" ? item.source.account.id : "profile",
      ),
    ).toEqual(["account-a", "account-c"])
    expect(
      Array.from(result.current.accountSummaryCountsByAccountId.entries()),
    ).toEqual([
      ["account-a", 1],
      ["account-b", 1],
      ["account-c", 1],
    ])
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
      selectedGroups: ["vip"],
    })

    await waitFor(() =>
      expect(result.current.availableGroups).toEqual(["vip", "default"]),
    )

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
      selectedGroups: [],
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
      selectedGroups: [],
      selectedProvider: "Gemini",
    })

    await waitFor(() => {
      expect(
        result.current.filteredModels.map((item) => item.model.model_name),
      ).toEqual(["gemini-1.5-pro"])
    })

    expect(result.current.availableGroups).toEqual([])
    expect(result.current.availableAccountGroupsByAccountId).toEqual({
      "account-valid": ["default"],
    })
    const filteredSource = result.current.filteredModels[0]?.source
    expect(filteredSource?.kind).toBe("account")
    if (!filteredSource || filteredSource.kind !== "account") {
      throw new Error("Expected a valid account-backed filtered model")
    }
    expect(filteredSource.account.id).toBe("account-valid")
    expect(result.current.getProviderFilteredCount("Gemini")).toBe(1)
  })

  it("returns no groups or models when single-account pricing metadata omits group ratios", async () => {
    const account = createDisplayAccount({
      id: "account-missing-group-ratio",
      balance: { USD: 0, CNY: 70 },
    })

    const { result } = renderUseFilteredModels({
      pricingData: createPricingResponse(
        [
          {
            model_name: "ungrouped-model",
            model_ratio: 1,
            completion_ratio: 1,
            enable_groups: [],
          },
        ],
        {
          group_ratio: undefined as any,
        },
      ),
      selectedSource: createAccountSource(account),
      showRealPrice: true,
    })

    await waitFor(() => {
      expect(result.current.availableGroups).toEqual([])
    })

    expect(result.current.filteredModels).toEqual([])
    expect(result.current.baseFilteredModels).toEqual([])
  })

  it("keeps account contexts usable when all-accounts pricing metadata omits group ratios", async () => {
    const account = createDisplayAccount({
      id: "account-context-missing-group-ratio",
      balance: { USD: 0, CNY: 70 },
    })

    const { result } = renderUseFilteredModels({
      pricingContexts: [
        {
          account,
          pricing: createPricingResponse(
            [
              {
                model_name: "context-model",
                model_ratio: 1,
                completion_ratio: 1,
                enable_groups: ["default"],
              },
            ],
            {
              group_ratio: undefined as any,
            },
          ),
        },
      ],
      selectedSource: createAllAccountsSource(),
      showRealPrice: true,
    })

    await waitFor(() => {
      expect(
        result.current.filteredModels.map((item) => item.model.model_name),
      ).toEqual(["context-model"])
    })

    expect(result.current.availableGroups).toEqual([])
    expect(result.current.availableAccountGroupsByAccountId).toEqual({
      "account-context-missing-group-ratio": ["default"],
    })
    expect(result.current.availableAccountGroupOptionsByAccountId).toEqual({
      "account-context-missing-group-ratio": [{ name: "default", ratio: 1 }],
    })
  })

  it("keeps duplicate single-account rows in their original order when every sort key ties", async () => {
    const account = createDisplayAccount({
      id: "account-duplicate-order",
      name: "Duplicate Order Account",
      balance: { USD: 10, CNY: 70 },
    })

    const sourceWithoutGroupFiltering = {
      ...createAccountSource(account),
      capabilities: {
        ...createAccountSource(account).capabilities,
        supportsGroupFiltering: undefined,
      },
    } as any

    const { result } = renderUseFilteredModels({
      pricingData: createPricingResponse(
        [
          {
            model_name: "duplicate-model",
            model_description: "first duplicate",
            model_ratio: 1,
            completion_ratio: 1,
            enable_groups: ["default"],
          },
          {
            model_name: "duplicate-model",
            model_description: "second duplicate",
            model_ratio: 1,
            completion_ratio: 1,
            enable_groups: ["default"],
          },
        ],
        {
          group_ratio: undefined as any,
        },
      ),
      selectedSource: sourceWithoutGroupFiltering,
      sortMode: MODEL_LIST_SORT_MODES.PRICE_ASC,
    })

    await waitFor(() => {
      expect(
        result.current.filteredModels.map(
          (item) => item.model.model_description,
        ),
      ).toEqual(["first duplicate", "second duplicate"])
    })

    expect(
      result.current.filteredModels.every(
        (item) => item.effectiveGroup === undefined,
      ),
    ).toBe(true)
  })

  it("leaves lowest-price badges unset when all-accounts rows have no comparable per-call prices", async () => {
    const accountA = createDisplayAccount({
      id: "account-unpriced-a",
      name: "Account A",
      balance: { USD: 10, CNY: 70 },
    })
    const accountB = createDisplayAccount({
      id: "account-unpriced-b",
      name: "Account B",
      balance: { USD: 10, CNY: 70 },
    })

    const { result } = renderUseFilteredModels({
      pricingContexts: [
        {
          account: accountA,
          pricing: createPricingResponse([
            {
              model_name: "per-call-unpriced",
              quota_type: 1,
              model_price: { input: Number.NaN, output: Number.NaN } as any,
              enable_groups: ["default"],
            },
          ]),
        },
        {
          account: accountB,
          pricing: createPricingResponse([
            {
              model_name: "per-call-unpriced",
              quota_type: 1,
              model_price: { input: Number.NaN, output: Number.NaN } as any,
              enable_groups: ["default"],
            },
          ]),
        },
      ],
      selectedSource: createAllAccountsSource(),
      sortMode: MODEL_LIST_SORT_MODES.MODEL_CHEAPEST_FIRST,
    })

    await waitFor(() => {
      expect(result.current.filteredModels).toHaveLength(2)
    })

    expect(
      result.current.filteredModels.map((item) => item.isLowestPrice),
    ).toEqual([false, false])
  })

  it("uses effective group names as the next tie-breaker when prices tie", async () => {
    const account = createDisplayAccount({
      id: "account-group-tie-breaker",
      balance: { USD: 10, CNY: 70 },
    })

    const { result } = renderUseFilteredModels({
      pricingData: createPricingResponse(
        [
          {
            model_name: "shared-model",
            model_description: "beta row",
            model_ratio: 1,
            completion_ratio: 1,
            enable_groups: ["beta"],
          },
          {
            model_name: "shared-model",
            model_description: "alpha row",
            model_ratio: 1,
            completion_ratio: 1,
            enable_groups: ["alpha"],
          },
        ],
        {
          group_ratio: { alpha: 1, beta: 1 },
        },
      ),
      selectedSource: createAccountSource(account),
      sortMode: MODEL_LIST_SORT_MODES.PRICE_ASC,
    })

    await waitFor(() => {
      expect(
        result.current.filteredModels.map(
          (item) => item.model.model_description,
        ),
      ).toEqual(["alpha row", "beta row"])
    })
  })

  it("falls back to model-name ordering when prices and groups tie", async () => {
    const account = createDisplayAccount({
      id: "account-model-name-tie-breaker",
      balance: { USD: 10, CNY: 70 },
    })

    const sourceWithoutGroupFiltering = {
      ...createAccountSource(account),
      capabilities: {
        ...createAccountSource(account).capabilities,
        supportsGroupFiltering: false,
      },
    } as any

    const { result } = renderUseFilteredModels({
      pricingData: createPricingResponse([
        {
          model_name: "z-model",
          model_ratio: 1,
          completion_ratio: 1,
          enable_groups: ["default"],
        },
        {
          model_name: "a-model",
          model_ratio: 1,
          completion_ratio: 1,
          enable_groups: ["default"],
        },
      ]),
      selectedSource: sourceWithoutGroupFiltering,
      sortMode: MODEL_LIST_SORT_MODES.PRICE_ASC,
    })

    await waitFor(() => {
      expect(
        result.current.filteredModels.map((item) => item.model.model_name),
      ).toEqual(["a-model", "z-model"])
    })
  })

  it("falls back to stable item keys when all-accounts rows share the same source label and price", async () => {
    const accountA = createDisplayAccount({
      id: "account-a",
      name: "Duplicate Name",
      balance: { USD: 10, CNY: 70 },
    })
    const accountB = createDisplayAccount({
      id: "account-b",
      name: "Duplicate Name",
      balance: { USD: 10, CNY: 70 },
    })

    const { result } = renderUseFilteredModels({
      pricingContexts: [
        {
          account: accountB,
          pricing: createPricingResponse([
            {
              model_name: "shared-model",
              model_ratio: 1,
              completion_ratio: 1,
              enable_groups: ["default"],
            },
          ]),
        },
        {
          account: accountA,
          pricing: createPricingResponse([
            {
              model_name: "shared-model",
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
        result.current.filteredModels.map((item) =>
          item.source.kind === "account" ? item.source.account.id : "profile",
        ),
      ).toEqual(["account-a", "account-b"])
    })
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

    const source = createAccountSource(account)

    const { result, rerender } = renderUseFilteredModels({
      pricingData,
      selectedSource: source,
      sortMode: MODEL_LIST_SORT_MODES.PRICE_ASC,
    })

    await waitFor(() => {
      expect(
        result.current.filteredModels.map((item) => item.model.model_name),
      ).toEqual([
        "gpt-cheap",
        "gpt-expensive",
        "image-cheap",
        "image-expensive",
      ])
    })

    rerender({
      pricingData,
      selectedSource: source,
      sortMode: MODEL_LIST_SORT_MODES.PRICE_DESC,
    })

    await waitFor(() => {
      expect(
        result.current.filteredModels.map((item) => item.model.model_name),
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

  it("uses the cheapest eligible group per row and updates when account-specific group filters narrow", async () => {
    const multiGroupAccount = createDisplayAccount({
      id: "account-multi-group",
      name: "Multi Group Account",
      balance: { USD: 10, CNY: 70 },
    })
    const defaultOnlyAccount = createDisplayAccount({
      id: "account-default-only",
      name: "Default Only Account",
      balance: { USD: 10, CNY: 70 },
    })

    const pricingContexts = [
      {
        account: multiGroupAccount,
        pricing: createPricingResponse(
          [
            {
              model_name: "shared-model",
              quota_type: 0,
              model_ratio: 1,
              completion_ratio: 1,
              enable_groups: ["default", "vip"],
            },
          ],
          {
            group_ratio: { default: 1, vip: 0.5 },
          },
        ),
      },
      {
        account: defaultOnlyAccount,
        pricing: createPricingResponse(
          [
            {
              model_name: "shared-model",
              quota_type: 0,
              model_ratio: 1,
              completion_ratio: 1,
              enable_groups: ["default"],
            },
          ],
          {
            group_ratio: { default: 0.6 },
          },
        ),
      },
    ]

    const source = createAllAccountsSource()

    const { result, rerender } = renderUseFilteredModels({
      pricingContexts,
      selectedSource: source,
      sortMode: MODEL_LIST_SORT_MODES.MODEL_CHEAPEST_FIRST,
      allAccountsExcludedGroupsByAccountId: {},
    })

    await waitFor(() => {
      expect(
        result.current.filteredModels.map((item) => [
          item.source.kind === "account" ? item.source.account.id : "profile",
          item.effectiveGroup,
          item.calculatedPrice.inputUSD,
          item.isLowestPrice,
        ]),
      ).toEqual([
        ["account-multi-group", "vip", 1, true],
        ["account-default-only", "default", 1.2, false],
      ])
    })

    rerender({
      pricingContexts,
      selectedSource: source,
      sortMode: MODEL_LIST_SORT_MODES.MODEL_CHEAPEST_FIRST,
      allAccountsExcludedGroupsByAccountId: {
        "account-multi-group": ["vip"],
      },
    })

    await waitFor(() => {
      expect(
        result.current.filteredModels.map((item) => [
          item.source.kind === "account" ? item.source.account.id : "profile",
          item.effectiveGroup,
          item.calculatedPrice.inputUSD,
          item.isLowestPrice,
        ]),
      ).toEqual([
        ["account-default-only", "default", 1.2, true],
        ["account-multi-group", "default", 2, false],
      ])
    })
  })

  it("treats same-named groups on different accounts as unrelated filters", async () => {
    const accountA = createDisplayAccount({
      id: "account-a",
      name: "Account A",
      balance: { USD: 10, CNY: 70 },
    })
    const accountB = createDisplayAccount({
      id: "account-b",
      name: "Account B",
      balance: { USD: 10, CNY: 70 },
    })

    const { result } = renderUseFilteredModels({
      pricingContexts: [
        {
          account: accountA,
          pricing: createPricingResponse(
            [
              {
                model_name: "shared-model",
                model_ratio: 1,
                completion_ratio: 1,
                enable_groups: ["vip"],
              },
            ],
            {
              group_ratio: { vip: 0.5 },
            },
          ),
        },
        {
          account: accountB,
          pricing: createPricingResponse(
            [
              {
                model_name: "shared-model",
                model_ratio: 1,
                completion_ratio: 1,
                enable_groups: ["vip"],
              },
            ],
            {
              group_ratio: { vip: 0.8 },
            },
          ),
        },
      ],
      selectedSource: createAllAccountsSource(),
      sortMode: MODEL_LIST_SORT_MODES.MODEL_CHEAPEST_FIRST,
      allAccountsExcludedGroupsByAccountId: {
        "account-a": ["vip"],
      },
    })

    await waitFor(() => {
      expect(
        result.current.filteredModels.map((item) => [
          item.source.kind === "account" ? item.source.account.id : "profile",
          item.effectiveGroup,
        ]),
      ).toEqual([["account-b", "vip"]])
    })

    expect(result.current.availableAccountGroupsByAccountId).toEqual({
      "account-a": ["vip"],
      "account-b": ["vip"],
    })
    expect(result.current.availableAccountGroupOptionsByAccountId).toEqual({
      "account-a": [{ name: "vip", ratio: 0.5 }],
      "account-b": [{ name: "vip", ratio: 0.8 }],
    })
  })

  it("filters out models that do not support any selected candidate group", async () => {
    const account = createDisplayAccount({
      id: "account-group-filter",
      balance: { USD: 10, CNY: 70 },
    })

    const { result } = renderUseFilteredModels({
      pricingData: createPricingResponse(
        [
          {
            model_name: "default-model",
            enable_groups: ["default"],
          },
          {
            model_name: "vip-model",
            enable_groups: ["vip"],
          },
        ],
        {
          group_ratio: { default: 1, vip: 2 },
        },
      ),
      selectedSource: createAccountSource(account),
      selectedGroups: ["vip"],
    })

    await waitFor(() => {
      expect(
        result.current.filteredModels.map((item) => item.model.model_name),
      ).toEqual(["vip-model"])
    })
  })

  it("filters models by the selected billing mode", async () => {
    const account = createDisplayAccount({
      id: "account-billing-filter",
      balance: { USD: 10, CNY: 70 },
    })

    const pricingData = createPricingResponse([
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
        model_price: 0.5,
        enable_groups: ["default"],
      },
    ])

    const source = createAccountSource(account)

    const { result, rerender } = renderUseFilteredModels({
      pricingData,
      selectedSource: source,
      selectedBillingMode: MODEL_LIST_BILLING_MODES.TOKEN_BASED,
    })

    await waitFor(() => {
      expect(
        result.current.filteredModels.map((item) => item.model.model_name),
      ).toEqual(["token-model"])
    })

    rerender({
      pricingData,
      selectedSource: source,
      selectedBillingMode: MODEL_LIST_BILLING_MODES.PER_CALL,
    })

    await waitFor(() => {
      expect(
        result.current.filteredModels.map((item) => item.model.model_name),
      ).toEqual(["per-call-model"])
    })
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

    const source = createAllAccountsSource()

    const { result, rerender } = renderUseFilteredModels({
      pricingContexts,
      selectedSource: source,
      sortMode: MODEL_LIST_SORT_MODES.MODEL_CHEAPEST_FIRST,
      showRealPrice: false,
    })

    await waitFor(() => {
      expect(
        result.current.filteredModels.map((item) => [
          item.source.kind === "account" ? item.source.account.id : "profile",
          item.isLowestPrice,
        ]),
      ).toEqual([
        ["account-low-usd", true],
        ["account-high-usd", false],
      ])
    })

    rerender({
      pricingContexts,
      selectedSource: source,
      sortMode: MODEL_LIST_SORT_MODES.MODEL_CHEAPEST_FIRST,
      showRealPrice: true,
    })

    await waitFor(() => {
      expect(
        result.current.filteredModels.map((item) => [
          item.source.kind === "account" ? item.source.account.id : "profile",
          item.isLowestPrice,
        ]),
      ).toEqual([
        ["account-high-usd", true],
        ["account-low-usd", false],
      ])
    })
  })

  it("falls back to the default exchange rate when real-price sorting compares per-call account rows without USD balances", async () => {
    const defaultRateAccount = createDisplayAccount({
      id: "account-default-rate",
      name: "Default Rate",
      balance: { USD: 0, CNY: 0 },
    })
    const explicitRateAccount = createDisplayAccount({
      id: "account-explicit-rate",
      name: "Explicit Rate",
      balance: { USD: 2, CNY: UI_CONSTANTS.EXCHANGE_RATE.DEFAULT },
    })

    const pricingContexts = [
      {
        account: explicitRateAccount,
        pricing: createPricingResponse([
          {
            model_name: "shared-per-call-model",
            quota_type: 1,
            model_price: 1,
            enable_groups: ["default"],
          },
        ]),
      },
      {
        account: defaultRateAccount,
        pricing: createPricingResponse([
          {
            model_name: "shared-per-call-model",
            quota_type: 1,
            model_price: 0.9,
            enable_groups: ["default"],
          },
        ]),
      },
    ]

    const source = createAllAccountsSource()

    const { result, rerender } = renderUseFilteredModels({
      pricingContexts,
      selectedSource: source,
      sortMode: MODEL_LIST_SORT_MODES.MODEL_CHEAPEST_FIRST,
      showRealPrice: false,
    })

    await waitFor(() => {
      expect(
        result.current.filteredModels.map((item) => [
          item.source.kind === "account" ? item.source.account.id : "profile",
          item.isLowestPrice,
        ]),
      ).toEqual([
        ["account-default-rate", true],
        ["account-explicit-rate", false],
      ])
    })

    rerender({
      pricingContexts,
      selectedSource: source,
      sortMode: MODEL_LIST_SORT_MODES.MODEL_CHEAPEST_FIRST,
      showRealPrice: true,
    })

    await waitFor(() => {
      expect(
        result.current.filteredModels.map((item) => [
          item.source.kind === "account" ? item.source.account.id : "profile",
          item.isLowestPrice,
          item.calculatedPrice.perCallPrice,
        ]),
      ).toEqual([
        ["account-explicit-rate", true, 1],
        ["account-default-rate", false, 0.9],
      ])
    })
  })

  it("keeps profile-backed per-call sorting on raw prices when real-price mode is enabled", async () => {
    const profileSource = createProfileSource({
      id: "profile-per-call",
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
      pricingData: createPricingResponse([
        {
          model_name: "per-call-b",
          quota_type: 1,
          model_price: 2,
          enable_groups: ["default"],
        },
        {
          model_name: "per-call-a",
          quota_type: 1,
          model_price: 1,
          enable_groups: ["default"],
        },
      ]),
      selectedSource: profileSource,
      sortMode: MODEL_LIST_SORT_MODES.PRICE_ASC,
      showRealPrice: true,
    })

    await waitFor(() => {
      expect(
        result.current.filteredModels.map((item) => item.model.model_name),
      ).toEqual(["per-call-a", "per-call-b"])
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
