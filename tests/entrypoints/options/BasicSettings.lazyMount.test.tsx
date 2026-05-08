import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import BasicSettings from "~/features/BasicSettings/BasicSettings"
import { act, render, screen, waitFor } from "~~/tests/test-utils/render"

const { mockedUseUserPreferencesContext } = vi.hoisted(() => ({
  mockedUseUserPreferencesContext: vi.fn(),
}))

vi.mock("~/contexts/UserPreferencesContext", async (importOriginal) => {
  const actual =
    (await importOriginal()) as typeof import("~/contexts/UserPreferencesContext")

  return {
    ...actual,
    UserPreferencesProvider: ({ children }: { children: ReactNode }) =>
      children,
    useUserPreferencesContext: () => mockedUseUserPreferencesContext(),
  }
})

vi.mock("~/components/PageHeader", () => ({
  PageHeader: ({
    title,
    description,
  }: {
    title: string
    description: string
  }) => (
    <div data-testid="page-header">
      <h1>{title}</h1>
      <p>{description}</p>
    </div>
  ),
}))

vi.mock("~/features/BasicSettings/components/shared/LoadingSkeleton", () => ({
  default: () => <div data-testid="loading-skeleton" />,
}))

vi.mock(
  "~/features/BasicSettings/components/dialogs/PermissionOnboardingDialog",
  () => ({
    PermissionOnboardingDialog: () => (
      <div data-testid="permission-onboarding" />
    ),
  }),
)

vi.mock("~/features/BasicSettings/components/tabs/General/GeneralTab", () => ({
  default: () => <div data-testid="general-tab-content" />,
}))

vi.mock(
  "~/features/BasicSettings/components/tabs/Notifications/NotificationsTab",
  () => ({
    default: () => <div data-testid="notifications-tab-content" />,
  }),
)

vi.mock(
  "~/features/BasicSettings/components/tabs/AccountManagement/AccountManagementTab",
  () => ({
    default: () => <div data-testid="account-management-tab-content" />,
  }),
)

vi.mock(
  "~/features/BasicSettings/components/tabs/Refresh/AutoRefreshTab",
  () => ({
    default: () => <div data-testid="refresh-tab-content" />,
  }),
)

vi.mock(
  "~/features/BasicSettings/components/tabs/CheckinRedeem/CheckinRedeemTab",
  () => ({
    default: () => <div data-testid="checkin-redeem-tab-content" />,
  }),
)

vi.mock(
  "~/features/BasicSettings/components/tabs/BalanceHistory/BalanceHistoryTab",
  () => ({
    default: () => <div data-testid="balance-history-tab-content" />,
  }),
)

vi.mock(
  "~/features/BasicSettings/components/tabs/UsageHistorySync/UsageHistorySyncTab",
  () => ({
    default: () => <div data-testid="account-usage-tab-content" />,
  }),
)

vi.mock(
  "~/features/BasicSettings/components/tabs/WebAiApiCheck/WebAiApiCheckTab",
  () => ({
    default: () => <div data-testid="web-ai-api-check-tab-content" />,
  }),
)

vi.mock(
  "~/features/BasicSettings/components/tabs/ManagedSite/ManagedSiteTab",
  () => ({
    default: () => <div data-testid="managed-site-tab-content" />,
  }),
)

vi.mock(
  "~/features/BasicSettings/components/tabs/CliProxy/CliProxyTab",
  () => ({
    default: () => <div data-testid="cli-proxy-tab-content" />,
  }),
)

vi.mock(
  "~/features/BasicSettings/components/tabs/ClaudeCodeRouter/ClaudeCodeRouterTab",
  () => ({
    default: () => <div data-testid="claude-code-router-tab-content" />,
  }),
)

vi.mock(
  "~/features/BasicSettings/components/tabs/Permissions/PermissionsTab",
  () => ({
    default: () => <div data-testid="permissions-tab-content" />,
  }),
)

