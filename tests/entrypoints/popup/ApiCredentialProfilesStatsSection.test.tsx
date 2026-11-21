import { beforeEach, describe, expect, it, vi } from "vitest"

import { CURRENCIES, CURRENCY_DISPLAY_MODES } from "~/constants/money"
import ApiCredentialProfilesStatsSection from "~/entrypoints/popup/components/ApiCredentialProfilesStatsSection"
import {
  EVIDENCE_KINDS,
  FINANCIAL_COVERAGE,
  FINANCIAL_SUBJECT_KINDS,
  MEASUREMENT_UNIT_KINDS,
  OBSERVATION_STATUSES,
  SCOPE_SELECTION_KINDS,
} from "~/services/amounts/financialConstants"
import { normalizeTelemetryPatchToFacts } from "~/services/apiCredentialProfiles/telemetry/facts"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_EVENTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
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
  "~/features/ApiCredentialProfiles/workspace/useApiCredentialProfiles",
  () => ({
    useApiCredentialProfiles: () => mockUseApiCredentialProfiles(),
  }),
)

vi.mock(
  "~/services/productAnalytics/runtime/dispatch",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("~/services/productAnalytics/runtime/dispatch")
      >()

    return {
      ...actual,
      trackProductAnalyticsEvent: (...args: any[]) =>
        trackProductAnalyticsEventMock(...args),
    }
  },
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
  it.each([true, false])(
    "aggregates today's complete counters only when their intervals match: %s",
    (sameWindow) => {
      const now = Date.now()
      const day = new Date(now)
      const start = Date.UTC(
        day.getUTCFullYear(),
        day.getUTCMonth(),
        day.getUTCDate(),
      )
      const profiles = [1, 2].map((value, index) =>
        buildProfile({
          id: `usage-${index}`,
          telemetrySnapshot: {
            attempts: [],
            health: { status: SiteHealthStatus.Healthy },
            lastSyncTime: now,
            facts: {
              usage: {
                todayCost: {
                  value,
                  unit: {
                    kind: MEASUREMENT_UNIT_KINDS.Money,
                    currency: CURRENCIES.USD,
                    decimalPlaces: 2,
                  },
                  status: OBSERVATION_STATUSES.Known,
                  source: {
                    adapter: "test",
                    contractVersion: "2",
                    operation: "billing",
                    kind: EVIDENCE_KINDS.Reported,
                  },
                  coverage: FINANCIAL_COVERAGE.Complete,
                  scope: {
                    subject: {
                      kind: FINANCIAL_SUBJECT_KINDS.Credential,
                      profileId: `usage-${index}`,
                    },
                    authority: `https://site${index}.example`,
                    projects: { kind: SCOPE_SELECTION_KINDS.All },
                    keys: { kind: SCOPE_SELECTION_KINDS.All },
                    models: { kind: SCOPE_SELECTION_KINDS.All },
                    groups: { kind: SCOPE_SELECTION_KINDS.All },
                  },
                  observedAt: now,
                  window: {
                    start,
                    end: now - (sameWindow ? 0 : index * 1000),
                    timeZone: "UTC",
                  },
                },
              },
            },
          },
        }),
      )
      mockUseUserPreferencesContext.mockReturnValue({
        currencyType: CURRENCIES.USD,
      })
      mockUseApiCredentialProfiles.mockReturnValue({
        isLoading: false,
        profiles,
      })
      render(<ApiCredentialProfilesStatsSection />, {
        withUserPreferencesProvider: false,
        withThemeProvider: false,
      })
      if (sameWindow) expect(screen.getByText(/USD\s+3$/)).toBeInTheDocument()
      else expect(screen.queryByText(/USD\s+3$/)).not.toBeInTheDocument()
    },
  )
  it("uses native available totals without adding their components", () => {
    const facts = normalizeTelemetryPatchToFacts(
      {
        balances: [
          {
            amount: "110",
            currency: CURRENCIES.CNY,
            grantedAmount: "10",
            toppedUpAmount: "100",
          },
        ],
        balanceCoverage: "complete",
      },
      "deepSeekBalance",
      {
        profileId: "profile-1",
        baseUrl: "https://api.example.com",
        observedAt: 1000,
      },
    )
    for (const p of facts.balanceSnapshot!.positions) {
      p.scope.projects = { kind: SCOPE_SELECTION_KINDS.All }
      p.scope.keys = { kind: SCOPE_SELECTION_KINDS.All }
      p.scope.models = { kind: SCOPE_SELECTION_KINDS.All }
      p.scope.groups = { kind: SCOPE_SELECTION_KINDS.All }
    }
    mockUseUserPreferencesContext.mockReturnValue({
      currencyType: CURRENCIES.USD,
      currencyDisplay: CURRENCY_DISPLAY_MODES.Original,
    })
    mockUseApiCredentialProfiles.mockReturnValue({
      isLoading: false,
      profiles: [
        buildProfile({
          telemetrySnapshot: {
            schemaVersion: 2,
            health: { status: SiteHealthStatus.Healthy },
            lastSyncTime: 1000,
            attempts: [],
            facts,
          },
        }),
      ],
    })
    render(<ApiCredentialProfilesStatsSection />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })
    expect(screen.getByText(/CNY\s+110$/)).toBeInTheDocument()
    expect(
      screen.getByText("account:financial.availableTotal"),
    ).toBeInTheDocument()
    expect(screen.queryByText(/220/)).not.toBeInTheDocument()
  })
  beforeEach(() => {
    trackProductAnalyticsEventMock.mockReset()
  })

  it("does not aggregate legacy monetary observations without verified scope", () => {
    mockUseUserPreferencesContext.mockReturnValue({
      currencyType: CURRENCIES.USD,
    })
    mockUseApiCredentialProfiles.mockReturnValue({
      isLoading: false,
      profiles: [
        buildProfile({
          id: "profile-1",
          tagIds: ["team-a"],
          telemetrySnapshot: {
            attempts: [],
            health: { status: SiteHealthStatus.Healthy },
            lastSyncTime: 1000,
            facts: {
              balances: [
                {
                  amount: 12.5,
                  unit: {
                    kind: MEASUREMENT_UNIT_KINDS.Money,
                    currency: CURRENCIES.USD,
                    decimalPlaces: 2,
                  },
                  semantics: "cash",
                },
              ],
              usage: {
                todayCost: {
                  value: 1.25,
                  unit: {
                    kind: MEASUREMENT_UNIT_KINDS.Money,
                    currency: CURRENCIES.USD,
                    decimalPlaces: 2,
                  },
                },
              },
            },
          },
        }),
        buildProfile({
          id: "profile-2",
          baseUrl: "https://other.example.com",
          tagIds: ["team-a", "team-b"],
          telemetrySnapshot: {
            attempts: [],
            health: { status: SiteHealthStatus.Warning },
            lastSyncTime: 1000,
            facts: {
              balances: [
                {
                  amount: 2,
                  unit: {
                    kind: MEASUREMENT_UNIT_KINDS.Money,
                    currency: CURRENCIES.USD,
                    decimalPlaces: 2,
                  },
                  semantics: "cash",
                },
              ],
            },
          },
        }),
      ],
    })

    render(<ApiCredentialProfilesStatsSection />, {
      withReleaseUpdateStatusProvider: false,
      withThemeProvider: false,
      withUserPreferencesProvider: false,
    })

    expect(screen.queryByText("$14.50")).not.toBeInTheDocument()
    expect(screen.queryByText("$1.25")).not.toBeInTheDocument()
    expect(
      screen.getByText(
        "apiCredentialProfiles:telemetry.balanceSemantics.legacy",
      ),
    ).toBeInTheDocument()
  })

  it("does not present missing telemetry as a zero balance", () => {
    mockUseUserPreferencesContext.mockReturnValue({
      currencyType: CURRENCIES.USD,
    })
    mockUseApiCredentialProfiles.mockReturnValue({
      isLoading: false,
      profiles: [buildProfile()],
    })

    render(<ApiCredentialProfilesStatsSection />, {
      withReleaseUpdateStatusProvider: false,
      withThemeProvider: false,
      withUserPreferencesProvider: false,
    })

    const placeholders = screen.getAllByText(
      "apiCredentialProfiles:telemetry.notProvided",
    )

    expect(placeholders).toHaveLength(2)
    expect(placeholders[0]).toHaveClass("block")
    expect(placeholders[1]).toHaveClass("block")
  })

  it("excludes historical cash labels from financial totals", () => {
    mockUseUserPreferencesContext.mockReturnValue({
      currencyType: CURRENCIES.USD,
    })
    mockUseApiCredentialProfiles.mockReturnValue({
      isLoading: false,
      profiles: [
        buildProfile({
          telemetrySnapshot: {
            attempts: [],
            health: { status: SiteHealthStatus.Healthy },
            lastSyncTime: 1000,
            facts: {
              balances: [
                {
                  amount: 4,
                  unit: {
                    kind: MEASUREMENT_UNIT_KINDS.Money,
                    currency: CURRENCIES.USD,
                    decimalPlaces: 2,
                  },
                  semantics: "cash",
                },
                {
                  amount: 6,
                  unit: {
                    kind: MEASUREMENT_UNIT_KINDS.Money,
                    currency: CURRENCIES.USD,
                    decimalPlaces: 2,
                  },
                  semantics: "cash",
                },
              ],
            },
          },
        }),
      ],
    })

    render(<ApiCredentialProfilesStatsSection />, {
      withReleaseUpdateStatusProvider: false,
      withThemeProvider: false,
      withUserPreferencesProvider: false,
    })

    expect(screen.queryByText("$10.00")).not.toBeInTheDocument()
  })

  it("does not present refreshed snapshots without balance as a zero balance", () => {
    mockUseUserPreferencesContext.mockReturnValue({
      currencyType: CURRENCIES.USD,
    })
    mockUseApiCredentialProfiles.mockReturnValue({
      isLoading: false,
      profiles: [
        buildProfile({
          telemetrySnapshot: {
            attempts: [],
            health: { status: SiteHealthStatus.Healthy },
            lastSyncTime: 1000,
            facts: {
              models: { count: 2, preview: ["gpt-4o", "o3"] },
            },
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
    const placeholders = screen.getAllByText(
      "apiCredentialProfiles:telemetry.notProvided",
    )

    expect(placeholders).toHaveLength(2)
    expect(placeholders[0]).toHaveClass("block")
    expect(placeholders[1]).toHaveClass("block")
  })

  it("renders missing money stats as neutral values on their own line", () => {
    mockUseUserPreferencesContext.mockReturnValue({
      currencyType: CURRENCIES.USD,
    })
    mockUseApiCredentialProfiles.mockReturnValue({
      isLoading: false,
      profiles: [
        buildProfile({
          telemetrySnapshot: {
            attempts: [],
            health: { status: SiteHealthStatus.Healthy },
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

    const placeholders = screen.getAllByText(
      "apiCredentialProfiles:telemetry.notProvided",
    )

    expect(placeholders).toHaveLength(2)
    expect(placeholders[0]).toHaveClass("block")
    expect(placeholders[1]).toHaveClass("block")
    expect(placeholders[1]).not.toHaveClass("text-cashflow-expense")
    expect(placeholders[1]).toHaveClass("text-muted-foreground")
  })

  it("tracks anonymous inventory buckets without raw counts", () => {
    mockUseUserPreferencesContext.mockReturnValue({
      currencyType: CURRENCIES.USD,
    })
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
        item_count: 3,
        selected_count: 3,
        success_count: 0,
        failure_count: 0,
        model_count: 3,
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
    expect(payloadText).not.toContain("alpha.example.com")
  })

  it("tracks only unhealthy telemetry snapshots as failures", () => {
    mockUseUserPreferencesContext.mockReturnValue({
      currencyType: CURRENCIES.USD,
    })
    mockUseApiCredentialProfiles.mockReturnValue({
      isLoading: false,
      profiles: [
        buildProfile({
          id: "profile-1",
          telemetrySnapshot: {
            attempts: [],
            health: { status: SiteHealthStatus.Healthy },
            lastSyncTime: 1000,
          },
        }),
        buildProfile({
          id: "profile-2",
          telemetrySnapshot: {
            attempts: [],
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

    expect(trackProductAnalyticsEventMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_EVENTS.FeatureActionCompleted,
      expect.objectContaining({
        success_count: 1,
        failure_count: 1,
      }),
    )
  })
})
