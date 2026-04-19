import { describe, expect, it, vi } from "vitest"

import { ApiCredentialProfileListItem } from "~/features/ApiCredentialProfiles/components/ApiCredentialProfileListItem"
import { SiteHealthStatus } from "~/types"
import type { ApiCredentialProfile } from "~/types/apiCredentialProfiles"
import { fireEvent, render, screen } from "~~/tests/test-utils/render"

vi.mock("react-i18next", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-i18next")>()

  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, options?: { count?: number }) => {
        if (key === "common:quota.unlimited") return "Unlimited"
        if (key === "apiCredentialProfiles:telemetry.notProvided") {
          return "Not provided"
        }
        if (key === "apiCredentialProfiles:telemetry.modelCount") {
          return `${options?.count ?? 0} models`
        }
        if (key === "account:healthStatus.warning") return "Warning"
        if (key === "account:healthStatus.healthy") return "Healthy"
        if (key === "apiCredentialProfiles:telemetry.health") return "Health"
        if (key === "apiCredentialProfiles:telemetry.actions.refresh") {
          return "Refresh telemetry"
        }
        if (key === "apiCredentialProfiles:telemetry.refreshing") {
          return "Refreshing telemetry"
        }
        return key
      },
    }),
  }
})

vi.mock(
  "~/components/dialogs/VerifyApiDialog/VerificationHistorySummary",
  () => ({
    VerificationHistorySummary: () => (
      <div data-testid="verification-summary" />
    ),
  }),
)

vi.mock("~/components/icons/CCSwitchIcon", () => ({
  CCSwitchIcon: () => <span data-testid="cc-switch-icon" />,
}))

vi.mock("~/components/icons/CherryIcon", () => ({
  CherryIcon: () => <span data-testid="cherry-icon" />,
}))

vi.mock("~/components/icons/ClaudeCodeRouterIcon", () => ({
  ClaudeCodeRouterIcon: () => <span data-testid="claude-code-router-icon" />,
}))

vi.mock("~/components/icons/CliProxyIcon", () => ({
  CliProxyIcon: () => <span data-testid="cli-proxy-icon" />,
}))

vi.mock("~/components/icons/KiloCodeIcon", () => ({
  KiloCodeIcon: () => <span data-testid="kilo-code-icon" />,
}))

vi.mock("~/components/icons/ManagedSiteIcon", () => ({
  ManagedSiteIcon: () => <span data-testid="managed-site-icon" />,
}))

vi.mock("~/components/ui", () => ({
  Badge: ({ children }: any) => <span>{children}</span>,
  Card: ({ children }: any) => <div>{children}</div>,
  CardContent: ({ children }: any) => <div>{children}</div>,
  Heading6: ({ children }: any) => <h6>{children}</h6>,
  IconButton: ({ children, ...props }: any) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
}))

vi.mock("~/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: any) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: any) => <div>{children}</div>,
  DropdownMenuItem: ({ children, ...props }: any) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuTrigger: ({ children }: any) => <>{children}</>,
}))

vi.mock("~/contexts/UserPreferencesContext", () => ({
  useUserPreferencesContext: () => ({ currencyType: "USD" }),
}))

function buildProfile(
  overrides: Partial<ApiCredentialProfile> = {},
): ApiCredentialProfile {
  return {
    id: "profile-1",
    name: "NewAPI Unlimited",
    apiType: "openai-compatible",
    baseUrl: "https://newapi.example.com",
    apiKey: "sk-newapi",
    tagIds: [],
    notes: "",
    createdAt: 1,
    updatedAt: 1,
    telemetrySnapshot: {
      attempts: [],
      health: { status: SiteHealthStatus.Healthy },
      lastSuccessTime: 1,
      lastSyncTime: 1,
      source: "newApiTokenUsage",
      totalUsedUsd: 1.88131,
      unlimitedQuota: true,
    },
    ...overrides,
  }
}

function renderListItem(
  profile: ApiCredentialProfile,
  overrides: {
    isTelemetryRefreshing?: boolean
    onRefreshTelemetry?: (profile: ApiCredentialProfile) => void
  } = {},
) {
  const onRefreshTelemetry = overrides.onRefreshTelemetry ?? vi.fn()
  return render(
    <ApiCredentialProfileListItem
      profile={profile}
      verificationSummary={null}
      tagNames={[]}
      visibleKeys={new Set()}
      toggleKeyVisibility={vi.fn()}
      onCopyBaseUrl={vi.fn()}
      onCopyApiKey={vi.fn()}
      onCopyBundle={vi.fn()}
      onOpenModelManagement={vi.fn()}
      onVerify={vi.fn()}
      onVerifyCliSupport={vi.fn()}
      onRefreshTelemetry={onRefreshTelemetry}
      onEdit={vi.fn()}
      onDelete={vi.fn()}
      onExport={vi.fn()}
      isTelemetryRefreshing={overrides.isTelemetryRefreshing ?? false}
      managedSiteType="new-api"
      managedSiteLabel="New API"
    />,
    {
      withReleaseUpdateStatusProvider: false,
      withThemeProvider: false,
      withUserPreferencesProvider: false,
    },
  )
}

