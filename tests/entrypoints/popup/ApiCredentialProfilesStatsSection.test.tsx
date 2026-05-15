import { beforeEach, describe, expect, it, vi } from "vitest"

import ApiCredentialProfilesStatsSection from "~/entrypoints/popup/components/ApiCredentialProfilesStatsSection"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_COUNT_BUCKETS,
  PRODUCT_ANALYTICS_EVENTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/events"
import { SiteHealthStatus } from "~/types"
import type { ApiCredentialProfile } from "~/types/apiCredentialProfiles"
import { render, screen } from "~~/tests/test-utils/render"

const { mockUseApiCredentialProfiles, mockUseUserPreferencesContext } =
  vi.hoisted(() => ({
    mockUseApiCredentialProfiles: vi.fn(),
    mockUseUserPreferencesContext: vi.fn(),
  }))

const { trackProductAnalyticsEventMock } = vi.hoisted(() => ({
  trackProductAnalyticsEventMock: vi.fn(),
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

vi.mock("~/services/productAnalytics/events", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/services/productAnalytics/events")>()

  return {
    ...actual,
    trackProductAnalyticsEvent: (...args: any[]) =>
      trackProductAnalyticsEventMock(...args),
  }
})

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
  beforeEach(() => {
    trackProductAnalyticsEventMock.mockReset()
  })

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

  it("tracks anonymous inventory buckets without raw counts", () => {
    mockUseUserPreferencesContext.mockReturnValue({ currencyType: "USD" })
    mockUseApiCredentialProfiles.mockReturnValue({
      isLoading: false,
      profiles: [
        buildProfile({
          id: "profile-1",
          baseUrl: "https://alpha.example.com",
          tagIds: ["tag-a"],
        }),
        buildProfile({
          id: "profile-2",
          baseUrl: "https://beta.example.com",
          tagIds: ["tag-a", "tag-b"],
        }),
        buildProfile({
          id: "profile-3",
          baseUrl: "https://gamma.example.com",
          tagIds: ["tag-c"],
        }),
      ],
    })

    render(<ApiCredentialProfilesStatsSection />, {
      withReleaseUpdateStatusProvider: false,
      withThemeProvider: false,
      withUserPreferencesProvider: false,
    })

    expect(trackProductAnalyticsEventMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_EVENTS.FeatureActionCompleted,
      {
        feature_id: PRODUCT_ANALYTICS_FEATURE_IDS.ApiCredentialProfiles,
        action_id: PRODUCT_ANALYTICS_ACTION_IDS.SnapshotApiCredentialProfiles,
        surface_id:
          PRODUCT_ANALYTICS_SURFACE_IDS.PopupApiCredentialProfilesStats,
        entrypoint: "popup",
        result: "success",
        item_count_bucket: PRODUCT_ANALYTICS_COUNT_BUCKETS.TwoToThree,
        selected_count_bucket: PRODUCT_ANALYTICS_COUNT_BUCKETS.TwoToThree,
        success_count_bucket: PRODUCT_ANALYTICS_COUNT_BUCKETS.Zero,
        failure_count_bucket: PRODUCT_ANALYTICS_COUNT_BUCKETS.Zero,
        model_count_bucket: PRODUCT_ANALYTICS_COUNT_BUCKETS.TwoToThree,
      },
    )

    const payloadText = JSON.stringify(
      trackProductAnalyticsEventMock.mock.calls,
    )
    expect(payloadText).not.toContain("alpha.example.com")
    expect(payloadText).not.toContain("beta.example.com")
    expect(payloadText).not.toContain("gamma.example.com")
    expect(payloadText).not.toContain("tag-a")
    expect(payloadText).not.toContain("tag-b")
    expect(payloadText).not.toContain("tag-c")
    expect(payloadText).not.toContain('"item_count":3')
    expect(payloadText).not.toContain('"selected_count":3')
    expect(payloadText).not.toContain('"model_count":3')
  })
})
