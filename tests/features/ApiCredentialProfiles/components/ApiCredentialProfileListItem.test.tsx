import userEvent from "@testing-library/user-event"
import { forwardRef } from "react"
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
import {
  API_CREDENTIAL_PROFILE_ASSOCIATION_AVAILABILITY,
  type ApiCredentialProfileAssociatedKeyState,
  type ApiCredentialProfileExportAction,
} from "~/features/ApiCredentialProfiles/contracts"
import {
  API_CREDENTIAL_PROFILES_TEST_IDS,
  getApiCredentialProfileRowTargetId,
  getApiCredentialProfileRowTestId,
} from "~/features/ApiCredentialProfiles/testIds"
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
import { fireEvent, render, screen, within } from "~~/tests/test-utils/render"

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
    Badge: ({ children, variant: _variant, size: _size, ...props }: any) => (
      <span {...props}>{children}</span>
    ),
    Card: forwardRef<HTMLDivElement, any>(({ children, ...props }, ref) => (
      <div ref={ref} {...props}>
        {children}
      </div>
    )),
    CardContent: ({ children }: any) => <div>{children}</div>,
    Heading6: ({ children, ...props }: any) => <h6 {...props}>{children}</h6>,
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
  DropdownMenuGroup: ({ children }: any) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onSelect, ...props }: any) => (
    <button type="button" onClick={(event) => onSelect?.(event)} {...props}>
      {children}
    </button>
  ),
  DropdownMenuLabel: ({ children }: any) => <div>{children}</div>,
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
    visibleKeys?: Set<string>
    toggleKeyVisibility?: (profileId: string) => void
    onCopyBundle?: (profile: ApiCredentialProfile) => void
    onVerify?: (profile: ApiCredentialProfile) => void
    onExport?: (
      profile: ApiCredentialProfile,
      action: ApiCredentialProfileExportAction,
    ) => void
    focusRequest?: number
    associatedKeyState?: ApiCredentialProfileAssociatedKeyState
    onOpenAssociatedKey?: (associationId: string) => void
    onConfirmAssociatedKey?: (associationId: string) => void
    onUnlinkAssociatedKey?: (associationId: string) => void
  } = {},
) {
  const onRefreshTelemetry = overrides.onRefreshTelemetry ?? vi.fn()
  return render(
    <ApiCredentialProfileListItem
      profile={profile}
      verificationSummary={null}
      tagNames={[]}
      visibleKeys={overrides.visibleKeys ?? new Set()}
      toggleKeyVisibility={overrides.toggleKeyVisibility ?? vi.fn()}
      onCopyApiKey={vi.fn()}
      onCopyBundle={overrides.onCopyBundle ?? vi.fn()}
      onOpenModelManagement={vi.fn()}
      onVerify={overrides.onVerify ?? vi.fn()}
      onVerifyCliSupport={vi.fn()}
      onRefreshTelemetry={onRefreshTelemetry}
      onEdit={vi.fn()}
      onDelete={vi.fn()}
      onExport={overrides.onExport ?? vi.fn()}
      isTelemetryRefreshing={overrides.isTelemetryRefreshing ?? false}
      managedSiteType="new-api"
      managedSiteLabel="New API"
      focusRequest={overrides.focusRequest}
      associatedKeyState={overrides.associatedKeyState}
      associationAvailability={
        API_CREDENTIAL_PROFILE_ASSOCIATION_AVAILABILITY.Known
      }
      onOpenAssociatedKey={overrides.onOpenAssociatedKey}
      onConfirmAssociatedKey={overrides.onConfirmAssociatedKey}
      onUnlinkAssociatedKey={overrides.onUnlinkAssociatedKey}
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

  it("leaves the shared Base URL to the endpoint group header", () => {
    const profile = buildProfile()

    renderListItem(profile)

    expect(screen.queryByText(profile.baseUrl)).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", {
        name: "apiCredentialProfiles:actions.copyBaseUrl",
      }),
    ).not.toBeInTheDocument()
  })

  it("focuses and scrolls the exact profile card for a deep-link request", () => {
    const focusSpy = vi.spyOn(HTMLElement.prototype, "focus")
    const scrollIntoViewSpy = vi
      .spyOn(HTMLElement.prototype, "scrollIntoView")
      .mockImplementation(() => {})
    const profile = buildProfile({ id: "profile / 1" })

    renderListItem(profile, { focusRequest: 1 })

    const row = screen.getByTestId(getApiCredentialProfileRowTestId(profile.id))
    expect(row).toHaveAttribute(
      "id",
      getApiCredentialProfileRowTargetId(profile.id),
    )
    expect(row).toHaveAttribute("tabindex", "-1")
    expect(row).toHaveFocus()
    expect(scrollIntoViewSpy).toHaveBeenCalledWith({
      block: "center",
      inline: "nearest",
    })
    expect(focusSpy).toHaveBeenCalledWith({ preventScroll: true })
  })

  it("opens the single active Account Runtime Key association", async () => {
    const user = userEvent.setup()
    const onOpenAssociatedKey = vi.fn()

    renderListItem(buildProfile(), {
      associatedKeyState: {
        status: "linked",
        items: [
          {
            associationId: "association-1",
            locator: {
              source: "account_token",
              accountId: "account-example",
              siteType: "new-api",
              tokenId: 1,
            },
            state: "active",
          },
        ],
      },
      onOpenAssociatedKey,
    })

    const viewKeyButton = screen.getByRole("button", {
      name: "apiCredentialProfiles:association.linked",
    })
    await user.click(viewKeyButton)
    await user.click(
      screen.getByRole("button", {
        name: "apiCredentialProfiles:association.viewKey",
      }),
    )
    expect(onOpenAssociatedKey).toHaveBeenCalledWith("association-1")
  })

  it("keeps an older unlinked credential visually quiet", () => {
    renderListItem(buildProfile())

    expect(
      screen.queryByText("apiCredentialProfiles:association.notLinked"),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText("apiCredentialProfiles:association.sectionTitle"),
    ).not.toBeInTheDocument()
  })

  it("shows a full API key only when its visibility is enabled", () => {
    const profile = buildProfile()
    const toggleKeyVisibility = vi.fn()
    renderListItem(profile, {
      visibleKeys: new Set([profile.id]),
      toggleKeyVisibility,
    })

    expect(screen.getByText("sk-newapi")).toBeVisible()
    const hideButton = screen.getByRole("button", {
      name: "keyManagement:actions.hideKey",
    })
    fireEvent.click(hideButton)
    expect(toggleKeyVisibility).toHaveBeenCalledWith(profile.id)
  })

  it("declares controlled analytics metadata for profile row actions", () => {
    renderListItem(buildProfile())

    const profileAction = (actionId: string) =>
      `${PRODUCT_ANALYTICS_FEATURE_IDS.ApiCredentialProfiles}:${actionId}:${PRODUCT_ANALYTICS_SURFACE_IDS.OptionsApiCredentialProfilesRowActions}:${PRODUCT_ANALYTICS_ENTRYPOINTS.Options}`

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

  it("organizes profile actions into quick, integration, diagnostics, and management groups", () => {
    renderListItem(buildProfile())

    const toolbar = screen.getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.toolbar)
    const quickActionsGroup = within(toolbar).getByTestId(
      API_CREDENTIAL_PROFILES_TEST_IDS.toolbarQuickActionsGroup,
    )
    const integrationsGroup = within(toolbar).getByTestId(
      API_CREDENTIAL_PROFILES_TEST_IDS.toolbarIntegrationsGroup,
    )
    const diagnosticsGroup = within(toolbar).getByTestId(
      API_CREDENTIAL_PROFILES_TEST_IDS.toolbarDiagnosticsGroup,
    )
    const managementGroup = within(toolbar).getByTestId(
      API_CREDENTIAL_PROFILES_TEST_IDS.toolbarManagementGroup,
    )

    expect(toolbar).toHaveRole("toolbar")
    expect(toolbar).toHaveAccessibleName("keyManagement:actionToolbar.label")
    expect(quickActionsGroup).toHaveRole("group")
    expect(quickActionsGroup).toHaveAccessibleName(
      "keyManagement:actionToolbar.quickActions",
    )
    expect(integrationsGroup).toHaveRole("group")
    expect(integrationsGroup).toHaveAccessibleName(
      "keyManagement:actionToolbar.integrationsAndExport",
    )
    expect(diagnosticsGroup).toHaveRole("group")
    expect(diagnosticsGroup).toHaveAccessibleName(
      "keyManagement:actionToolbar.diagnostics",
    )
    expect(managementGroup).toHaveRole("group")
    expect(managementGroup).toHaveAccessibleName(
      "keyManagement:actionToolbar.management",
    )

    expect(
      within(quickActionsGroup).getByRole("button", {
        name: "apiCredentialProfiles:actions.copyBundle",
      }),
    ).toBeVisible()
    expect(
      within(integrationsGroup).getByRole("button", {
        name: "keyManagement:actions.importToManagedSite",
      }),
    ).toBeVisible()
    expect(
      within(integrationsGroup).getByRole("button", {
        name: "common:actions.export",
      }),
    ).toBeVisible()
    expect(
      within(diagnosticsGroup).getByRole("button", {
        name: "apiCredentialProfiles:actions.verifyApi",
      }),
    ).toBeVisible()
    expect(
      within(diagnosticsGroup).getByTestId(
        API_CREDENTIAL_PROFILES_TEST_IDS.verifyCliSupportButton,
      ),
    ).toHaveAccessibleName("apiCredentialProfiles:actions.verifyCliSupport")
    expect(
      within(managementGroup).getByRole("button", {
        name: "common:actions.edit",
      }),
    ).toBeVisible()
    expect(
      within(managementGroup).getByRole("button", {
        name: "common:actions.delete",
      }),
    ).toBeVisible()
  })

  it("offers Kelivo import-code copying from the export menu", async () => {
    const profile = buildProfile()
    const onExport = vi.fn()
    const user = userEvent.setup()
    renderListItem(profile, { onExport })

    await user.click(
      screen.getByRole("button", {
        name: "keyManagement:actions.copyKelivoImportCode",
      }),
    )

    expect(onExport).toHaveBeenCalledWith(profile, "kelivo")
  })

  it("offers Cursor++ export from the external-tools menu", async () => {
    const profile = buildProfile()
    const onExport = vi.fn()
    const user = userEvent.setup()
    renderListItem(profile, { onExport })

    await user.click(
      screen.getByRole("button", {
        name: "keyManagement:actions.exportToCursorPlus",
      }),
    )

    expect(onExport).toHaveBeenCalledWith(profile, "cursorPlus")
  })

  it("routes bundle, provider export, gateway export, and verification actions", async () => {
    const user = userEvent.setup()
    const profile = buildProfile()
    const onCopyBundle = vi.fn()
    const onExport = vi.fn()
    const onVerify = vi.fn()
    renderListItem(profile, { onCopyBundle, onExport, onVerify })

    await user.click(
      screen.getByRole("button", {
        name: "apiCredentialProfiles:actions.copyBundle",
      }),
    )
    await user.click(
      screen.getByRole("button", {
        name: "keyManagement:actions.useInCherry",
      }),
    )
    await user.click(
      screen.getByRole("button", {
        name: "keyManagement:actions.importToCliProxy",
      }),
    )
    await user.click(
      screen.getByRole("button", {
        name: "keyManagement:actions.importToClaudeCodeRouter",
      }),
    )
    await user.click(
      screen.getByRole("button", {
        name: "apiCredentialProfiles:actions.verifyApi",
      }),
    )

    expect(onCopyBundle).toHaveBeenCalledWith(profile)
    expect(onExport).toHaveBeenCalledWith(profile, "cherryStudio")
    expect(onExport).toHaveBeenCalledWith(profile, "cliProxy")
    expect(onExport).toHaveBeenCalledWith(profile, "claudeCodeRouter")
    expect(onVerify).toHaveBeenCalledWith(profile)
  })

  it("keeps managed-site import as a direct prioritized action", async () => {
    const profile = buildProfile()
    const onExport = vi.fn()
    const user = userEvent.setup()
    renderListItem(profile, { onExport })

    await user.click(
      screen.getByRole("button", {
        name: "keyManagement:actions.importToManagedSite",
      }),
    )

    expect(onExport).toHaveBeenCalledWith(profile, "managedSite")
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

  it("shows expiration as a status badge and presents compact audit timestamps with full details", () => {
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
    const createdAtFull = new Date(createdAt).toLocaleString()
    const updatedAtFull = new Date(updatedAt).toLocaleString()
    const createdAtBadge = screen.getByTitle(createdAtFull)
    const updatedAtBadge = screen.getByTitle(updatedAtFull)
    const verificationSummary = screen.getByTestId("verification-summary")
    const toolbar = screen.getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.toolbar)

    expect(
      screen.getByLabelText(
        `apiCredentialProfiles:list.createdAt: ${createdAtFull}`,
      ),
    ).toBe(createdAtBadge)
    expect(
      screen.getByLabelText(
        `apiCredentialProfiles:list.updatedAt: ${updatedAtFull}`,
      ),
    ).toBe(updatedAtBadge)
    expect(createdAtBadge.parentElement).not.toBe(
      verificationSummary.parentElement,
    )
    expect(createdAtBadge.parentElement?.parentElement).toBe(
      toolbar.parentElement,
    )
    expect(updatedAtBadge.parentElement?.parentElement).toBe(
      toolbar.parentElement,
    )

    expect(createdAtBadge).toHaveTextContent(
      new Date(createdAt).toLocaleString(undefined, {
        year: "numeric",
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
    )
    expect(updatedAtBadge).toHaveTextContent(
      new Date(updatedAt).toLocaleString(undefined, {
        year: "numeric",
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
    )
    expect(createdAtBadge).not.toHaveTextContent(createdAtFull)
    expect(updatedAtBadge).not.toHaveTextContent(updatedAtFull)
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
        associationAvailability={
          API_CREDENTIAL_PROFILE_ASSOCIATION_AVAILABILITY.Known
        }
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

  it("shows provider-native currency balances without converting them to USD", () => {
    renderListItem(
      buildProfile({
        telemetrySnapshot: {
          attempts: [],
          health: { status: SiteHealthStatus.Healthy },
          lastSyncTime: 1,
          lastSuccessTime: 1,
          source: "deepSeekBalance",
          balance: {
            amount: 12.34,
            currency: "CNY",
            grantedAmount: 2,
            toppedUpAmount: 10.34,
            isAvailable: true,
          },
        },
      }),
    )

    expect(
      screen.getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.telemetryBalance),
    ).toHaveTextContent(/12\.34/)
  })

  it("keeps explicit zero telemetry expanded", () => {
    renderListItem(
      buildProfile({
        telemetrySnapshot: {
          attempts: [],
          health: { status: SiteHealthStatus.Healthy },
          lastSyncTime: 1,
          todayRequests: 0,
        },
      }),
    )

    expect(
      screen.getByRole("button", {
        name: "apiCredentialProfiles:telemetry.title",
      }),
    ).toHaveAttribute("aria-expanded", "true")
    expect(
      screen.getByTestId(
        API_CREDENTIAL_PROFILES_TEST_IDS.telemetryTodayRequests,
      ),
    ).toHaveTextContent("0")
  })

  it("keeps a telemetry error visible when no metrics were collected", () => {
    renderListItem(
      buildProfile({
        telemetrySnapshot: {
          attempts: [],
          health: { status: SiteHealthStatus.Error },
          lastSyncTime: 1,
          lastError: "Usage endpoint unavailable",
        },
      }),
    )

    expect(
      screen.getByRole("button", {
        name: "apiCredentialProfiles:telemetry.title",
      }),
    ).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByText("Usage endpoint unavailable")).toBeVisible()
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

  it("collapses missing telemetry by default and lets the user reveal fallbacks", async () => {
    const user = userEvent.setup()
    renderListItem(buildProfile({ telemetrySnapshot: undefined }))

    const telemetryToggle = screen.getByRole("button", {
      name: "apiCredentialProfiles:telemetry.title",
    })
    expect(telemetryToggle).toHaveAttribute("aria-expanded", "false")
    expect(
      screen.getByRole("button", {
        name: "apiCredentialProfiles:telemetry.actions.refresh",
      }),
    ).toBeVisible()
    expect(
      screen.queryByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.telemetryBalance),
    ).not.toBeInTheDocument()

    await user.click(telemetryToggle)

    expect(telemetryToggle).toHaveAttribute("aria-expanded", "true")
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

  it("opens telemetry when a refresh adds the first detail value", () => {
    const { rerender } = renderListItem(
      buildProfile({ telemetrySnapshot: undefined }),
    )

    expect(
      screen.getByRole("button", {
        name: "apiCredentialProfiles:telemetry.title",
      }),
    ).toHaveAttribute("aria-expanded", "false")

    rerender(
      <ApiCredentialProfileListItem
        profile={buildProfile({
          telemetrySnapshot: {
            attempts: [],
            health: { status: SiteHealthStatus.Healthy },
            lastSyncTime: 2,
            balanceUsd: 7.5,
          },
        })}
        verificationSummary={null}
        tagNames={[]}
        visibleKeys={new Set()}
        toggleKeyVisibility={vi.fn()}
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
        associationAvailability={
          API_CREDENTIAL_PROFILE_ASSOCIATION_AVAILABILITY.Known
        }
      />,
    )

    expect(
      screen.getByRole("button", {
        name: "apiCredentialProfiles:telemetry.title",
      }),
    ).toHaveAttribute("aria-expanded", "true")
    expect(
      screen.getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.telemetryBalance),
    ).toBeVisible()
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
        associationAvailability={
          API_CREDENTIAL_PROFILE_ASSOCIATION_AVAILABILITY.Known
        }
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
        associationAvailability={
          API_CREDENTIAL_PROFILE_ASSOCIATION_AVAILABILITY.Known
        }
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