describe("ApiCredentialProfileListItem", () => {
  it("explicitly marks missing daily telemetry from a successful source as not provided", () => {
    renderListItem(buildProfile())

    expect(
      screen.getByTestId("api-credential-telemetry-balance"),
    ).toHaveTextContent("Unlimited")
    expect(
      screen.getByTestId("api-credential-telemetry-today-usage"),
    ).toHaveTextContent("Not provided")
    expect(
      screen.getByTestId("api-credential-telemetry-today-requests"),
    ).toHaveTextContent("Not provided")
  })

  it("explicitly marks missing balance from a successful usage source as not provided", () => {
    renderListItem(
      buildProfile({
        telemetrySnapshot: {
          attempts: [],
          health: { status: SiteHealthStatus.Healthy },
          lastSuccessTime: 1,
          lastSyncTime: 1,
          source: "customReadOnlyEndpoint",
          todayRequests: 42,
        },
      }),
    )

    expect(
      screen.getByTestId("api-credential-telemetry-balance"),
    ).toHaveTextContent("Not provided")
  })

  it("uses not provided fallbacks for model-only refreshed snapshots", () => {
    renderListItem(
      buildProfile({
        telemetrySnapshot: {
          attempts: [],
          health: { status: SiteHealthStatus.Healthy },
          lastSuccessTime: 1,
          lastSyncTime: 1,
          models: { count: 2, preview: ["gpt-4o", "o3"] },
        },
      }),
    )

    expect(
      screen.getByTestId("api-credential-telemetry-balance"),
    ).toHaveTextContent("Not provided")
    expect(
      screen.getByTestId("api-credential-telemetry-today-usage"),
    ).toHaveTextContent("Not provided")
    expect(
      screen.getByTestId("api-credential-telemetry-today-requests"),
    ).toHaveTextContent("Not provided")
    expect(
      screen.getByTestId("api-credential-telemetry-models"),
    ).toHaveTextContent("2 models")
  })

  it("renders dash fallbacks when telemetry has never been refreshed", () => {
    renderListItem(buildProfile({ telemetrySnapshot: undefined }))

    expect(
      screen.getByTestId("api-credential-telemetry-balance"),
    ).toHaveTextContent("-")
    expect(
      screen.getByTestId("api-credential-telemetry-today-usage"),
    ).toHaveTextContent("-")
    expect(
      screen.getByTestId("api-credential-telemetry-today-requests"),
    ).toHaveTextContent("-")
    expect(
      screen.getByTestId("api-credential-telemetry-models"),
    ).toHaveTextContent("-")
  })

  it("exposes localized health status text accessibly", () => {
    renderListItem(
      buildProfile({
        telemetrySnapshot: {
          attempts: [],
          health: {
            reason: "quota is low",
            status: SiteHealthStatus.Warning,
          },
          lastSyncTime: 1,
        },
      }),
    )

    expect(
      screen.getByLabelText("Health: Warning: quota is low"),
    ).toHaveAttribute("role", "img")
  })

  it("wires the telemetry refresh button and reflects the refreshing state", () => {
    const onRefreshTelemetry = vi.fn()

    const { rerender } = renderListItem(buildProfile(), { onRefreshTelemetry })

    fireEvent.click(screen.getByRole("button", { name: "Refresh telemetry" }))

    expect(onRefreshTelemetry).toHaveBeenCalledWith(
      expect.objectContaining({ id: "profile-1" }),
    )

    rerender(
      <ApiCredentialProfileListItem
        profile={buildProfile()}
        verificationSummary={null}
        tagNames={[]}
        visibleKeys={new Set()}
        toggleKeyVisibility={vi.fn()}
        onCopyBaseUrl={vi.fn()}
        onCopyApiKey={vi.fn()}
        onCopyBundle={vi.fn()}
        onOpenModelManagement={vi.fn()}
        onVerify={vi.fn()}
        onVerifyCliSupport={vi.fn()}
        onRefreshTelemetry={onRefreshTelemetry}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onExport={vi.fn()}
        isTelemetryRefreshing
        managedSiteType="new-api"
        managedSiteLabel="New API"
      />,
    )

    expect(
      screen.getByRole("button", { name: "Refresh telemetry" }),
    ).toBeDisabled()
    expect(screen.getByText("Refreshing telemetry")).toBeInTheDocument()
  })
})