vi.mock(
  "~/features/BasicSettings/components/tabs/DataBackup/DataBackupTab",
  () => ({
    default: () => <div data-testid="data-backup-tab-content" />,
  }),
)

const TAB_LABEL_WIDTHS: Record<string, number> = {
  "settings:tabs.general": 80,
  "settings:tabs.notifications": 80,
  "settings:tabs.accountManagement": 80,
  "settings:tabs.refresh": 80,
  "settings:tabs.checkinRedeem": 80,
  "settings:tabs.balanceHistory": 80,
  "settings:tabs.accountUsage": 80,
  "settings:tabs.webAiApiCheck": 80,
  "settings:tabs.managedSite": 220,
  "settings:tabs.cliProxy": 80,
  "settings:tabs.claudeCodeRouter": 80,
  "settings:tabs.permissions": 80,
  "settings:tabs.dataBackup": 80,
  "common:actions.more": 90,
}

class MockResizeObserver {
  static instances: MockResizeObserver[] = []

  callback: ResizeObserverCallback

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback
    MockResizeObserver.instances.push(this)
  }

  observe = vi.fn()
  disconnect = vi.fn()
  unobserve = vi.fn()

  trigger() {
    this.callback([], this as unknown as ResizeObserver)
  }

  static reset() {
    MockResizeObserver.instances = []
  }
}

