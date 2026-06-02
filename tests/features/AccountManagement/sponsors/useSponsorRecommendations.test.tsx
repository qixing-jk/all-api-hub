import { beforeEach, describe, expect, it, vi } from "vitest"

import { SPONSOR_RECOMMENDATION_SURFACES } from "~/features/AccountManagement/sponsors/constants"
import {
  SPONSOR_CATALOG_SOURCES,
  SPONSOR_SUPPORT_STATUS,
  type SponsorRecommendation,
} from "~/features/AccountManagement/sponsors/types"
import { useSponsorRecommendations } from "~/features/AccountManagement/sponsors/useSponsorRecommendations"
import { act, renderHook, waitFor } from "~~/tests/test-utils/render"

const { mockLoadSponsorRecommendations, mockRefreshSponsorRecommendations } =
  vi.hoisted(() => ({
    mockLoadSponsorRecommendations: vi.fn(),
    mockRefreshSponsorRecommendations: vi.fn(),
  }))

vi.mock("~/features/AccountManagement/sponsors/loader", () => ({
  loadSponsorRecommendations: mockLoadSponsorRecommendations,
  refreshSponsorRecommendations: mockRefreshSponsorRecommendations,
}))

const recommendations: SponsorRecommendation[] = [
  {
    id: "first-provider",
    name: "First Provider",
    tagline: "First sponsor.",
    primaryAffiliateUrl: "https://first.example.com/register",
    supportStatus: SPONSOR_SUPPORT_STATUS.Unsupported,
    fallbackHints: {
      bookmarkManager: false,
      apiCredentialProfiles: false,
    },
    source: SPONSOR_CATALOG_SOURCES.Bundled,
    rank: 1,
  },
  {
    id: "second-provider",
    name: "Second Provider",
    tagline: "Second sponsor.",
    primaryAffiliateUrl: "https://second.example.com/register",
    supportStatus: SPONSOR_SUPPORT_STATUS.Unsupported,
    fallbackHints: {
      bookmarkManager: false,
      apiCredentialProfiles: false,
    },
    source: SPONSOR_CATALOG_SOURCES.Bundled,
    rank: 2,
  },
  {
    id: "third-provider",
    name: "Third Provider",
    tagline: "Third sponsor.",
    primaryAffiliateUrl: "https://third.example.com/register",
    supportStatus: SPONSOR_SUPPORT_STATUS.Unsupported,
    fallbackHints: {
      bookmarkManager: false,
      apiCredentialProfiles: false,
    },
    source: SPONSOR_CATALOG_SOURCES.Bundled,
    rank: 3,
  },
  {
    id: "fourth-provider",
    name: "Fourth Provider",
    tagline: "Fourth sponsor.",
    primaryAffiliateUrl: "https://fourth.example.com/register",
    supportStatus: SPONSOR_SUPPORT_STATUS.Unsupported,
    fallbackHints: {
      bookmarkManager: false,
      apiCredentialProfiles: false,
    },
    source: SPONSOR_CATALOG_SOURCES.Bundled,
    rank: 4,
  },
]

describe("useSponsorRecommendations", () => {
  beforeEach(() => {
    mockLoadSponsorRecommendations.mockReset()
    mockRefreshSponsorRecommendations.mockReset()
  })

  it("does not load or refresh sponsor recommendations when disabled", async () => {
    const { result } = renderHook(
      () =>
        useSponsorRecommendations({
          surface: SPONSOR_RECOMMENDATION_SURFACES.AddAccountDialog,
          enabled: false,
        }),
      {
        withReleaseUpdateStatusProvider: false,
        withThemeProvider: false,
        withUserPreferencesProvider: false,
      },
    )

    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(result.current).toEqual({
      items: [],
      isLoading: false,
    })
    expect(mockLoadSponsorRecommendations).not.toHaveBeenCalled()
    expect(mockRefreshSponsorRecommendations).not.toHaveBeenCalled()
  })

  it("loads all recommendations and refreshes them for the selected locale", async () => {
    let resolveRefresh:
      | ((result: {
          items: SponsorRecommendation[]
          source: typeof SPONSOR_CATALOG_SOURCES.Remote
        }) => void)
      | undefined
    const refreshPromise = new Promise<{
      items: SponsorRecommendation[]
      source: typeof SPONSOR_CATALOG_SOURCES.Remote
    }>((resolve) => {
      resolveRefresh = resolve
    })
    mockLoadSponsorRecommendations.mockResolvedValue({
      items: recommendations,
      source: SPONSOR_CATALOG_SOURCES.Bundled,
    })
    mockRefreshSponsorRecommendations.mockReturnValue(refreshPromise)

    const { result } = renderHook(
      () =>
        useSponsorRecommendations({
          surface: SPONSOR_RECOMMENDATION_SURFACES.AddAccountDialog,
        }),
      {
        withReleaseUpdateStatusProvider: false,
        withThemeProvider: false,
        withUserPreferencesProvider: false,
      },
    )

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
      expect(result.current.items.map((item) => item.id)).toEqual([
        "first-provider",
        "second-provider",
        "third-provider",
        "fourth-provider",
      ])
    })

    await act(async () => {
      resolveRefresh?.({
        items: [
          {
            ...recommendations[0],
            id: "remote-provider",
            name: "Remote Provider",
            source: SPONSOR_CATALOG_SOURCES.Remote,
          },
        ],
        source: SPONSOR_CATALOG_SOURCES.Remote,
      })
      await refreshPromise
    })

    await waitFor(() => {
      expect(result.current.items.map((item) => item.id)).toEqual([
        "remote-provider",
      ])
    })
    expect(mockLoadSponsorRecommendations).toHaveBeenCalledWith({
      locale: "en",
    })
    expect(mockRefreshSponsorRecommendations).toHaveBeenCalledWith({
      locale: "en",
    })
  })

  it("keeps loaded recommendations when refresh returns no update", async () => {
    mockLoadSponsorRecommendations.mockResolvedValue({
      items: recommendations,
      source: SPONSOR_CATALOG_SOURCES.Bundled,
    })
    mockRefreshSponsorRecommendations.mockResolvedValue(null)

    const { result } = renderHook(
      () =>
        useSponsorRecommendations({
          surface: SPONSOR_RECOMMENDATION_SURFACES.Newcomer,
        }),
      {
        withReleaseUpdateStatusProvider: false,
        withThemeProvider: false,
        withUserPreferencesProvider: false,
      },
    )

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
      expect(result.current.items.map((item) => item.id)).toEqual([
        "first-provider",
        "second-provider",
        "third-provider",
        "fourth-provider",
      ])
    })
  })
})
