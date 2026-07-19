import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"

import { ApiCredentialProfileListItem } from "~/features/ApiCredentialProfiles/components/ApiCredentialProfileListItem"
import { API_CREDENTIAL_PROFILES_TEST_IDS } from "~/features/ApiCredentialProfiles/testIds"
import enApiCredentialProfiles from "~/locales/en/apiCredentialProfiles.json"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import { SiteHealthStatus } from "~/types"
import type { ApiCredentialProfile } from "~/types/apiCredentialProfiles"
import { testI18n } from "~~/tests/test-utils/i18n"
import { fireEvent, render, screen } from "~~/tests/test-utils/render"

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

vi.mock("~/components/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/components/ui")>()
  const { useProductAnalyticsScope } = await import(
    "~/contexts/ProductAnalyticsScopeContext"
  )
  const { resolveProductAnalyticsActionContext } = await import(
    "~/services/productAnalytics/actionConfig"
  )

  return {
    ...actual,
    Badge: ({ children }: any) => <span>{children}</span>,
    Card: ({ children }: any) => <div>{children}</div>,
    CardContent: ({ children }: any) => <div>{children}</div>,
    Heading6: ({ children }: any) => <h6>{children}</h6>,
    IconButton: ({ analyticsAction, children, ...props }: any) => {
      const scope = useProductAnalyticsScope()
      const resolvedAction = resolveProductAnalyticsActionContext(
        analyticsAction,
        scope,
      )

      return (
        <button
          type="button"
          data-analytics-action={
            resolvedAction
              ? `${resolvedAction.featureId}:${resolvedAction.actionId}:${resolvedAction.surfaceId}:${resolvedAction.entrypoint}`
              : undefined
          }
          {...props}
        >
          {children}
        </button>
      )
    },
  }
})

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
  beforeAll(() => {
    testI18n.addResource(
      "en",
      "apiCredentialProfiles",
      "list.expirationStatus.active",
      enApiCredentialProfiles.list.expirationStatus.active,
    )
    testI18n.addResource(
      "en",
      "apiCredentialProfiles",
      "list.expirationStatus.expired",
      enApiCredentialProfiles.list.expirationStatus.expired,
    )
    testI18n.addResource(
      "en",
      "apiCredentialProfiles",
      "telemetry.modelCount_one",
      enApiCredentialProfiles.telemetry.modelCount_one,
    )
    testI18n.addResource(
      "en",
      "apiCredentialProfiles",
      "telemetry.modelCount_other",
      enApiCredentialProfiles.telemetry.modelCount_other,
    )
  })

  afterAll(() => {
    testI18n.removeResourceBundle("en", "apiCredentialProfiles")
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("declares controlled analytics metadata for profile row actions", () => {
    renderListItem(buildProfile())

    const profileAction = (actionId: string) =>
      `${PRODUCT_ANALYTICS_FEATURE_IDS.ApiCredentialProfiles}:${actionId}:${PRODUCT_ANALYTICS_SURFACE_IDS.OptionsApiCredentialProfilesRowActions}:${PRODUCT_ANALYTICS_ENTRYPOINTS.Options}`

    expect(
      screen.getByRole("button", {
        name: "apiCredentialProfiles:actions.copyBaseUrl",
      }),
    ).toHaveAttribute(
      "data-analytics-action",
      profileAction(PRODUCT_ANALYTICS_ACTION_IDS.CopyBaseUrl),
    )
    expect(
      screen.getByRole("button", {
        name: "apiCredentialProfiles:actions.copyApiKey",
      }),
    ).toHaveAttribute(
      "data-analytics-action",
      profileAction(PRODUCT_ANALYTICS_ACTION_IDS.CopyApiKey),
    )
    expect(
      screen.getByRole("button", {
        name: "apiCredentialProfiles:actions.copyBundle",
      }),
    ).toHaveAttribute(
      "data-analytics-action",
      profileAction(PRODUCT_ANALYTICS_ACTION_IDS.CopyApiCredentialBundle),
    )
    expect(
      screen.getByRole("button", {
        name: "apiCredentialProfiles:actions.verifyApi",
      }),
    ).toHaveAttribute(
      "data-analytics-action",
      profileAction(PRODUCT_ANALYTICS_ACTION_IDS.VerifyApiCredential),
    )
    expect(
      screen.getByRole("button", {
        name: "apiCredentialProfiles:actions.openModelManagement",
      }),
    ).toHaveAttribute(
      "data-analytics-action",
      `${PRODUCT_ANALYTICS_FEATURE_IDS.ModelList}:${PRODUCT_ANALYTICS_ACTION_IDS.OpenApiCredentialModelManagement}:${PRODUCT_ANALYTICS_SURFACE_IDS.OptionsApiCredentialProfilesRowActions}:${PRODUCT_ANALYTICS_ENTRYPOINTS.Options}`,
    )
    expect(
      screen.getByRole("button", {
        name: "common:actions.export",
      }),
    ).toHaveAttribute(
      "data-analytics-action",
      profileAction(PRODUCT_ANALYTICS_ACTION_IDS.OpenApiCredentialExportMenu),
    )
  })

  it("delegates telemetry refresh without row-level started-only analytics", () => {
    const onRefreshTelemetry = vi.fn()
    renderListItem(buildProfile(), { onRefreshTelemetry })

    fireEvent.click(
      screen.getByRole("button", {
        name: "apiCredentialProfiles:telemetry.actions.refresh",
      }),
    )

    expect(onRefreshTelemetry).toHaveBeenCalledWith(
      expect.objectContaining({ id: "profile-1" }),
    )
  })

  it("explicitly marks missing daily telemetry from a successful source as not provided", () => {
    renderListItem(buildProfile())

    expect(
      screen.getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.telemetryBalance),
    ).toHaveTextContent("common:quota.unlimited")
    expect(
      screen.getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.telemetryTodayUsage),
    ).toHaveTextContent("apiCredentialProfiles:telemetry.notProvided")
    expect(
      screen.getByTestId(
        API_CREDENTIAL_PROFILES_TEST_IDS.telemetryTodayRequests,
      ),
    ).toHaveTextContent("apiCredentialProfiles:telemetry.notProvided")
  })

  it("shows expiration as a status badge and keeps audit timestamps separate", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 6, 30, 12).getTime())

    const expiresAt = new Date(2026, 6, 31).getTime()
    const createdAt = new Date(2026, 5, 1, 8, 30).getTime()
    const updatedAt = new Date(2026, 5, 15, 9, 45).getTime()

    renderListItem(
      buildProfile({
        expiresAt,
        createdAt,
        updatedAt,
      }),
    )

    expect(
      screen.getByText(
        testI18n.t("apiCredentialProfiles:list.expirationStatus.active", {
          date: new Date(expiresAt).toLocaleDateString(),
        }),
      ),
    ).toBeInTheDocument()
    expect(
      screen.queryByText(/apiCredentialProfiles:list.expiresAt:/),
    ).not.toBeInTheDocument()
    expect(
      screen.getByText(/apiCredentialProfiles:list.createdAt:/),
    ).toHaveTextContent(new Date(createdAt).toLocaleDateString())
    expect(
      screen.getByText(/apiCredentialProfiles:list.updatedAt:/),
    ).toHaveTextContent(new Date(updatedAt).toLocaleDateString())
  })

  it("distinguishes expired credentials from credentials without an expiration date", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 6, 30, 12).getTime())

    const expiredAt = new Date(2026, 6, 29).getTime()

    const { rerender } = renderListItem(buildProfile({ expiresAt: expiredAt }))

    expect(
      screen.getByText(
        testI18n.t("apiCredentialProfiles:list.expirationStatus.expired", {
          date: new Date(expiredAt).toLocaleDateString(),
        }),
      ),
    ).toBeInTheDocument()

    rerender(
      <ApiCredentialProfileListItem
        profile={buildProfile({ expiresAt: undefined })}
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
    )

    expect(
      screen.getByText("apiCredentialProfiles:list.expirationStatus.none"),
    ).toBeInTheDocument()
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
      screen.getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.telemetryBalance),
    ).toHaveTextContent("apiCredentialProfiles:telemetry.notProvided")
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
      screen.getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.telemetryBalance),
    ).toHaveTextContent("apiCredentialProfiles:telemetry.notProvided")
    expect(
      screen.getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.telemetryTodayUsage),
    ).toHaveTextContent("apiCredentialProfiles:telemetry.notProvided")
    expect(
      screen.getByTestId(
        API_CREDENTIAL_PROFILES_TEST_IDS.telemetryTodayRequests,
      ),
    ).toHaveTextContent("apiCredentialProfiles:telemetry.notProvided")
    expect(
      screen.getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.telemetryModels),
    ).toHaveTextContent(
      testI18n.t("apiCredentialProfiles:telemetry.modelCount", { count: 2 }),
    )
  })

  it("renders dash fallbacks when telemetry has never been refreshed", () => {
    renderListItem(buildProfile({ telemetrySnapshot: undefined }))

    expect(
      screen.getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.telemetryBalance),
    ).toHaveTextContent("-")
    expect(
      screen.getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.telemetryTodayUsage),
    ).toHaveTextContent("-")
    expect(
      screen.getByTestId(
        API_CREDENTIAL_PROFILES_TEST_IDS.telemetryTodayRequests,
      ),
    ).toHaveTextContent("-")
    expect(
      screen.getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.telemetryModels),
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
      screen.getByLabelText(
        "apiCredentialProfiles:telemetry.health: account:healthStatus.warning: quota is low",
      ),
    ).toHaveAttribute("role", "img")
  })

  it("wires the telemetry refresh button and reflects the refreshing state", () => {
    const onRefreshTelemetry = vi.fn()

    const { rerender } = renderListItem(buildProfile(), { onRefreshTelemetry })

    fireEvent.click(
      screen.getByRole("button", {
        name: "apiCredentialProfiles:telemetry.actions.refresh",
      }),
    )

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
      screen.getByRole("button", {
        name: "apiCredentialProfiles:telemetry.refreshing",
      }),
    ).toBeDisabled()
    expect(
      screen.getByRole("button", {
        name: "apiCredentialProfiles:telemetry.refreshing",
      }),
    ).toHaveAttribute("aria-busy", "true")
    expect(
      screen.getByText("apiCredentialProfiles:telemetry.refreshing"),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", {
        name: "apiCredentialProfiles:actions.verifyApi",
      }),
    ).toBeEnabled()
    expect(
      screen.getByRole("button", {
        name: "apiCredentialProfiles:actions.verifyApi",
      }),
    ).not.toHaveAttribute("aria-busy")

    fireEvent.click(
      screen.getByRole("button", {
        name: "apiCredentialProfiles:telemetry.refreshing",
      }),
    )
    expect(onRefreshTelemetry).toHaveBeenCalledTimes(1)

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
        isTelemetryRefreshing={false}
        managedSiteType="new-api"
        managedSiteLabel="New API"
      />,
    )

    expect(
      screen.getByRole("button", {
        name: "apiCredentialProfiles:telemetry.actions.refresh",
      }),
    ).toBeEnabled()
    expect(
      screen.getByRole("button", {
        name: "apiCredentialProfiles:telemetry.actions.refresh",
      }),
    ).not.toHaveAttribute("aria-busy")
  })
})
