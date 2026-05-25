import { describe, expect, it, vi } from "vitest"

import { SPONSOR_RECOMMENDATION_SURFACES } from "~/features/AccountManagement/sponsors/constants"
import { useSponsorRecommendations } from "~/features/AccountManagement/sponsors/useSponsorRecommendations"
import { renderHook } from "~~/tests/test-utils/render"

const { mockLoadSponsorRecommendations, mockRefreshSponsorRecommendations } =
  vi.hoisted(() => ({
    mockLoadSponsorRecommendations: vi.fn(),
    mockRefreshSponsorRecommendations: vi.fn(),
  }))

vi.mock("~/features/AccountManagement/sponsors/loader", () => ({
  loadSponsorRecommendations: mockLoadSponsorRecommendations,
  refreshSponsorRecommendations: mockRefreshSponsorRecommendations,
}))

describe("useSponsorRecommendations", () => {
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
})
