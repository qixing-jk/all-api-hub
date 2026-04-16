import { act, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { useModelListData } from "~/features/ModelList/hooks/useModelListData"
import { MODEL_LIST_SORT_MODES } from "~/features/ModelList/sortModes"
import { AuthTypeEnum, SiteHealthStatus, type DisplaySiteData } from "~/types"

const mockUseAccountData = vi.fn()
const mockUseApiCredentialProfiles = vi.fn()
const mockUseModelData = vi.fn()
const mockUseFilteredModels = vi.fn()

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
  userId: 1,
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
  })

  it("keeps the same profile selection when profile data updates", async () => {
    const { result, rerender } = renderHook(() => useModelListData())

    act(() => {
      result.current.setSelectedSourceValue("profile:profile-1")
    })

    expect(result.current.selectedSource?.kind).toBe("profile")
    if (result.current.selectedSource?.kind !== "profile") {
      throw new Error("Expected profile source to be selected")
    }
    expect(result.current.selectedSource.profile.name).toBe("Reusable Key")

    mockUseApiCredentialProfiles.mockReturnValue({
      profiles: [{ ...PROFILE, name: "Updated Profile", updatedAt: 2 }],
      isLoading: false,
    })

    rerender()

    await waitFor(() => {
      expect(result.current.selectedSource?.kind).toBe("profile")
    })

    if (result.current.selectedSource?.kind !== "profile") {
      throw new Error("Expected updated profile source to remain selected")
    }
    expect(result.current.selectedSource.profile.name).toBe("Updated Profile")
    expect(result.current.selectedSourceValue).toBe("profile:profile-1")
  })

  it("clears a stale profile selection when the backing profile is deleted", async () => {
    const { result, rerender } = renderHook(() => useModelListData())

    act(() => {
      result.current.setSelectedSourceValue("profile:profile-1")
    })

    expect(result.current.selectedSource?.kind).toBe("profile")

    mockUseApiCredentialProfiles.mockReturnValue({
      profiles: [],
      isLoading: false,
    })

    rerender()

    await waitFor(() => {
      expect(result.current.selectedSourceValue).toBe("")
    })

    expect(result.current.selectedSource).toBeNull()
  })

  it("keeps a persisted profile selection while profiles are still loading", async () => {
    const { result, rerender } = renderHook(() => useModelListData())

    act(() => {
      result.current.setSelectedSourceValue("profile:profile-1")
    })

    expect(result.current.selectedSource?.kind).toBe("profile")

    mockUseApiCredentialProfiles.mockReturnValue({
      profiles: [],
      isLoading: true,
    })

    rerender()

    await waitFor(() => {
      expect(result.current.selectedSourceValue).toBe("profile:profile-1")
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
      result.current.setSelectedSourceValue("account:account-1")
    })

    await waitFor(() => {
      expect(result.current.selectedSourceValue).toBe("")
    })

    expect(result.current.selectedSource).toBeNull()
  })

  it("selects a stored profile when routeParams.profileId resolves", async () => {
    const { result } = renderHook(() =>
      useModelListData({ profileId: "profile-1" }),
    )

    await waitFor(() => {
      expect(result.current.selectedSourceValue).toBe("profile:profile-1")
    })

    expect(result.current.selectedSource?.kind).toBe("profile")
  })

  it("prefers a valid route profile over a simultaneous account target", async () => {
    const { result } = renderHook(() =>
      useModelListData({ profileId: "profile-1", accountId: "acc-1" }),
    )

    await waitFor(() => {
      expect(result.current.selectedSourceValue).toBe("profile:profile-1")
    })

    expect(result.current.selectedSource?.kind).toBe("profile")
  })

  it("waits for profile storage before falling back from a stale profile deep link to accountId", async () => {
    mockUseApiCredentialProfiles.mockReturnValue({
      profiles: [],
      isLoading: true,
    })

    const { result, rerender } = renderHook(() =>
      useModelListData({ profileId: "missing-profile", accountId: "acc-1" }),
    )

    expect(result.current.selectedSourceValue).toBe("")
    expect(result.current.selectedSource).toBeNull()

    mockUseApiCredentialProfiles.mockReturnValue({
      profiles: [],
      isLoading: false,
    })

    rerender()

    await waitFor(() => {
      expect(result.current.selectedSourceValue).toBe("account:acc-1")
    })

    expect(result.current.selectedSource?.kind).toBe("account")
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
      result.current.setSelectedSourceValue("account:acc-1")
    })

    await waitFor(() => {
      expect(result.current.selectedSource?.kind).toBe("account")
    })

    expect(result.current.isFallbackCatalogActive).toBe(true)
    expect(result.current.sourceCapabilities).toMatchObject({
      supportsPricing: false,
      supportsGroupFiltering: false,
      supportsAccountSummary: false,
      supportsTokenCompatibility: true,
      supportsCredentialVerification: true,
      supportsCliVerification: true,
    })
  })

  it("resets the per-model cheapest sort when leaving the all-accounts view", async () => {
    const { result } = renderHook(() => useModelListData())

    act(() => {
      result.current.setSelectedSourceValue("all")
    })

    await waitFor(() => {
      expect(result.current.selectedSource?.kind).toBe("all-accounts")
    })

    act(() => {
      result.current.setSortMode(MODEL_LIST_SORT_MODES.MODEL_CHEAPEST_FIRST)
    })

    expect(result.current.sortMode).toBe(
      MODEL_LIST_SORT_MODES.MODEL_CHEAPEST_FIRST,
    )

    act(() => {
      result.current.setSelectedSourceValue("account:acc-1")
    })

    await waitFor(() => {
      expect(result.current.selectedSource?.kind).toBe("account")
    })

    await waitFor(() => {
      expect(result.current.sortMode).toBe(MODEL_LIST_SORT_MODES.DEFAULT)
    })
  })

  it("clears the all-accounts account filter when leaving the all-accounts view", async () => {
    const { result } = renderHook(() => useModelListData())

    act(() => {
      result.current.setSelectedSourceValue("all")
    })

    await waitFor(() => {
      expect(result.current.selectedSource?.kind).toBe("all-accounts")
    })

    act(() => {
      result.current.setAllAccountsFilterAccountIds(["acc-1"])
    })

    expect(result.current.allAccountsFilterAccountIds).toEqual(["acc-1"])

    act(() => {
      result.current.setSelectedSourceValue("account:acc-1")
    })

    await waitFor(() => {
      expect(result.current.selectedSource?.kind).toBe("account")
    })

    await waitFor(() => {
      expect(result.current.allAccountsFilterAccountIds).toEqual([])
    })
  })

  it("clears all-accounts group exclusions when leaving the all-accounts view", async () => {
    const { result } = renderHook(() => useModelListData())

    act(() => {
      result.current.setSelectedSourceValue("all")
    })

    await waitFor(() => {
      expect(result.current.selectedSource?.kind).toBe("all-accounts")
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
      result.current.setSelectedSourceValue("account:acc-1")
    })

    await waitFor(() => {
      expect(result.current.selectedSource?.kind).toBe("account")
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
      result.current.setSelectedSourceValue("account:acc-1")
    })

    await waitFor(() => {
      expect(result.current.selectedSource?.kind).toBe("account")
    })

    act(() => {
      result.current.setSortMode(MODEL_LIST_SORT_MODES.PRICE_DESC)
    })

    await waitFor(() => {
      expect(result.current.sortMode).toBe(MODEL_LIST_SORT_MODES.DEFAULT)
    })
  })
})
