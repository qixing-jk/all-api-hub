import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { SETTINGS_ANCHORS } from "~/constants/settingsAnchors"
import { WEBDAV_AUTO_SYNC_TARGET_IDS } from "~/features/ImportExport/searchTargets"
import OptionsOverview, {
  getPermissionsOnboardingReasonFromUrl,
} from "~/features/OptionsOverview/OptionsOverview"
import { OPTIONS_OVERVIEW_TEST_IDS } from "~/features/OptionsOverview/testIds"
import type { OptionsOverviewViewModel } from "~/features/OptionsOverview/types"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_EVENTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
  PRODUCT_ANALYTICS_TARGET_KINDS,
  trackProductAnalyticsEvent,
} from "~/services/productAnalytics/events"
import type { ProductAnnouncement } from "~/services/productAnnouncements/types"
import { act, render, screen } from "~~/tests/test-utils/render"

const {
  pushWithinOptionsPageMock,
  setLastSeenOptionalPermissionsMock,
  trackProductAnalyticsEventMock,
  useOptionsOverviewDataMock,
  useProductAnnouncementsMock,
} = vi.hoisted(() => ({
  pushWithinOptionsPageMock: vi.fn(),
  setLastSeenOptionalPermissionsMock: vi.fn(),
  trackProductAnalyticsEventMock: vi.fn(),
  useOptionsOverviewDataMock: vi.fn(),
  useProductAnnouncementsMock: vi.fn(),
}))

vi.mock("~/features/OptionsOverview/useOptionsOverviewData", () => ({
  useOptionsOverviewData: useOptionsOverviewDataMock,
}))

vi.mock(
  "~/features/ProductAnnouncements/hooks/useProductAnnouncements",
  () => ({
    useProductAnnouncements: useProductAnnouncementsMock,
  }),
)

vi.mock("~/services/permissions/optionalPermissionState", () => ({
  setLastSeenOptionalPermissions: setLastSeenOptionalPermissionsMock,
}))

vi.mock("~/services/productAnalytics/events", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/services/productAnalytics/events")>()

  return {
    ...actual,
    trackProductAnalyticsEvent: trackProductAnalyticsEventMock,
  }
})

vi.mock("~/utils/navigation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/utils/navigation")>()

  return {
    ...actual,
    pushWithinOptionsPage: pushWithinOptionsPageMock,
  }
})

vi.mock("~/components/icons/WorkflowTransitionIcon", () => ({
  WorkflowTransitionIcon: ({ className }: { className?: string }) => (
    <svg
      aria-hidden="true"
      className={className}
      data-workflow-transition-icon="true"
    />
  ),
}))

vi.mock(
  "~/features/OptionsOverview/components/dialogs/PermissionOnboardingDialog",
  () => ({
    PermissionOnboardingDialog: ({
      open,
      onClose,
      reason,
    }: {
      open: boolean
      onClose: () => void
      reason: string | null
    }) =>
      open ? (
        <div data-testid="permission-onboarding">
          <span>{reason}</span>
          <button type="button" onClick={onClose}>
            close
          </button>
        </div>
      ) : null,
  }),
)

