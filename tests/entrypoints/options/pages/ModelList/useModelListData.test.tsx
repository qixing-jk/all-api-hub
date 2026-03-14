import { act, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { useModelListData } from "~/features/ModelList/hooks/useModelListData"
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
})
