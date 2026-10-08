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

import {
  API_CREDENTIAL_PROFILE_ASSOCIATION_AVAILABILITY,
  type ApiCredentialProfileAssociatedKeyState,
  type ApiCredentialProfileExportAction,
} from "~/features/ApiCredentialProfiles/contracts"
import { ApiCredentialProfileListItem } from "~/features/ApiCredentialProfiles/list/ApiCredentialProfileListItem"
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

vi.mock("~/components/icons/CliProxyApiIcon", () => ({
  CliProxyApiIcon: () => <span data-testid="cli-proxy-icon" />,
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
    Badge: ({
      children,
      variant: _variant,
      size: _size,
      asChild,
      ...props
    }: any) => (asChild ? children : <span {...props}>{children}</span>),
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

const USD_MONEY_UNIT = {
  kind: "money",
  currency: "USD",
  decimalPlaces: 2,
} as const
const PERCENT_UNIT = { kind: "percent" } as const

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
      facts: {
        usage: {
          totalUsed: {
            value: 1.88131,
            unit: {
              kind: "quota",
              code: "usd-equivalent",
              label: "USD-equivalent budget",
            },
          },
          unlimited: true,
        },
      },
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
    guidedImportEntryRequest?: number
    associatedKeyState?: ApiCredentialProfileAssociatedKeyState
    onOpenAssociatedKey?: (associationId: string) => void
    onConfirmAssociatedKey?: (associationId: string) => void
    onUnlinkAssociatedKey?: (associationId: string) => void
  } = {},
) {
  const onRefreshTelemetry = overrides.onRefreshTelemetry ?? vi.fn()
  const buildElement = (requests: {
    focusRequest?: number
    guidedImportEntryRequest?: number
  }) => (
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
      focusRequest={requests.focusRequest}
      guidedImportEntryRequest={requests.guidedImportEntryRequest}
      associatedKeyState={overrides.associatedKeyState}
      associationAvailability={
        API_CREDENTIAL_PROFILE_ASSOCIATION_AVAILABILITY.Known
      }
      onOpenAssociatedKey={overrides.onOpenAssociatedKey}
      onConfirmAssociatedKey={overrides.onConfirmAssociatedKey}
      onUnlinkAssociatedKey={overrides.onUnlinkAssociatedKey}
    />
  )

  const result = render(
    buildElement({
      focusRequest: overrides.focusRequest,
      guidedImportEntryRequest: overrides.guidedImportEntryRequest,
    }),
    {
      withReleaseUpdateStatusProvider: false,
      withThemeProvider: false,
      withUserPreferencesProvider: false,
    },
  )

  return Object.assign(result, {
    rerenderWith: (requests: {
      focusRequest?: number
      guidedImportEntryRequest?: number
    }) => result.rerender(buildElement(requests)),
  })
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

  it("shows non-empty notes with their text intact and omits whitespace-only notes", () => {
    const notes = "First line\nSecond line"
    const { unmount } = renderListItem(buildProfile({ notes: `  ${notes}  ` }))

    expect(
      screen.getByText("apiCredentialProfiles:dialog.fields.notes"),
    ).toBeInTheDocument()
    expect(screen.getByText("First line Second line").textContent).toBe(notes)

    unmount()
    renderListItem(buildProfile({ notes: "  \n  " }))
    expect(
      screen.queryByText("apiCredentialProfiles:dialog.fields.notes"),
    ).not.toBeInTheDocument()
  })

  it("shows the source page as a labeled clickable badge and omits empty ones", () => {
    const { unmount } = renderListItem(
      buildProfile({ sourceUrl: "  https://forum.example.com/t/9?p=2  " }),
    )

    const link = screen.getByTestId(
      API_CREDENTIAL_PROFILES_TEST_IDS.sourceUrlLink,
    )
    expect(link).toHaveAttribute("href", "https://forum.example.com/t/9?p=2")
    expect(link).toHaveAttribute("target", "_blank")
    expect(link).toHaveAttribute("title", "https://forum.example.com/t/9?p=2")
    expect(link).toHaveTextContent("apiCredentialProfiles:list.sourceUrl")
    expect(link).toHaveAccessibleName("apiCredentialProfiles:list.sourceUrl")

    unmount()
    renderListItem(buildProfile({ sourceUrl: "   " }))
    expect(
      screen.queryByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.sourceUrlLink),
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

  it("drops the card highlight once the focus request is withdrawn", () => {
    const profile = buildProfile()
    const { rerenderWith } = renderListItem(profile, { focusRequest: 1 })
    const rowTestId = getApiCredentialProfileRowTestId(profile.id)

    expect(screen.getByTestId(rowTestId).className).toContain("ring-theme-500")

    rerenderWith({})

    expect(screen.getByTestId(rowTestId).className).not.toContain(
      "ring-theme-500",
    )
  })

  it("drops the import highlight once the guided import request is withdrawn", () => {
    const profile = buildProfile()
    const { rerenderWith } = renderListItem(profile, {
      guidedImportEntryRequest: 1,
    })
    const importButton = screen.getByRole("button", {
      name: "keyManagement:actions.importToManagedSite",
    })

    expect(importButton).toHaveAttribute("data-guidance-highlight", "true")

    rerenderWith({})

    expect(importButton).not.toHaveAttribute("data-guidance-highlight")
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
      profileAction(PRODUCT_ANALYTICS_ACTION_IDS.CopyApiCredentialProfileKey),
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
          facts: {
            usage: {
              todayRequests: {
                value: 42,
                unit: { kind: "count", code: "requests" },
              },
            },
          },
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
          facts: {
            balances: [
              {
                amount: 12.34,
                unit: { kind: "money", currency: "CNY", decimalPlaces: 2 },
                semantics: "cash",
                grantedAmount: 2,
                toppedUpAmount: 10.34,
                isAvailable: true,
              },
            ],
          },
        },
      }),
    )

    expect(
      screen.getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.telemetryBalance),
    ).toHaveTextContent(/12\.34/)
  })

  it("shows provider quota windows as meters in provider order", () => {
    renderListItem(
      buildProfile({
        telemetrySnapshot: {
          attempts: [],
          health: { status: SiteHealthStatus.Healthy },
          lastSyncTime: 1,
          lastSuccessTime: 1,
          source: "kimiQuota",
          facts: {
            quota: {
              membershipLevel: "LEVEL_PRO",
              windows: [
                {
                  type: "fiveHour",
                  used: 25,
                  limit: 100,
                  remaining: 75,
                  remainingPercent: 75,
                  unit: {
                    kind: "quota",
                    code: "provider-quota",
                    label: "Provider quota",
                  },
                },
                {
                  type: "weekly",
                  used: 200,
                  limit: 1000,
                  remaining: 800,
                  remainingPercent: 80,
                  unit: {
                    kind: "quota",
                    code: "provider-quota",
                    label: "Provider quota",
                  },
                },
              ],
            },
          },
        },
      }),
    )

    const quota = screen.getByTestId(
      API_CREDENTIAL_PROFILES_TEST_IDS.telemetryQuota,
    )
    expect(
      within(quota)
        .getAllByRole("progressbar")
        .map((bar) => bar.getAttribute("aria-valuenow")),
    ).toEqual(["75", "80"])
    expect(quota).toHaveTextContent(
      /quotaWindows\.fiveHour.*quotaWindows\.weekly/,
    )
  })

  it("colors a nearly drained quota window as critical", () => {
    renderListItem(
      buildProfile({
        telemetrySnapshot: {
          attempts: [],
          health: { status: SiteHealthStatus.Healthy },
          lastSyncTime: 1,
          facts: {
            quota: {
              windows: [
                {
                  type: "weekly",
                  remainingPercent: 15,
                  resetTime: Date.now() + 60 * 60_000,
                  unit: { kind: "percent" },
                },
              ],
            },
          },
        },
      }),
    )

    const quota = screen.getByTestId(
      API_CREDENTIAL_PROFILES_TEST_IDS.telemetryQuota,
    )
    expect(quota.querySelector('[data-slot="progress-indicator"]')).toHaveClass(
      "bg-destructive-indicator",
    )
  })

  it("shows a reset countdown and keeps the absolute time as a tooltip", () => {
    const resetTime = Date.now() + 2 * 3_600_000 + 30 * 60_000
    renderListItem(
      buildProfile({
        telemetrySnapshot: {
          attempts: [],
          health: { status: SiteHealthStatus.Healthy },
          lastSyncTime: 1,
          source: "openCodeGoUsage",
          facts: {
            quota: {
              windows: [
                {
                  type: "fiveHour",
                  remainingPercent: 75,
                  resetTime,
                  unit: { kind: "percent" },
                },
              ],
            },
          },
        },
      }),
    )

    const quota = screen.getByTestId(
      API_CREDENTIAL_PROFILES_TEST_IDS.telemetryQuota,
    )
    expect(quota).toHaveTextContent(
      "apiCredentialProfiles:telemetry.quotaWindows.countdown.hoursMinutes",
    )
    expect(quota.querySelector("[title]")).toHaveAttribute(
      "title",
      expect.stringContaining(String(new Date(resetTime).getFullYear())),
    )
  })

  it("surfaces the most urgent allowance on the collapsed header", () => {
    renderListItem(
      buildProfile({
        telemetrySnapshot: {
          attempts: [],
          health: { status: SiteHealthStatus.Healthy },
          lastSyncTime: 1,
          facts: {
            quota: {
              windows: [
                { type: "fiveHour", remainingPercent: 90, unit: PERCENT_UNIT },
                { type: "weekly", remainingPercent: 15, unit: PERCENT_UNIT },
              ],
            },
          },
        },
      }),
    )

    const badge = screen.getByTestId(
      API_CREDENTIAL_PROFILES_TEST_IDS.allowanceBadge,
    )
    expect(badge).toHaveTextContent(
      "apiCredentialProfiles:telemetry.allowance.quotaRemaining",
    )
    expect(badge.querySelector('span[aria-hidden="true"]')).toHaveClass(
      "bg-destructive-indicator",
    )
    expect(badge).toHaveAttribute(
      "aria-label",
      expect.stringContaining(
        "apiCredentialProfiles:telemetry.allowance.title",
      ),
    )
  })

  it("keeps the allowance badge quiet without monitored facts", () => {
    renderListItem(
      buildProfile({
        telemetrySnapshot: {
          attempts: [],
          health: { status: SiteHealthStatus.Healthy },
          lastSyncTime: 1,
          facts: { models: { count: 2, preview: [] } },
        },
      }),
    )

    expect(
      screen.queryByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.allowanceBadge),
    ).toBeNull()
  })

  it("estimates how long a balance lasts at today's spend", () => {
    renderListItem(
      buildProfile({
        telemetrySnapshot: {
          attempts: [],
          health: { status: SiteHealthStatus.Healthy },
          lastSyncTime: 1,
          facts: {
            balances: [{ amount: 30, unit: USD_MONEY_UNIT, semantics: "cash" }],
            usage: { todayCost: { value: 3, unit: USD_MONEY_UNIT } },
          },
        },
      }),
    )

    expect(
      screen.getByTestId(
        API_CREDENTIAL_PROFILES_TEST_IDS.telemetryBalanceRunway,
      ),
    ).toHaveTextContent("apiCredentialProfiles:telemetry.allowance.runwayHint")
  })

  it("omits the balance runway when today's spend is unknown", () => {
    renderListItem(
      buildProfile({
        telemetrySnapshot: {
          attempts: [],
          health: { status: SiteHealthStatus.Healthy },
          lastSyncTime: 1,
          facts: {
            balances: [{ amount: 30, unit: USD_MONEY_UNIT, semantics: "cash" }],
          },
        },
      }),
    )

    expect(
      screen.getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.telemetryBalance),
    ).toHaveTextContent(/30\.00/)
    expect(
      screen.queryByTestId(
        API_CREDENTIAL_PROFILES_TEST_IDS.telemetryBalanceRunway,
      ),
    ).toBeNull()
  })

  it("keeps a quota with an unavailable percentage neutral instead of claiming remaining allowance", () => {
    renderListItem(
      buildProfile({
        telemetrySnapshot: {
          attempts: [],
          health: { status: SiteHealthStatus.Healthy },
          lastSyncTime: 1,
          facts: {
            quota: {
              windows: [
                {
                  type: "monthly",
                  unit: { kind: "percent" },
                  remainingPercent: NaN,
                },
              ],
            },
          },
        },
      }),
    )
    const quota = screen.getByTestId(
      API_CREDENTIAL_PROFILES_TEST_IDS.telemetryQuota,
    )
    expect(quota).toHaveTextContent(
      "apiCredentialProfiles:telemetry.notProvided",
    )
    expect(quota.querySelector('[data-slot="progress-indicator"]')).toHaveClass(
      "bg-neutral-indicator",
    )
    expect(
      screen.getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.allowanceBadge),
    ).not.toHaveTextContent(
      "apiCredentialProfiles:telemetry.allowance.quotaRemaining",
    )
  })

  it.each([0, -3])(
    "omits runway hints for an exhausted balance of %s",
    (amount) => {
      renderListItem(
        buildProfile({
          telemetrySnapshot: {
            attempts: [],
            health: { status: SiteHealthStatus.Healthy },
            lastSyncTime: 1,
            facts: {
              balances: [{ amount, unit: USD_MONEY_UNIT, semantics: "cash" }],
              usage: { todayCost: { value: 3, unit: USD_MONEY_UNIT } },
            },
          },
        }),
      )
      expect(
        screen.queryByTestId(
          API_CREDENTIAL_PROFILES_TEST_IDS.telemetryBalanceRunway,
        ),
      ).toBeNull()
      const badge = screen.getByTestId(
        API_CREDENTIAL_PROFILES_TEST_IDS.allowanceBadge,
      )
      expect(badge).not.toHaveTextContent(
        "apiCredentialProfiles:telemetry.allowance.balanceRunway",
      )
      expect(badge.querySelector('span[aria-hidden="true"]')).toHaveClass(
        "bg-destructive-indicator",
      )
    },
  )

  it("keeps explicit zero telemetry expanded", () => {
    renderListItem(
      buildProfile({
        telemetrySnapshot: {
          attempts: [],
          health: { status: SiteHealthStatus.Healthy },
          lastSyncTime: 1,
          facts: {
            usage: {
              todayRequests: {
                value: 0,
                unit: { kind: "count", code: "requests" },
              },
            },
          },
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

  it("shows a provider total token count when split counters are unavailable", () => {
    renderListItem(
      buildProfile({
        telemetrySnapshot: {
          attempts: [],
          health: { status: SiteHealthStatus.Healthy },
          lastSyncTime: 1,
          facts: {
            usage: {
              todayTokens: {
                total: 12_000,
                unit: { kind: "count", code: "tokens" },
              },
            },
          },
        },
      }),
    )

    expect(
      screen.getByText(/apiCredentialProfiles:telemetry\.todayTokens/),
    ).toBeInTheDocument()
    expect(
      screen.getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.telemetryPanel),
    ).toHaveTextContent("12.0K")
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
          facts: {
            models: { count: 2, preview: ["gpt-4o", "o3"] },
          },
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
            facts: {
              balances: [
                {
                  amount: 7.5,
                  unit: {
                    kind: "quota",
                    code: "usd-equivalent",
                    label: "USD-equivalent budget",
                  },
                  semantics: "budget-equivalent",
                },
              ],
            },
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

  it("localizes the known insufficient-balance health reason", () => {
    renderListItem(
      buildProfile({
        telemetrySnapshot: {
          attempts: [],
          health: {
            reason: "insufficient-balance",
            status: SiteHealthStatus.Warning,
          },
          lastSyncTime: 1,
        },
      }),
    )

    expect(
      screen.getByRole("img", {
        name: /apiCredentialProfiles:telemetry\.health: account:healthStatus.warning:/,
      }),
    ).toHaveAttribute(
      "aria-label",
      expect.stringContaining(
        testI18n.t(
          "apiCredentialProfiles:telemetry.healthReasons.insufficientBalance",
        ),
      ),
    )
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