const setupViewModel: OptionsOverviewViewModel = {
  statusCards: [
    {
      id: "accounts",
      value: "0",
      severity: "warning",
      target: { menuItemId: MENU_ITEM_IDS.ACCOUNT },
    },
  ],
  attentionItems: [
    {
      id: "setup:add-account",
      kind: "addAccount",
      severity: "info",
      target: { menuItemId: MENU_ITEM_IDS.ACCOUNT },
    },
    {
      id: "account:error",
      kind: "accountUnhealthy",
      severity: "error",
      titleOptions: { name: "Broken Relay" },
      descriptionOptions: { reason: "sync failed" },
      target: {
        menuItemId: MENU_ITEM_IDS.ACCOUNT,
        params: { search: "unhealthy-account" },
      },
    },
  ],
  usageSnapshot: {
    todayRequests: 0,
    todayTokens: 0,
    todayCostText: "-",
    sevenDayRequests: 0,
    sevenDayTokens: 0,
    hasUsageData: false,
    target: { menuItemId: MENU_ITEM_IDS.USAGE_ANALYTICS },
  },
  autoCheckinPanel: {
    status: "partial",
    severity: "warning",
    totalEligible: 3,
    executed: 3,
    successCount: 2,
    failedCount: 1,
    skippedCount: 0,
    needsRetry: true,
    lastRunAt: "2026-06-03T01:30:00.000Z",
    nextRunAt: "2026-06-04T01:30:00.000Z",
    nextRetryAt: "2026-06-03T02:00:00.000Z",
    actions: [
      {
        id: "openAutoCheckin",
        target: { menuItemId: MENU_ITEM_IDS.AUTO_CHECKIN },
        isVisible: true,
      },
      {
        id: "retryFailed",
        target: { menuItemId: MENU_ITEM_IDS.AUTO_CHECKIN },
        isVisible: true,
      },
    ],
  },
  automationOverview: {
    items: [
      {
        id: "autoCheckin",
        status: "warning",
        statusLabel: "enabled",
        primaryTarget: { menuItemId: MENU_ITEM_IDS.AUTO_CHECKIN },
        summaryRows: [
          {
            id: "lastRun",
            value: "2026-06-03T01:30:00.000Z",
            valueType: "datetime",
          },
        ],
        actions: [
          {
            id: "openAutoCheckin",
            target: { menuItemId: MENU_ITEM_IDS.AUTO_CHECKIN },
          },
        ],
        defaultExpanded: false,
        autoCheckinPanel: {
          status: "partial",
          severity: "warning",
          totalEligible: 3,
          executed: 3,
          successCount: 2,
          failedCount: 1,
          skippedCount: 0,
          needsRetry: true,
          lastRunAt: "2026-06-03T01:30:00.000Z",
          nextRunAt: "2026-06-04T01:30:00.000Z",
          nextRetryAt: "2026-06-03T02:00:00.000Z",
          actions: [
            {
              id: "openAutoCheckin",
              target: { menuItemId: MENU_ITEM_IDS.AUTO_CHECKIN },
              isVisible: true,
            },
            {
              id: "retryFailed",
              target: { menuItemId: MENU_ITEM_IDS.AUTO_CHECKIN },
              isVisible: true,
            },
          ],
        },
      },
      {
        id: "siteAnnouncements",
        status: "success",
        statusLabel: "enabled",
        primaryTarget: {
          menuItemId: MENU_ITEM_IDS.BASIC,
          params: { anchor: "site-announcement-notifications-enabled" },
        },
        summaryRows: [
          {
            id: "records",
            value: "4",
          },
          {
            id: "unread",
            value: "2",
          },
        ],
        actions: [
          {
            id: "openAnnouncements",
            target: { menuItemId: MENU_ITEM_IDS.SITE_ANNOUNCEMENTS },
          },
          {
            id: "openAnnouncementSettings",
            target: {
              menuItemId: MENU_ITEM_IDS.BASIC,
              params: { anchor: "site-announcement-notifications-enabled" },
            },
          },
        ],
        defaultExpanded: false,
      },
      {
        id: "managedSiteModelSync",
        status: "info",
        statusLabel: "disabled",
        primaryTarget: { menuItemId: MENU_ITEM_IDS.MANAGED_SITE_MODEL_SYNC },
        summaryRows: [
          {
            id: "interval",
            value: "24 h",
          },
        ],
        actions: [
          {
            id: "openManagedSiteModelSync",
            target: { menuItemId: MENU_ITEM_IDS.MANAGED_SITE_MODEL_SYNC },
          },
        ],
        defaultExpanded: false,
      },
      {
        id: "webdavAutoSync",
        status: "info",
        statusLabel: "disabled",
        primaryTarget: {
          menuItemId: MENU_ITEM_IDS.IMPORT_EXPORT,
          params: {
            anchor: WEBDAV_AUTO_SYNC_TARGET_IDS.root,
            highlight: WEBDAV_AUTO_SYNC_TARGET_IDS.root,
          },
        },
        summaryRows: [
          {
            id: "interval",
            value: "60 min",
          },
        ],
        actions: [
          {
            id: "openImportExport",
            target: {
              menuItemId: MENU_ITEM_IDS.IMPORT_EXPORT,
              params: {
                anchor: WEBDAV_AUTO_SYNC_TARGET_IDS.root,
                highlight: WEBDAV_AUTO_SYNC_TARGET_IDS.root,
              },
            },
          },
        ],
        defaultExpanded: false,
      },
    ],
  },
  configurationOverviewItems: [
    {
      id: "accountFoundation",
      status: "needs_setup",
      subItems: [
        {
          id: "accounts",
          status: "needs_setup",
          target: { menuItemId: MENU_ITEM_IDS.ACCOUNT },
        },
        {
          id: "apiProfiles",
          status: "needs_setup",
          target: { menuItemId: MENU_ITEM_IDS.API_CREDENTIAL_PROFILES },
        },
      ],
      isVisible: true,
    },
    {
      id: "automation",
      status: "disabled",
      subItems: [
        {
          id: "autoCheckin",
          status: "disabled",
          target: {
            menuItemId: MENU_ITEM_IDS.BASIC,
            params: {
              anchor: SETTINGS_ANCHORS.AUTO_CHECKIN,
              highlight: SETTINGS_ANCHORS.AUTO_CHECKIN,
            },
          },
        },
      ],
      isVisible: true,
    },
  ],
}

