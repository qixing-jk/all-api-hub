import { describe, expect, it, vi } from "vitest"

import { ApiCredentialProfileListItem } from "~/features/ApiCredentialProfiles/components/ApiCredentialProfileListItem"
import { SiteHealthStatus } from "~/types"
import type { ApiCredentialProfile } from "~/types/apiCredentialProfiles"
import { render, screen } from "~~/tests/test-utils/render"

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

describe("ApiCredentialProfileListItem", () => {
  it("explicitly marks missing daily telemetry from a successful source as not provided", () => {
    render(
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
        onRefreshTelemetry={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onExport={vi.fn()}
        isTelemetryRefreshing={false}
        managedSiteType="new-api"
        managedSiteLabel="New API"
      />,
      {
        withReleaseUpdateStatusProvider: false,
        withThemeProvider: false,
        withUserPreferencesProvider: false,
      },
    )

    expect(screen.getByText("common:quota.unlimited")).toBeInTheDocument()
    expect(
      screen.getAllByText("apiCredentialProfiles:telemetry.notProvided"),
    ).toHaveLength(2)
  })
})