function createRect(width: number): DOMRect {
  return {
    width,
    height: 32,
    top: 0,
    right: width,
    bottom: 32,
    left: 0,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect
}

function stubDesktopTabMeasurements() {
  return vi
    .spyOn(HTMLElement.prototype, "getBoundingClientRect")
    .mockImplementation(function (this: HTMLElement) {
      if (this.tagName !== "BUTTON") {
        return createRect(0)
      }

      const label = this.textContent?.replace(/\s+/g, " ").trim() ?? ""
      return createRect(TAB_LABEL_WIDTHS[label] ?? 80)
    })
}

function configureDesktopTabOverflow(
  container: HTMLElement,
  clientWidth = 360,
) {
  const desktopTabsContainer = Array.from(
    container.querySelectorAll("div"),
  ).find(
    (element) =>
      typeof element.className === "string" &&
      element.className.includes("relative -mb-px hidden items-center"),
  )

  expect(desktopTabsContainer).toBeTruthy()

  Object.defineProperty(desktopTabsContainer!, "clientWidth", {
    configurable: true,
    value: clientWidth,
  })

  act(() => {
    for (const observer of MockResizeObserver.instances) {
      observer.trigger()
    }
  })
}

describe("BasicSettings tab mounting", () => {
  beforeEach(() => {
    mockedUseUserPreferencesContext.mockReset()
    mockedUseUserPreferencesContext.mockReturnValue({
      isLoading: false,
    })
    window.history.replaceState(null, "", "/")
    MockResizeObserver.reset()
    vi.stubGlobal("ResizeObserver", MockResizeObserver)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    MockResizeObserver.reset()
  })

  it("mounts only the active tab until a tab is visited", async () => {
    const user = userEvent.setup()

    render(<BasicSettings />, { withReleaseUpdateStatusProvider: false })

    expect(screen.getByTestId("general-tab-content")).toBeInTheDocument()
    expect(
      screen.queryByTestId("managed-site-tab-content"),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByTestId("notifications-tab-content"),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByTestId("data-backup-tab-content"),
    ).not.toBeInTheDocument()

    await user.click(
      screen.getByRole("tab", { name: "settings:tabs.managedSite" }),
    )

    expect(
      await screen.findByTestId("managed-site-tab-content"),
    ).toBeInTheDocument()
    expect(
      screen.queryByTestId("data-backup-tab-content"),
    ).not.toBeInTheDocument()

    await user.click(screen.getByRole("tab", { name: "settings:tabs.general" }))

    expect(screen.getByTestId("general-tab-content")).toBeInTheDocument()
    expect(screen.getByTestId("managed-site-tab-content")).toBeInTheDocument()
    expect(
      screen.queryByTestId("notifications-tab-content"),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByTestId("data-backup-tab-content"),
    ).not.toBeInTheDocument()
  })

  it("seeds the selected and mounted notifications tab from the URL tab parameter", async () => {
    window.history.replaceState(null, "", "/?tab=notifications#basic")

    render(<BasicSettings />, { withReleaseUpdateStatusProvider: false })

    expect(
      await screen.findByTestId("notifications-tab-content"),
    ).toBeInTheDocument()
    expect(screen.queryByTestId("general-tab-content")).not.toBeInTheDocument()
  })

  it("maps notification anchors to the notifications tab", async () => {
    window.history.replaceState(null, "", "/#task-notifications")

    render(<BasicSettings />, { withReleaseUpdateStatusProvider: false })

    expect(
      await screen.findByTestId("notifications-tab-content"),
    ).toBeInTheDocument()
    expect(screen.queryByTestId("general-tab-content")).not.toBeInTheDocument()
  })

  it("keeps site announcement anchors on the general tab", async () => {
    window.history.replaceState(null, "", "/#site-announcement-notifications")

    render(<BasicSettings />, { withReleaseUpdateStatusProvider: false })

    expect(await screen.findByTestId("general-tab-content")).toBeInTheDocument()
    expect(
      screen.queryByTestId("notifications-tab-content"),
    ).not.toBeInTheDocument()
  })

  it("seeds the selected and mounted tab from the URL tab parameter", async () => {
    window.history.replaceState(null, "", "/?tab=managedSite#basic")

    render(<BasicSettings />, { withReleaseUpdateStatusProvider: false })

    expect(
      await screen.findByTestId("managed-site-tab-content"),
    ).toBeInTheDocument()
    expect(screen.queryByTestId("general-tab-content")).not.toBeInTheDocument()
  })

  it("keeps the current page visible during subsequent preference reloads", async () => {
    const { rerender } = render(<BasicSettings />, {
      withReleaseUpdateStatusProvider: false,
    })

    expect(screen.getByTestId("page-header")).toBeInTheDocument()
    expect(screen.getByTestId("general-tab-content")).toBeInTheDocument()

    mockedUseUserPreferencesContext.mockReturnValue({
      isLoading: true,
    })

    rerender(<BasicSettings />)

    expect(screen.getByTestId("page-header")).toBeInTheDocument()
    expect(screen.getByTestId("general-tab-content")).toBeInTheDocument()
    expect(screen.queryByTestId("loading-skeleton")).not.toBeInTheDocument()
  })

  it("keeps the selected desktop tab visible when it is wider than the last fitted tab", async () => {
    stubDesktopTabMeasurements()
    window.history.replaceState(null, "", "/?tab=managedSite#basic")

    const { container } = render(<BasicSettings />, {
      withReleaseUpdateStatusProvider: false,
    })
    configureDesktopTabOverflow(container)

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "settings:tabs.managedSite" }),
      ).toHaveAttribute("aria-pressed", "true")
    })

    expect(
      screen.queryByRole("button", { name: "settings:tabs.general" }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "common:actions.more" }),
    ).toBeInTheDocument()
  })

  it("moves overflowed tabs into the desktop more menu and selects them from there", async () => {
    stubDesktopTabMeasurements()
    const user = userEvent.setup()

    const { container } = render(<BasicSettings />, {
      withReleaseUpdateStatusProvider: false,
    })
    configureDesktopTabOverflow(container)

    expect(
      screen.queryByRole("button", { name: "settings:tabs.managedSite" }),
    ).not.toBeInTheDocument()

    await user.click(
      screen.getByRole("button", { name: "common:actions.more" }),
    )
    await user.click(
      await screen.findByRole("menuitem", {
        name: "settings:tabs.managedSite",
      }),
    )

    expect(
      await screen.findByTestId("managed-site-tab-content"),
    ).toBeInTheDocument()
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "settings:tabs.managedSite" }),
      ).toHaveAttribute("aria-pressed", "true")
    })
  })
})
