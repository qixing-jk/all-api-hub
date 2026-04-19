import { describe, expect, it, vi } from "vitest"

import ApiCredentialProfilesStatsSection from "~/entrypoints/popup/components/ApiCredentialProfilesStatsSection"
import { SiteHealthStatus } from "~/types"
import type { ApiCredentialProfile } from "~/types/apiCredentialProfiles"
import { render, screen } from "~~/tests/test-utils/render"

const { mockUseApiCredentialProfiles, mockUseUserPreferencesContext } =
  vi.hoisted(() => ({
    mockUseApiCredentialProfiles: vi.fn(),
    mockUseUserPreferencesContext: vi.fn(),
  }))

vi.mock("react-countup", () => ({
  default: ({ end }: { end: number }) => <span>{end}</span>,
}))

vi.mock("~/contexts/UserPreferencesContext", () => ({
  useUserPreferencesContext: () => mockUseUserPreferencesContext(),
}))

vi.mock(
  "~/features/ApiCredentialProfiles/hooks/useApiCredentialProfiles",
  () => ({
    useApiCredentialProfiles: () => mockUseApiCredentialProfiles(),
  }),
)

function buildProfile(
  overrides: Partial<ApiCredentialProfile> = {},
): ApiCredentialProfile {
  return {
    id: "profile-1",
    name: "Profile",
    apiType: "openai-compatible",
    baseUrl: "https://api.example.com",
    apiKey: "sk-profile",
    tagIds: [],
    notes: "",
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  }
}

describe("ApiCredentialProfilesStatsSection", () => {
  it("shows telemetry totals when refreshed snapshots are available", () => {
    mockUseUserPreferencesContext.mockReturnValue({ currencyType: "USD" })
    mockUseApiCredentialProfiles.mockReturnValue({
      isLoading: false,
      profiles: [
        buildProfile({
          id: "profile-1",
          tagIds: ["team-a"],
          telemetrySnapshot: {
            attempts: [],
            balanceUsd: 12.5,
            health: { status: SiteHealthStatus.Healthy },
            lastSyncTime: 1000,
            todayCostUsd: 1.25,
          },
        }),
        buildProfile({
          id: "profile-2",
          baseUrl: "https://other.example.com",
          tagIds: ["team-a", "team-b"],
          telemetrySnapshot: {
            attempts: [],
            balanceUsd: 2,
            health: { status: SiteHealthStatus.Warning },
            lastSyncTime: 1000,
          },
        }),
      ],
    })

    render(<ApiCredentialProfilesStatsSection />, {
      withReleaseUpdateStatusProvider: false,
      withThemeProvider: false,
      withUserPreferencesProvider: false,
    })

    expect(screen.getByText("$14.50")).toBeInTheDocument()
    expect(screen.getByText("$1.25")).toBeInTheDocument()
  })

  it("does not present missing telemetry as a zero balance", () => {
    mockUseUserPreferencesContext.mockReturnValue({ currencyType: "USD" })
    mockUseApiCredentialProfiles.mockReturnValue({
      isLoading: false,
      profiles: [buildProfile()],
    })

    render(<ApiCredentialProfilesStatsSection />, {
      withReleaseUpdateStatusProvider: false,
      withThemeProvider: false,
      withUserPreferencesProvider: false,
    })

    expect(
      screen.getAllByText("apiCredentialProfiles:telemetry.notProvided"),
    ).toHaveLength(2)
  })

  it("does not present refreshed snapshots without balance as a zero balance", () => {
    mockUseUserPreferencesContext.mockReturnValue({ currencyType: "USD" })
    mockUseApiCredentialProfiles.mockReturnValue({
      isLoading: false,
      profiles: [
        buildProfile({
          telemetrySnapshot: {
            attempts: [],
            health: { status: SiteHealthStatus.Healthy },
            lastSyncTime: 1000,
            models: { count: 2, preview: ["gpt-4o", "o3"] },
          },
        }),
      ],
    })

    render(<ApiCredentialProfilesStatsSection />, {
      withReleaseUpdateStatusProvider: false,
      withThemeProvider: false,
      withUserPreferencesProvider: false,
    })

    expect(screen.queryByText("$0.00")).not.toBeInTheDocument()
    expect(
      screen.getAllByText("apiCredentialProfiles:telemetry.notProvided"),
    ).toHaveLength(2)
  })
})