const riskNotice = {
  id: "risk",
  revision: 1,
  severity: "warning",
  priority: 10,
  startsAt: 1,
  expiresAt: 2,
  title: "Risk notice",
  message: "Please review.",
  seen: false,
  dismissed: false,
} satisfies ProductAnnouncement

describe("OptionsOverview", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setLastSeenOptionalPermissionsMock.mockResolvedValue(undefined)
    trackProductAnalyticsEventMock.mockResolvedValue(true)
    useProductAnnouncementsMock.mockReturnValue({
      state: {
        view: {
          notices: [],
          activeNotices: [],
          dismissedNotices: [],
          primaryRiskNotice: null,
          unseenActiveCount: 0,
        },
      },
      isLoading: false,
      reload: vi.fn(),
      markSeen: vi.fn().mockResolvedValue(true),
      dismiss: vi.fn(),
    })
    window.history.replaceState(null, "", "/")
  })

  it("renders loading state while overview data loads", () => {
    useOptionsOverviewDataMock.mockReturnValue({
      isLoading: true,
      error: null,
      viewModel: null,
      reload: vi.fn(),
    })

    renderOverview()

    expect(
      screen.getByTestId(OPTIONS_OVERVIEW_TEST_IDS.page),
    ).toBeInTheDocument()
    expect(
      screen.getByText("optionsOverview:states.loading"),
    ).toBeInTheDocument()
  })

  it("renders configuration overview groups as informational containers", () => {
    useOptionsOverviewDataMock.mockReturnValue({
      isLoading: false,
      error: null,
      viewModel: setupViewModel,
      reload: vi.fn(),
    })

    renderOverview()

    expect(
      screen.queryByRole("button", {
        name: "optionsOverview:configurationOverview.open",
      }),
    ).not.toBeInTheDocument()
  })

  it("surfaces product risk announcements and opens the header popover request", async () => {
    const dismiss = vi.fn()
    useOptionsOverviewDataMock.mockReturnValue({
      isLoading: false,
      error: null,
      viewModel: setupViewModel,
      reload: vi.fn(),
    })
    useProductAnnouncementsMock.mockReturnValue({
      state: {
        view: {
          notices: [riskNotice],
          activeNotices: [
            riskNotice,
            { ...riskNotice, id: "info", severity: "info" },
            { ...riskNotice, id: "dismissed", dismissed: true },
            { ...riskNotice, id: "critical", severity: "critical" },
          ],
          dismissedNotices: [
            { ...riskNotice, id: "dismissed", dismissed: true },
          ],
          primaryRiskNotice: riskNotice,
          unseenActiveCount: 1,
        },
      },
      isLoading: false,
      reload: vi.fn(),
      markSeen: vi.fn().mockResolvedValue(true),
      dismiss,
    })

    renderOverview()

    expect(screen.getByText("Risk notice")).toBeVisible()
    expect(
      screen.getByText("productAnnouncements:summary.additional_one"),
    ).toBeVisible()

    await userEvent.click(
      screen.getByRole("button", {
        name: "productAnnouncements:actions.viewAll",
      }),
    )
    await userEvent.click(
      screen.getByRole("button", {
        name: "productAnnouncements:actions.dismiss",
      }),
    )

    expect(dismiss).toHaveBeenCalledWith("risk", 1)
  })

  it("opens permissions onboarding from Overview URL state", async () => {
    useOptionsOverviewDataMock.mockReturnValue({
      isLoading: false,
      error: null,
      viewModel: setupViewModel,
      reload: vi.fn(),
    })

    renderOverview()

    expect(
      screen.queryByTestId("permission-onboarding"),
    ).not.toBeInTheDocument()

    act(() => {
      window.history.replaceState(
        null,
        "",
        "/?onboarding=permissions&reason=debug#overview",
      )
      window.dispatchEvent(new Event("hashchange"))
    })

    expect(
      await screen.findByTestId("permission-onboarding"),
    ).toHaveTextContent("debug")
  })

  it("ignores permissions onboarding URL state outside the Overview route", () => {
    window.history.replaceState(
      null,
      "",
      "/?onboarding=permissions&reason=debug#basic",
    )

    expect(getPermissionsOnboardingReasonFromUrl()).toBeNull()
  })

  it("ignores non-permissions onboarding modes on the Overview route", () => {
    window.history.replaceState(null, "", "/?onboarding=tour#overview")

    expect(getPermissionsOnboardingReasonFromUrl()).toBeNull()
  })

  it("treats missing browser globals as no permissions onboarding state", () => {
    const originalWindow = globalThis.window

    vi.stubGlobal("window", undefined)

    try {
      expect(getPermissionsOnboardingReasonFromUrl()).toBeNull()
    } finally {
      vi.stubGlobal("window", originalWindow)
    }
  })

  it("closes permissions onboarding, records the current optional permissions, and cleans the URL", async () => {
    const user = userEvent.setup()
    useOptionsOverviewDataMock.mockReturnValue({
      isLoading: false,
      error: null,
      viewModel: setupViewModel,
      reload: vi.fn(),
    })
    window.history.replaceState(
      null,
      "",
      "/?onboarding=permissions&reason=debug#overview",
    )

    renderOverview()

    await user.click(screen.getByRole("button", { name: "close" }))

    expect(
      screen.queryByTestId("permission-onboarding"),
    ).not.toBeInTheDocument()
    expect(setLastSeenOptionalPermissionsMock).toHaveBeenCalledTimes(1)
    expect(window.location.search).toBe("")
    expect(window.location.hash).toBe("#overview")
  })

  it("keeps overview status surfaces compact without repeated helper copy", () => {
    useOptionsOverviewDataMock.mockReturnValue({
      isLoading: false,
      error: null,
      viewModel: setupViewModel,
      reload: vi.fn(),
    })

    renderOverview()

    const statusSummary = screen.getByTestId(
      OPTIONS_OVERVIEW_TEST_IDS.statusSummary,
    )

    expect(statusSummary).toHaveTextContent(
      "optionsOverview:status.accounts.label",
    )
    expect(
      screen.queryByText("optionsOverview:sections.statusSummary"),
    ).not.toBeInTheDocument()
    expect(statusSummary).not.toHaveTextContent(
      "optionsOverview:status.accounts.description",
    )
    expect(statusSummary).not.toHaveTextContent(
      "optionsOverview:status.attention.description",
    )
    expect(
      screen.queryByText(
        "optionsOverview:configurationOverview.accountFoundation.summary",
      ),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText(
        "optionsOverview:configurationOverview.automation.summary",
      ),
    ).not.toBeInTheDocument()
  })

  it("presents recent usage as a full-width trend summary", () => {
    useOptionsOverviewDataMock.mockReturnValue({
      isLoading: false,
      error: null,
      viewModel: {
        ...setupViewModel,
        usageSnapshot: {
          ...setupViewModel.usageSnapshot,
          todayRequests: 363,
          todayTokens: 171_500,
          todayCostText: "108,808,400",
          sevenDayRequests: 1089,
          sevenDayTokens: 514_500,
          hasUsageData: true,
        },
      },
      reload: vi.fn(),
    })

    renderOverview()

    const recentUsageRegion = screen.getByTestId(
      OPTIONS_OVERVIEW_TEST_IDS.recentUsage,
    )
    expect(recentUsageRegion.closest("section")).toHaveClass("xl:col-span-3")
    expect(
      screen.getByText("optionsOverview:usage.activityMix"),
    ).toBeInTheDocument()
    expect(
      screen.getByText("optionsOverview:usage.todayShare"),
    ).toBeInTheDocument()
  })

  it("presents no usage data as a quiet empty state instead of zero-heavy trends", () => {
    useOptionsOverviewDataMock.mockReturnValue({
      isLoading: false,
      error: null,
      viewModel: setupViewModel,
      reload: vi.fn(),
    })

    renderOverview()

    expect(screen.getByText("optionsOverview:usage.empty.title")).toBeVisible()
    expect(
      screen.getByText("optionsOverview:usage.empty.description"),
    ).toBeVisible()
    expect(
      screen.queryByText("optionsOverview:usage.activityMix"),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText("optionsOverview:usage.requestShare"),
    ).not.toBeInTheDocument()
  })

  it("navigates configuration overview subitems to their own targets", async () => {
    const user = userEvent.setup()
    useOptionsOverviewDataMock.mockReturnValue({
      isLoading: false,
      error: null,
      viewModel: setupViewModel,
      reload: vi.fn(),
    })

    renderOverview()

    const apiProfilesButton = screen.getByRole("button", {
      name: "optionsOverview:configurationOverview.subItems.apiProfiles",
    })

    expect(apiProfilesButton).toHaveAttribute("data-slot", "button")
    expect(hasWorkflowTransitionIcon(apiProfilesButton)).toBe(true)

    await user.click(apiProfilesButton)

    expect(pushWithinOptionsPageMock).toHaveBeenCalledWith(
      "#apiCredentialProfiles",
      {},
    )

    await user.click(
      screen.getByRole("button", {
        name: "optionsOverview:configurationOverview.subItems.autoCheckin",
      }),
    )

    expect(pushWithinOptionsPageMock).toHaveBeenCalledWith("#basic", {
      anchor: SETTINGS_ANCHORS.AUTO_CHECKIN,
      highlight: SETTINGS_ANCHORS.AUTO_CHECKIN,
    })
  })

  it("navigates account attention items through the account search route", async () => {
    const user = userEvent.setup()
    useOptionsOverviewDataMock.mockReturnValue({
      isLoading: false,
      error: null,
      viewModel: setupViewModel,
      reload: vi.fn(),
    })

    renderOverview()

    await user.click(
      screen.getByRole("button", {
        name: "optionsOverview:actions.open: optionsOverview:attention.accountUnhealthy.title",
      }),
    )

    expect(pushWithinOptionsPageMock).toHaveBeenCalledWith("#account", {
      search: "unhealthy-account",
    })
  })

  it("tracks dashboard navigation without exposing raw route params", async () => {
    const user = userEvent.setup()
    useOptionsOverviewDataMock.mockReturnValue({
      isLoading: false,
      error: null,
      viewModel: setupViewModel,
      reload: vi.fn(),
    })

    renderOverview()

    await user.click(
      screen.getByRole("button", {
        name: "optionsOverview:actions.open: optionsOverview:attention.accountUnhealthy.title",
      }),
    )

    expect(trackProductAnalyticsEvent).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_EVENTS.FeatureActionCompleted,
      {
        feature_id: PRODUCT_ANALYTICS_FEATURE_IDS.OptionsOverview,
        action_id: PRODUCT_ANALYTICS_ACTION_IDS.OpenOptionsOverviewTarget,
        surface_id: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsOverviewAttentionList,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
        result: PRODUCT_ANALYTICS_RESULTS.Success,
        target_kind: PRODUCT_ANALYTICS_TARGET_KINDS.OptionsPage,
        target_page_id: MENU_ITEM_IDS.ACCOUNT,
        route_params_present: true,
      },
    )
    expect(trackProductAnalyticsEventMock).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        search: "unhealthy-account",
      }),
    )
  })

  it("uses the shared workflow transition affordance for overview navigation", async () => {
    const user = userEvent.setup()
    useOptionsOverviewDataMock.mockReturnValue({
      isLoading: false,
      error: null,
      viewModel: setupViewModel,
      reload: vi.fn(),
    })

    renderOverview()

    expect(
      hasWorkflowTransitionIcon(
        getButtonContainingText("optionsOverview:status.accounts.label"),
      ),
    ).toBe(true)
    expect(
      getButtonContainingText("optionsOverview:status.accounts.label"),
    ).toHaveAttribute("data-slot", "button")
    expect(
      hasWorkflowTransitionIcon(
        screen.getByRole("button", {
          name: "optionsOverview:actions.open: optionsOverview:attention.addAccount.title",
        }),
      ),
    ).toBe(true)
    expect(
      hasWorkflowTransitionIcon(
        screen.getByRole("button", {
          name: "optionsOverview:actions.open",
        }),
      ),
    ).toBe(true)
    expect(
      hasWorkflowTransitionIcon(
        screen.getAllByRole("button", {
          name: "optionsOverview:automation.openItem",
        })[0],
      ),
    ).toBe(true)

    await user.click(
      screen.getByRole("button", {
        name: "optionsOverview:automation.items.siteAnnouncements.label",
      }),
    )

    expect(
      hasWorkflowTransitionIcon(
        screen.getByRole("button", {
          name: "optionsOverview:automation.items.siteAnnouncements.openPage",
        }),
      ),
    ).toBe(true)

    await user.click(
      screen.getByRole("button", {
        name: "optionsOverview:automation.items.autoCheckin.label",
      }),
    )

    expect(
      hasWorkflowTransitionIcon(
        screen.getByRole("button", {
          name: "optionsOverview:autoCheckin.actions.open",
        }),
      ),
    ).toBe(true)
  })

  it("keeps the attention list vertically scrollable without horizontal overflow", () => {
    useOptionsOverviewDataMock.mockReturnValue({
      isLoading: false,
      error: null,
      viewModel: setupViewModel,
      reload: vi.fn(),
    })

    renderOverview()

    const attentionRegion = screen.getByTestId(
      OPTIONS_OVERVIEW_TEST_IDS.needsAttention,
    )
    const attentionCard = attentionRegion.firstElementChild

    expect(attentionCard).toHaveClass(
      "max-h-[28rem]",
      "overflow-x-hidden",
      "overflow-y-auto",
    )
    expect(attentionCard).not.toHaveClass("overscroll-contain")
    expect(
      screen.getByText("optionsOverview:attention.addAccount.description"),
    ).toHaveClass("line-clamp-2", "break-words")
    expect(
      screen.getByText("optionsOverview:attention.addAccount.description"),
    ).toHaveAttribute(
      "title",
      "optionsOverview:attention.addAccount.description",
    )
  })

  it("renders automation overview with rows collapsed until expanded", async () => {
    const user = userEvent.setup()
    useOptionsOverviewDataMock.mockReturnValue({
      isLoading: false,
      error: null,
      viewModel: setupViewModel,
      reload: vi.fn(),
    })

    renderOverview()

    const automationRegion = screen.getByTestId(
      OPTIONS_OVERVIEW_TEST_IDS.automationOverview,
    )
    const automationCard = automationRegion.firstElementChild
    const automationRows = automationCard?.firstElementChild

    expect(automationRows).toHaveClass("overflow-y-auto")
    expect(automationRows).not.toHaveClass("overscroll-contain")

    const autoCheckinTrigger = screen.getByRole("button", {
      name: "optionsOverview:automation.items.autoCheckin.label",
    })
    expect(autoCheckinTrigger).toHaveClass("font-medium")
    expect(autoCheckinTrigger).toHaveClass(
      "flex-1",
      "px-3",
      "py-2.5",
      "hover:bg-slate-100/70",
    )
    expect(autoCheckinTrigger).toHaveAttribute("aria-expanded", "false")
    expect(
      screen.queryByText("optionsOverview:autoCheckin.metrics.success"),
    ).not.toBeInTheDocument()

    const siteAnnouncementsTrigger = screen.getByRole("button", {
      name: "optionsOverview:automation.items.siteAnnouncements.label",
    })
    expect(siteAnnouncementsTrigger).toHaveAttribute("aria-expanded", "false")
    expect(siteAnnouncementsTrigger).toHaveClass("items-center")

    await user.click(autoCheckinTrigger)

    expect(
      screen.getByText("optionsOverview:autoCheckin.metrics.success"),
    ).toBeVisible()

    await user.click(
      screen.getByRole("button", {
        name: "optionsOverview:autoCheckin.actions.retryFailed",
      }),
    )

    expect(pushWithinOptionsPageMock).toHaveBeenCalledWith(
      `#${MENU_ITEM_IDS.AUTO_CHECKIN}`,
      {},
    )

    await user.click(siteAnnouncementsTrigger)

    expect(
      screen.getByText(
        "optionsOverview:automation.items.siteAnnouncements.records",
      ),
    ).toBeVisible()
    expect(
      screen.getByText(
        "optionsOverview:automation.items.siteAnnouncements.unread",
      ),
    ).toBeVisible()

    await user.click(
      screen.getByRole("button", {
        name: "optionsOverview:automation.items.siteAnnouncements.openPage",
      }),
    )

    expect(pushWithinOptionsPageMock).toHaveBeenCalledWith(
      `#${MENU_ITEM_IDS.SITE_ANNOUNCEMENTS}`,
      {},
    )

    await user.click(
      screen.getByRole("button", {
        name: "optionsOverview:automation.items.webdavAutoSync.label",
      }),
    )

    await user.click(
      screen.getByRole("button", {
        name: "optionsOverview:automation.items.webdavAutoSync.open",
      }),
    )

    expect(pushWithinOptionsPageMock).toHaveBeenCalledWith(
      `#${MENU_ITEM_IDS.IMPORT_EXPORT}`,
      {
        anchor: WEBDAV_AUTO_SYNC_TARGET_IDS.root,
        highlight: WEBDAV_AUTO_SYNC_TARGET_IDS.root,
      },
    )
  })

  it("explains disabled automation and not-run automation states after expansion", async () => {
    const user = userEvent.setup()
    useOptionsOverviewDataMock.mockReturnValue({
      isLoading: false,
      error: null,
      viewModel: {
        ...setupViewModel,
        automationOverview: {
          items: [
            {
              id: "autoCheckin",
              status: "info",
              statusLabel: "enabled",
              primaryTarget: { menuItemId: MENU_ITEM_IDS.AUTO_CHECKIN },
              summaryRows: [
                { id: "lastRun", value: "", valueType: "datetime" },
                { id: "nextRun", value: "", valueType: "datetime" },
              ],
              actions: [
                {
                  id: "openAutoCheckin",
                  target: { menuItemId: MENU_ITEM_IDS.AUTO_CHECKIN },
                },
              ],
              defaultExpanded: false,
              autoCheckinPanel: {
                status: "not_run",
                severity: "info",
                totalEligible: 0,
                executed: 0,
                successCount: 0,
                failedCount: 0,
                skippedCount: 0,
                needsRetry: false,
                actions: [
                  {
                    id: "openAutoCheckin",
                    target: { menuItemId: MENU_ITEM_IDS.AUTO_CHECKIN },
                    isVisible: true,
                  },
                ],
              },
            },
            {
              id: "webdavAutoSync",
              status: "info",
              statusLabel: "disabled",
              primaryTarget: {
                menuItemId: MENU_ITEM_IDS.IMPORT_EXPORT,
                params: {
                  anchor: WEBDAV_AUTO_SYNC_TARGET_IDS.root,
                  highlight: WEBDAV_AUTO_SYNC_TARGET_IDS.root,
                },
              },
              summaryRows: [
                { id: "interval", value: "" },
                { id: "strategy", value: "" },
                { id: "domains", value: "0" },
              ],
              actions: [
                {
                  id: "openImportExport",
                  target: {
                    menuItemId: MENU_ITEM_IDS.IMPORT_EXPORT,
                    params: {
                      anchor: WEBDAV_AUTO_SYNC_TARGET_IDS.root,
                      highlight: WEBDAV_AUTO_SYNC_TARGET_IDS.root,
                    },
                  },
                },
              ],
              defaultExpanded: false,
            },
          ],
        },
      },
      reload: vi.fn(),
    })

    renderOverview()

    await user.click(
      screen.getByRole("button", {
        name: "optionsOverview:automation.items.autoCheckin.label",
      }),
    )

    expect(
      screen.getByText("optionsOverview:autoCheckin.empty.notRun.description"),
    ).toBeVisible()

    await user.click(
      screen.getByRole("button", {
        name: "optionsOverview:automation.items.webdavAutoSync.label",
      }),
    )

    expect(
      screen.getByText(
        "optionsOverview:automation.empty.webdavAutoSync.disabled",
      ),
    ).toBeVisible()
  })

  it("adds status-specific guidance to configuration overview cards", () => {
    useOptionsOverviewDataMock.mockReturnValue({
      isLoading: false,
      error: null,
      viewModel: setupViewModel,
      reload: vi.fn(),
    })

    renderOverview()

    expect(
      screen.getByText(
        "optionsOverview:configurationOverview.accountFoundation.state.needs_setup",
      ),
    ).toBeVisible()
    expect(
      screen.getByText(
        "optionsOverview:configurationOverview.automation.state.disabled",
      ),
    ).toBeVisible()
  })

  it("renders partial error state with retry", async () => {
    const reload = vi.fn()
    useOptionsOverviewDataMock.mockReturnValue({
      isLoading: false,
      error: "load failed",
      viewModel: setupViewModel,
      reload,
    })

    renderOverview()

    await userEvent.click(
      screen.getByRole("button", { name: "common:actions.retry" }),
    )
    expect(reload).toHaveBeenCalledTimes(1)
    expect(trackProductAnalyticsEvent).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_EVENTS.FeatureActionCompleted,
      {
        feature_id: PRODUCT_ANALYTICS_FEATURE_IDS.OptionsOverview,
        action_id: PRODUCT_ANALYTICS_ACTION_IDS.RefreshOptionsOverviewData,
        surface_id: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsOverviewStatusSummary,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
        result: PRODUCT_ANALYTICS_RESULTS.Success,
      },
    )
  })
})

function renderOverview() {
  return render(<OptionsOverview />, {
    withReleaseUpdateStatusProvider: false,
    withThemeProvider: false,
    withUserPreferencesProvider: false,
  })
}

function hasWorkflowTransitionIcon(element: HTMLElement) {
  return (
    element.querySelector("[data-workflow-transition-icon='true']") !== null
  )
}

function getButtonContainingText(text: string) {
  const button = screen
    .getAllByRole("button")
    .find((element) => element.textContent?.includes(text))

  if (!button) {
    throw new Error(`Unable to find button containing text: ${text}`)
  }

  return button
}
