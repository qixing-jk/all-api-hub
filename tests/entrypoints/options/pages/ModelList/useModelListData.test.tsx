import { act, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { useModelListData } from "~/features/ModelList/hooks/useModelListData"
import {
  ALL_ACCOUNTS_SOURCE_VALUE,
  MODEL_MANAGEMENT_SOURCE_KINDS,
  NO_MODEL_MANAGEMENT_SOURCE_VALUE,
  toAccountSourceValue,
  toProfileSourceValue,
} from "~/features/ModelList/modelManagementSources"
import { MODEL_LIST_SORT_MODES } from "~/features/ModelList/sortModes"
import { MODEL_LIST_SOURCE_KINDS } from "~/services/modelList/pricingModel"
import { AuthTypeEnum, SiteHealthStatus, type DisplaySiteData } from "~/types"

const mockUseAccountData = vi.fn()
const mockUseApiCredentialProfiles = vi.fn()
const mockUseModelData = vi.fn()
const mockUseFilteredModels = vi.fn()
const { mockModelMetadataService } = vi.hoisted(() => ({
  mockModelMetadataService: {
    initialize: vi.fn(),
    getAllMetadata: vi.fn(),
  },
}))

vi.mock("~/hooks/useAccountData", () => ({
  useAccountData: (...args: unknown[]) => mockUseAccountData(...args),
}))

vi.mock(
  "~/features/ApiCredentialProfiles/hooks/useApiCredentialProfiles",
  () => ({
    useApiCredentialProfiles: (...args: unknown[]) =>
      mockUseApiCredentialProfiles(...args),
  }),
)

vi.mock("~/features/ModelList/hooks/useModelData", () => ({
  useModelData: (...args: unknown[]) => mockUseModelData(...args),
}))

vi.mock("~/features/ModelList/hooks/useFilteredModels", () => ({
  useFilteredModels: (...args: unknown[]) => mockUseFilteredModels(...args),
}))

vi.mock("~/services/models/modelMetadata", () => ({
  modelMetadataService: mockModelMetadataService,
}))

const ACCOUNT: DisplaySiteData = {
  id: "acc-1",
  name: "Example Account",
  username: "tester",
  balance: { USD: 0, CNY: 0 },
  todayConsumption: { USD: 0, CNY: 0 },
  todayIncome: { USD: 0, CNY: 0 },
  todayTokens: { upload: 0, download: 0 },
  health: { status: SiteHealthStatus.Healthy },
  siteType: "new-api",
  baseUrl: "https://example.com",
  token: "token",
  userId: "1",
  authType: AuthTypeEnum.AccessToken,
  checkIn: { enableDetection: false },
}

const PROFILE = {
  id: "profile-1",
  name: "Reusable Key",
  apiType: "openai-compatible" as const,
  baseUrl: "https://profile.example.com",
  apiKey: "sk-secret",
  tagIds: [],
  notes: "",
  createdAt: 1,
  updatedAt: 1,
}

describe("useModelListData", () => {
  beforeEach(() => {
    mockUseAccountData.mockReset()
    mockUseApiCredentialProfiles.mockReset()
    mockUseModelData.mockReset()
    mockUseFilteredModels.mockReset()

    mockUseAccountData.mockReturnValue({
      enabledDisplayData: [ACCOUNT],
    })
    mockUseApiCredentialProfiles.mockReturnValue({
      profiles: [PROFILE],
      isLoading: false,
    })
    mockUseModelData.mockReturnValue({
      pricingData: null,
      pricingContexts: [],
      isLoading: false,
      dataFormatError: false,
      accountQueryStates: [],
      loadPricingData: vi.fn(),
      loadErrorMessage: null,
      accountFallback: null,
    })
    mockUseFilteredModels.mockReturnValue({
      filteredModels: [],
      baseFilteredModels: [],
      getProviderFilteredCount: vi.fn(() => 0),
      availableGroups: [],
    })
    mockModelMetadataService.initialize.mockResolvedValue(undefined)
    mockModelMetadataService.getAllMetadata.mockReturnValue([])
  })

  it("passes loaded model metadata into the filter pipeline", async () => {
    mockModelMetadataService.getAllMetadata.mockReturnValue([
      {
        id: "openai/gpt-4o",
        name: "GPT-4o",
        provider_id: "openai",
      },
    ])

    renderHook(() => useModelListData())

    await waitFor(() => {
      expect(mockUseFilteredModels).toHaveBeenLastCalledWith(
        expect.objectContaining({
          modelMetadata: [
            {
              id: "openai/gpt-4o",
              name: "GPT-4o",
              provider_id: "openai",
            },
          ],
        }),
      )
    })
  })

  it("falls back to empty model metadata when metadata loading fails", async () => {
    mockModelMetadataService.initialize.mockRejectedValue(new Error("offline"))

    renderHook(() => useModelListData())

    await waitFor(() => {
      expect(mockUseFilteredModels).toHaveBeenLastCalledWith(
        expect.objectContaining({
          modelMetadata: [],
        }),
      )
    })
  })

  it("keeps the same profile selection when profile data updates", async () => {
    const { result, rerender } = renderHook(() => useModelListData())

    act(() => {
      result.current.setSelectedSourceValue(toProfileSourceValue(PROFILE.id))
    })

    expect(result.current.selectedSource?.kind).toBe(
      MODEL_MANAGEMENT_SOURCE_KINDS.PROFILE,
    )
    if (
      result.current.selectedSource?.kind !==
      MODEL_MANAGEMENT_SOURCE_KINDS.PROFILE
    ) {
      throw new Error("Expected profile source to be selected")
    }
    expect(result.current.selectedSource.profile.name).toBe("Reusable Key")

    mockUseApiCredentialProfiles.mockReturnValue({
      profiles: [{ ...PROFILE, name: "Updated Profile", updatedAt: 2 }],
      isLoading: false,
    })

    rerender()

    await waitFor(() => {
      expect(result.current.selectedSource?.kind).toBe(
        MODEL_MANAGEMENT_SOURCE_KINDS.PROFILE,
      )
    })

    if (
      result.current.selectedSource?.kind !==
      MODEL_MANAGEMENT_SOURCE_KINDS.PROFILE
    ) {
      throw new Error("Expected updated profile source to remain selected")
    }
    expect(result.current.selectedSource.profile.name).toBe("Updated Profile")
    expect(result.current.selectedSourceValue).toBe(
      toProfileSourceValue(PROFILE.id),
    )
  })

  it("clears a stale profile selection when the backing profile is deleted", async () => {
    const { result, rerender } = renderHook(() => useModelListData())

    act(() => {
      result.current.setSelectedSourceValue(toProfileSourceValue(PROFILE.id))
    })

    expect(result.current.selectedSource?.kind).toBe(
      MODEL_MANAGEMENT_SOURCE_KINDS.PROFILE,
    )

    mockUseApiCredentialProfiles.mockReturnValue({
      profiles: [],
      isLoading: false,
    })

    rerender()

    await waitFor(() => {
      expect(result.current.selectedSourceValue).toBe(
        NO_MODEL_MANAGEMENT_SOURCE_VALUE,
      )
    })

    expect(result.current.selectedSource).toBeNull()
  })

  it("keeps a persisted profile selection while profiles are still loading", async () => {
    const { result, rerender } = renderHook(() => useModelListData())

    act(() => {
      result.current.setSelectedSourceValue(toProfileSourceValue(PROFILE.id))
    })

    expect(result.current.selectedSource?.kind).toBe(
      MODEL_MANAGEMENT_SOURCE_KINDS.PROFILE,
    )

    mockUseApiCredentialProfiles.mockReturnValue({
      profiles: [],
      isLoading: true,
    })

    rerender()

    await waitFor(() => {
      expect(result.current.selectedSourceValue).toBe(
        toProfileSourceValue(PROFILE.id),
      )
    })

    expect(result.current.selectedSource).toBeNull()
  })

  it("clears a stale account selection even while profiles are still loading", async () => {
    mockUseApiCredentialProfiles.mockReturnValue({
      profiles: [],
      isLoading: true,
    })

    const { result } = renderHook(() => useModelListData())

    act(() => {
      result.current.setSelectedSourceValue(toAccountSourceValue("account-1"))
    })

    await waitFor(() => {
      expect(result.current.selectedSourceValue).toBe(
        NO_MODEL_MANAGEMENT_SOURCE_VALUE,
      )
    })

    expect(result.current.selectedSource).toBeNull()
  })

  it("selects a stored profile when routeParams.profileId resolves", async () => {
    const { result } = renderHook(() =>
      useModelListData({ profileId: "profile-1" }),
    )

    await waitFor(() => {
      expect(result.current.selectedSourceValue).toBe(
        toProfileSourceValue(PROFILE.id),
      )
    })

    expect(result.current.selectedSource?.kind).toBe(
      MODEL_MANAGEMENT_SOURCE_KINDS.PROFILE,
    )
  })

  it("restores all-accounts selection from routeParams.accountId", async () => {
    const { result } = renderHook(() =>
      useModelListData({ accountId: ALL_ACCOUNTS_SOURCE_VALUE }),
    )

    await waitFor(() => {
      expect(result.current.selectedSourceValue).toBe(ALL_ACCOUNTS_SOURCE_VALUE)
    })

    expect(result.current.selectedSource?.kind).toBe(
      MODEL_MANAGEMENT_SOURCE_KINDS.ALL_ACCOUNTS,
    )
  })

  it.each([
    ["an empty route", {}],
    ["an invalid account route", { accountId: "missing-account" }],
  ] satisfies Array<[string, Record<string, string>]>)(
    "clears the selected source when a controlled route changes to %s",
    async (_label, nextRouteParams) => {
      const { result, rerender } = renderHook(
        ({ routeParams }: { routeParams: Record<string, string> }) =>
          useModelListData(routeParams),
        {
          initialProps: {
            routeParams: {
              accountId: ACCOUNT.id,
            } as Record<string, string>,
          },
        },
      )

      await waitFor(() =>
        expect(result.current.selectedSourceValue).toBe(
          toAccountSourceValue(ACCOUNT.id),
        ),
      )

      rerender({ routeParams: nextRouteParams })

      await waitFor(() =>
        expect(result.current.selectedSourceValue).toBe(
          NO_MODEL_MANAGEMENT_SOURCE_VALUE,
        ),
      )
      expect(result.current.selectedSource).toBeNull()
    },
  )

  it("prefers a valid route profile over a simultaneous account target", async () => {
    const { result } = renderHook(() =>
      useModelListData({ profileId: "profile-1", accountId: "acc-1" }),
    )

    await waitFor(() => {
      expect(result.current.selectedSourceValue).toBe(
        toProfileSourceValue(PROFILE.id),
      )
    })

    expect(result.current.selectedSource?.kind).toBe(
      MODEL_MANAGEMENT_SOURCE_KINDS.PROFILE,
    )
  })

  it("waits for profile storage before falling back from a stale profile deep link to accountId", async () => {
    mockUseApiCredentialProfiles.mockReturnValue({
      profiles: [],
      isLoading: true,
    })

    const { result, rerender } = renderHook(() =>
      useModelListData({ profileId: "missing-profile", accountId: "acc-1" }),
    )

    expect(result.current.selectedSourceValue).toBe(
      NO_MODEL_MANAGEMENT_SOURCE_VALUE,
    )
    expect(result.current.selectedSource).toBeNull()

    mockUseApiCredentialProfiles.mockReturnValue({
      profiles: [],
      isLoading: false,
    })

    rerender()

    await waitFor(() => {
      expect(result.current.selectedSourceValue).toBe(
        toAccountSourceValue(ACCOUNT.id),
      )
    })

    expect(result.current.selectedSource?.kind).toBe(
      MODEL_MANAGEMENT_SOURCE_KINDS.ACCOUNT,
    )
  })

  it("waits for profile storage before falling back from a stale profile deep link to all accounts", async () => {
    mockUseApiCredentialProfiles.mockReturnValue({
      profiles: [],
      isLoading: true,
    })

    const { result, rerender } = renderHook(() =>
      useModelListData({
        profileId: "missing-profile",
        accountId: ALL_ACCOUNTS_SOURCE_VALUE,
      }),
    )

    expect(result.current.selectedSourceValue).toBe(
      NO_MODEL_MANAGEMENT_SOURCE_VALUE,
    )
    expect(result.current.selectedSource).toBeNull()

    mockUseApiCredentialProfiles.mockReturnValue({
      profiles: [],
      isLoading: false,
    })

    rerender()

    await waitFor(() => {
      expect(result.current.selectedSourceValue).toBe(ALL_ACCOUNTS_SOURCE_VALUE)
    })

    expect(result.current.selectedSource?.kind).toBe(
      MODEL_MANAGEMENT_SOURCE_KINDS.ALL_ACCOUNTS,
    )
  })

  it("clears a stale profile deep link when its fallback account is also missing", async () => {
    mockUseApiCredentialProfiles.mockReturnValue({
      profiles: [],
      isLoading: false,
    })

    const { result } = renderHook(() =>
      useModelListData({
        profileId: "missing-profile",
        accountId: "missing-account",
      }),
    )

    await waitFor(() => {
      expect(result.current.selectedSourceValue).toBe(
        NO_MODEL_MANAGEMENT_SOURCE_VALUE,
      )
    })

    expect(result.current.selectedSource).toBeNull()
  })

  it("downgrades account capabilities while a fallback catalog is active", async () => {
    mockUseModelData.mockReturnValue({
      pricingData: {
        data: [],
        group_ratio: {},
        success: true,
        usable_group: {},
      },
      pricingContexts: [],
      isLoading: false,
      dataFormatError: false,
      accountQueryStates: [],
      loadPricingData: vi.fn(),
      loadErrorMessage: null,
      accountFallback: {
        isAvailable: true,
        isActive: true,
        hasLoadedTokens: true,
        isLoadingTokens: false,
        isLoadingCatalog: false,
        tokenLoadErrorMessage: null,
        catalogLoadErrorMessage: null,
        tokens: [],
        selectedTokenId: null,
        activeTokenName: "Fallback key",
        loadTokens: vi.fn(),
        setSelectedTokenId: vi.fn(),
        loadCatalog: vi.fn(),
      },
    })

    const { result } = renderHook(() => useModelListData())

    act(() => {
      result.current.setSelectedSourceValue(toAccountSourceValue(ACCOUNT.id))
    })

    await waitFor(() => {
      expect(result.current.selectedSource?.kind).toBe(
        MODEL_MANAGEMENT_SOURCE_KINDS.ACCOUNT,
      )
    })

    expect(result.current.isFallbackCatalogActive).toBe(true)
    expect(result.current.sourceCapabilities).toMatchObject({
      supportsPricing: false,
      supportsGroupFiltering: false,
      supportsAccountSummary: false,
      supportsTokenCompatibility: true,
      supportsCredentialVerification: true,
      supportsBatchCredentialVerification: true,
      supportsCliVerification: true,
    })
  })

  it("keeps AIHubMix catalog fallback pricing while disabling key-backed capabilities", async () => {
    const aihubmixAccount: DisplaySiteData = {
      ...ACCOUNT,
      id: "aihubmix-account",
      siteType: SITE_TYPES.AIHUBMIX,
    }

    mockUseAccountData.mockReturnValue({
      enabledDisplayData: [aihubmixAccount],
    })
    mockUseModelData.mockReturnValue({
      pricingData: {
        data: [],
        group_ratio: {},
        success: true,
        usable_group: {},
        model_list_source: {
          kind: MODEL_LIST_SOURCE_KINDS.CATALOG_FALLBACK,
          provider: SITE_TYPES.AIHUBMIX,
        },
      },
      pricingContexts: [],
      isLoading: false,
      dataFormatError: false,
      accountQueryStates: [],
      loadPricingData: vi.fn(),
      loadErrorMessage: null,
      accountFallback: null,
    })

    const { result } = renderHook(() => useModelListData())

    act(() => {
      result.current.setSelectedSourceValue(
        toAccountSourceValue(aihubmixAccount.id),
      )
    })

    await waitFor(() => {
      expect(result.current.selectedSource?.kind).toBe(
        MODEL_MANAGEMENT_SOURCE_KINDS.ACCOUNT,
      )
    })

    expect(result.current.isAihubmixCatalogFallbackActive).toBe(true)
    expect(result.current.sourceCapabilities).toMatchObject({
      supportsPricing: true,
      supportsGroupFiltering: false,
      supportsAccountSummary: false,
      supportsTokenCompatibility: false,
      supportsCredentialVerification: false,
      supportsBatchCredentialVerification: false,
      supportsCliVerification: false,
    })
  })

  it("keeps AIHubMix user-scoped pricing while disabling key-backed capabilities", async () => {
    const aihubmixAccount: DisplaySiteData = {
      ...ACCOUNT,
      id: "aihubmix-account",
      siteType: SITE_TYPES.AIHUBMIX,
    }

    mockUseAccountData.mockReturnValue({
      enabledDisplayData: [aihubmixAccount],
    })
    mockUseModelData.mockReturnValue({
      pricingData: {
        data: [],
        group_ratio: {},
        success: true,
        usable_group: {},
        model_list_source: {
          kind: MODEL_LIST_SOURCE_KINDS.USER_SCOPED,
          provider: SITE_TYPES.AIHUBMIX,
        },
      },
      pricingContexts: [],
      isLoading: false,
      dataFormatError: false,
      accountQueryStates: [],
      loadPricingData: vi.fn(),
      loadErrorMessage: null,
      accountFallback: null,
    })

    const { result } = renderHook(() => useModelListData())

    act(() => {
      result.current.setSelectedSourceValue(
        toAccountSourceValue(aihubmixAccount.id),
      )
    })

    await waitFor(() => {
      expect(result.current.selectedSource?.kind).toBe(
        MODEL_MANAGEMENT_SOURCE_KINDS.ACCOUNT,
      )
    })

    expect(result.current.isAihubmixCatalogFallbackActive).toBe(false)
    expect(result.current.sourceCapabilities).toMatchObject({
      supportsPricing: true,
      supportsGroupFiltering: false,
      supportsAccountSummary: false,
      supportsTokenCompatibility: false,
      supportsCredentialVerification: false,
      supportsBatchCredentialVerification: false,
      supportsCliVerification: false,
    })
  })

  it("derives runtime model-list display capabilities from response metadata", async () => {
    mockUseModelData.mockReturnValue({
      pricingData: {
        data: [],
        group_ratio: {},
        success: true,
        usable_group: {},
        model_list_source: {
          kind: MODEL_LIST_SOURCE_KINDS.SUB2API_RUNTIME_KEY,
          provider: SITE_TYPES.SUB2API,
          supportsRuntimeModelList: true,
          supportsPricing: false,
        },
      },
      pricingContexts: [],
      isLoading: false,
      dataFormatError: false,
      accountQueryStates: [],
      loadPricingData: vi.fn(),
      loadErrorMessage: null,
      accountFallback: null,
    })

    const { result } = renderHook(() => useModelListData())

    act(() => {
      result.current.setSelectedSourceValue(toAccountSourceValue(ACCOUNT.id))
    })

    await waitFor(() => {
      expect(result.current.selectedSource?.kind).toBe(
        MODEL_MANAGEMENT_SOURCE_KINDS.ACCOUNT,
      )
    })

    expect(result.current.sourceCapabilities).toMatchObject({
      supportsRuntimeModelList: true,
      supportsPricing: false,
      supportsRatioDisplay: false,
      supportsGroupFiltering: false,
      supportsAccountSummary: false,
      supportsTokenCompatibility: true,
      supportsCredentialVerification: true,
      supportsBatchCredentialVerification: true,
      supportsCliVerification: true,
    })
  })

  it("keeps Sub2API fallback estimated pricing and group ratio display enabled", async () => {
    mockUseAccountData.mockReturnValue({
      enabledDisplayData: [
        {
          ...ACCOUNT,
          siteType: SITE_TYPES.SUB2API,
        },
      ],
    })
    mockUseModelData.mockReturnValue({
      pricingData: {
        data: [],
        group_ratio: {
          default: 1,
        },
        success: true,
        usable_group: {
          default: "default",
        },
        model_list_source: {
          kind: MODEL_LIST_SOURCE_KINDS.SUB2API_RUNTIME_KEY,
          provider: SITE_TYPES.SUB2API,
          supportsRuntimeModelList: true,
          supportsPricing: true,
        },
      },
      pricingContexts: [],
      isLoading: false,
      dataFormatError: false,
      accountQueryStates: [],
      loadPricingData: vi.fn(),
      loadErrorMessage: null,
      accountFallback: {
        isAvailable: true,
        isActive: true,
        hasLoadedTokens: true,
        isLoadingTokens: false,
        isLoadingCatalog: false,
        tokenLoadErrorMessage: null,
        catalogLoadErrorMessage: null,
        tokens: [],
        selectedTokenId: null,
        activeTokenName: "Runtime key",
        loadTokens: vi.fn(),
        setSelectedTokenId: vi.fn(),
        loadCatalog: vi.fn(),
      },
    })

    const { result } = renderHook(() => useModelListData())

    act(() => {
      result.current.setSelectedSourceValue(toAccountSourceValue(ACCOUNT.id))
    })

    await waitFor(() => {
      expect(result.current.selectedSource?.kind).toBe(
        MODEL_MANAGEMENT_SOURCE_KINDS.ACCOUNT,
      )
    })

    expect(result.current.isFallbackCatalogActive).toBe(true)
    expect(result.current.sourceCapabilities).toMatchObject({
      supportsRuntimeModelList: true,
      supportsPricing: true,
      supportsRatioDisplay: true,
      supportsGroupFiltering: true,
      supportsAccountSummary: false,
      supportsTokenCompatibility: true,
      supportsCredentialVerification: true,
      supportsBatchCredentialVerification: true,
      supportsCliVerification: true,
    })
  })

  it("exposes AIHubMix catalog fallback notice state without globally downgrading all-accounts capabilities", async () => {
    const aihubmixAccount: DisplaySiteData = {
      ...ACCOUNT,
      id: "aihubmix-account",
      siteType: SITE_TYPES.AIHUBMIX,
    }
    const normalAccount: DisplaySiteData = {
      ...ACCOUNT,
      id: "normal-account",
      name: "Normal Account",
    }

    mockUseAccountData.mockReturnValue({
      enabledDisplayData: [aihubmixAccount, normalAccount],
    })
    mockUseModelData.mockReturnValue({
      pricingData: null,
      pricingContexts: [
        {
          account: aihubmixAccount,
          pricing: {
            data: [],
            group_ratio: {},
            success: true,
            usable_group: {},
            model_list_source: {
              kind: MODEL_LIST_SOURCE_KINDS.CATALOG_FALLBACK,
              provider: SITE_TYPES.AIHUBMIX,
            },
          },
        },
        {
          account: normalAccount,
          pricing: {
            data: [],
            group_ratio: {},
            success: true,
            usable_group: {},
          },
        },
      ],
      isLoading: false,
      dataFormatError: false,
      accountQueryStates: [],
      loadPricingData: vi.fn(),
      loadErrorMessage: null,
      accountFallback: null,
    })

    const { result } = renderHook(() => useModelListData())

    act(() => {
      result.current.setSelectedSourceValue(ALL_ACCOUNTS_SOURCE_VALUE)
    })

    await waitFor(() => {
      expect(result.current.selectedSource?.kind).toBe(
        MODEL_MANAGEMENT_SOURCE_KINDS.ALL_ACCOUNTS,
      )
    })

    expect(result.current.isAihubmixCatalogFallbackActive).toBe(true)
    expect(result.current.sourceCapabilities).toMatchObject({
      supportsPricing: true,
      supportsGroupFiltering: true,
      supportsAccountSummary: true,
      supportsTokenCompatibility: false,
    })
  })

  it("resets the per-model cheapest sort when leaving the all-accounts view", async () => {
    const { result } = renderHook(() => useModelListData())

    act(() => {
      result.current.setSelectedSourceValue(ALL_ACCOUNTS_SOURCE_VALUE)
    })

    await waitFor(() => {
      expect(result.current.selectedSource?.kind).toBe(
        MODEL_MANAGEMENT_SOURCE_KINDS.ALL_ACCOUNTS,
      )
    })

    act(() => {
      result.current.setSortMode(MODEL_LIST_SORT_MODES.MODEL_CHEAPEST_FIRST)
    })

    expect(result.current.sortMode).toBe(
      MODEL_LIST_SORT_MODES.MODEL_CHEAPEST_FIRST,
    )

    act(() => {
      result.current.setSelectedSourceValue(toAccountSourceValue(ACCOUNT.id))
    })

    await waitFor(() => {
      expect(result.current.selectedSource?.kind).toBe(
        MODEL_MANAGEMENT_SOURCE_KINDS.ACCOUNT,
      )
    })

    await waitFor(() => {
      expect(result.current.sortMode).toBe(MODEL_LIST_SORT_MODES.DEFAULT)
    })
  })

  it("clears the all-accounts account filter when leaving the all-accounts view", async () => {
    const { result } = renderHook(() => useModelListData())

    act(() => {
      result.current.setSelectedSourceValue(ALL_ACCOUNTS_SOURCE_VALUE)
    })

    await waitFor(() => {
      expect(result.current.selectedSource?.kind).toBe(
        MODEL_MANAGEMENT_SOURCE_KINDS.ALL_ACCOUNTS,
      )
    })

    act(() => {
      result.current.setAllAccountsFilterAccountIds(["acc-1"])
    })

    expect(result.current.allAccountsFilterAccountIds).toEqual(["acc-1"])

    act(() => {
      result.current.setSelectedSourceValue(toAccountSourceValue(ACCOUNT.id))
    })

    await waitFor(() => {
      expect(result.current.selectedSource?.kind).toBe(
        MODEL_MANAGEMENT_SOURCE_KINDS.ACCOUNT,
      )
    })

    await waitFor(() => {
      expect(result.current.allAccountsFilterAccountIds).toEqual([])
    })
  })

  it("clears all-accounts group exclusions when leaving the all-accounts view", async () => {
    const { result } = renderHook(() => useModelListData())

    act(() => {
      result.current.setSelectedSourceValue(ALL_ACCOUNTS_SOURCE_VALUE)
    })

    await waitFor(() => {
      expect(result.current.selectedSource?.kind).toBe(
        MODEL_MANAGEMENT_SOURCE_KINDS.ALL_ACCOUNTS,
      )
    })

    act(() => {
      result.current.setAllAccountsExcludedGroupsByAccountId({
        "acc-1": ["vip"],
      })
    })

    expect(result.current.allAccountsExcludedGroupsByAccountId).toEqual({
      "acc-1": ["vip"],
    })

    act(() => {
      result.current.setSelectedSourceValue(toAccountSourceValue(ACCOUNT.id))
    })

    await waitFor(() => {
      expect(result.current.selectedSource?.kind).toBe(
        MODEL_MANAGEMENT_SOURCE_KINDS.ACCOUNT,
      )
    })

    await waitFor(() => {
      expect(result.current.allAccountsExcludedGroupsByAccountId).toEqual({})
    })
  })

  it("resets price sorting when the selected source cannot provide pricing", async () => {
    mockUseModelData.mockReturnValue({
      pricingData: {
        data: [],
        group_ratio: {},
        success: true,
        usable_group: {},
      },
      pricingContexts: [],
      isLoading: false,
      dataFormatError: false,
      accountQueryStates: [],
      loadPricingData: vi.fn(),
      loadErrorMessage: null,
      accountFallback: {
        isAvailable: true,
        isActive: true,
        hasLoadedTokens: true,
        isLoadingTokens: false,
        isLoadingCatalog: false,
        tokenLoadErrorMessage: null,
        catalogLoadErrorMessage: null,
        tokens: [],
        selectedTokenId: null,
        activeTokenName: "Fallback key",
        loadTokens: vi.fn(),
        setSelectedTokenId: vi.fn(),
        loadCatalog: vi.fn(),
      },
    })

    const { result } = renderHook(() => useModelListData())

    act(() => {
      result.current.setSelectedSourceValue(toAccountSourceValue(ACCOUNT.id))
    })

    await waitFor(() => {
      expect(result.current.selectedSource?.kind).toBe(
        MODEL_MANAGEMENT_SOURCE_KINDS.ACCOUNT,
      )
    })

    act(() => {
      result.current.setSortMode(MODEL_LIST_SORT_MODES.PRICE_DESC)
    })

    await waitFor(() => {
      expect(result.current.sortMode).toBe(MODEL_LIST_SORT_MODES.DEFAULT)
    })
  })
})
